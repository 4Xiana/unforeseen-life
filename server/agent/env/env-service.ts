/**
 * 玩家实时环境服务：浏览器定位坐标 → 逆地理（城市/区县）+ 实时天气。
 *
 * 数据源全部免费、无需 API key（密钥只属于后端 LLM，定位/天气不引入新密钥）：
 * - 逆地理：BigDataCloud reverse-geocode-client（客户端级免费端点，中文 localityLanguage=zh）
 * - 天气：Open-Meteo /v1/forecast（WMO weather code，current 实况）
 *
 * 设计原则：
 * - 定位/天气是"锦上添花"的上下文，任何外部失败都降级（只返回坐标或 null），绝不阻断对话；
 * - 按约 1km 网格 + 10 分钟 TTL 缓存，避免每条消息都打外部 API；
 * - fetch 带 8s 超时，两个请求并行、互不影响（一个失败另一个照样返回）。
 */

export interface GeoPoint {
  lat: number;
  lon: number;
  /** 米；浏览器 GeolocationPosition.coords.accuracy */
  accuracy?: number;
}

export interface WeatherInfo {
  /** 中文天气现象，如"晴"、"小雨"、"雷暴" */
  text: string;
  tempC: number;
  feelsLikeC?: number;
  humidityPct?: number;
  windKmh?: number;
}

export interface EnvContext {
  lat: number;
  lon: number;
  city?: string;
  district?: string;
  province?: string;
  weather?: WeatherInfo;
  /** 观测时间（ISO，来自天气提供方的本地时区时间） */
  observedAt?: string;
  /** 数据获取时间（服务端） */
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const cache = new Map<string, { env: EnvContext; expires: number }>();

function cacheKey(geo: GeoPoint): string {
  // 约 1.1km 网格：相邻定位点共享一份环境，减少抖动与外部调用
  return `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`;
}

export function isValidGeo(v: unknown): v is GeoPoint {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.lat === 'number' && Number.isFinite(g.lat) &&
    typeof g.lon === 'number' && Number.isFinite(g.lon) &&
    g.lat >= -90 && g.lat <= 90 && g.lon >= -180 && g.lon <= 180
  );
}

/** 从请求体（JSON 或 FormData 字符串）里解析并校验坐标 */
export function parseGeo(raw: unknown): GeoPoint | undefined {
  if (!raw) return undefined;
  let candidate = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  return isValidGeo(candidate) ? { lat: candidate.lat, lon: candidate.lon, accuracy: candidate.accuracy } : undefined;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'unforeseen-life/1.0' } });
  } finally {
    clearTimeout(timer);
  }
}

// WMO Weather interpretation codes（Open-Meteo）→ 中文
function wmoText(code: number): string {
  const map: Record<number, string> = {
    0: '晴',
    1: '晴间多云',
    2: '多云',
    3: '阴',
    45: '雾',
    48: '冻雾',
    51: '毛毛雨',
    53: '中等毛毛雨',
    55: '浓毛毛雨',
    56: '冻毛毛雨',
    57: '强冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '小阵雨',
    81: '阵雨',
    82: '强阵雨',
    85: '阵雪',
    86: '强阵雪',
    95: '雷暴',
    96: '雷暴伴小冰雹',
    99: '雷暴伴大冰雹',
  };
  return map[code] ?? '未知天气';
}

async function reverseGeocode(geo: GeoPoint): Promise<Pick<EnvContext, 'city' | 'district' | 'province'>> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${geo.lat}&longitude=${geo.lon}&localityLanguage=zh`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`reverse-geocode HTTP ${res.status}`);
  const data = (await res.json()) as {
    city?: string;
    locality?: string;
    principalSubdivision?: string;
    localityInfo?: Record<string, unknown>;
  };
  // BigDataCloud 在国内/乡镇常把城市名放在 locality；city 偶尔为空
  const city = data.city || data.locality || undefined;
  return {
    city,
    district: data.locality && data.locality !== city ? data.locality : undefined,
    province: data.principalSubdivision || undefined,
  };
}

async function fetchWeather(geo: GeoPoint): Promise<WeatherInfo & { observedAt?: string }> {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${geo.lat}&longitude=${geo.lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
    + '&timezone=auto';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      time?: string;
    };
  };
  const cur = data.current;
  if (!cur || typeof cur.temperature_2m !== 'number') throw new Error('open-meteo empty current');
  return {
    text: wmoText(cur.weather_code ?? -1),
    tempC: Math.round(cur.temperature_2m),
    feelsLikeC: typeof cur.apparent_temperature === 'number' ? Math.round(cur.apparent_temperature) : undefined,
    humidityPct: cur.relative_humidity_2m,
    windKmh: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : undefined,
    observedAt: cur.time,
  };
}

/**
 * 解析玩家此刻的环境（城市 + 天气）。带缓存；外部服务失败时逐级降级，
 * 最差返回只含坐标的 EnvContext（调用方据此决定注入多少信息），不抛错。
 */
export async function resolveEnv(geo: GeoPoint): Promise<EnvContext> {
  const key = cacheKey(geo);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.env;

  const base: EnvContext = { lat: geo.lat, lon: geo.lon, fetchedAt: Date.now() };

  // 两个外部请求互不拖累：一个失败不影响另一个的结果
  const [geoResult, weatherResult] = await Promise.allSettled([
    reverseGeocode(geo),
    fetchWeather(geo),
  ]);

  if (geoResult.status === 'fulfilled') {
    base.city = geoResult.value.city;
    base.district = geoResult.value.district;
    base.province = geoResult.value.province;
  }
  if (weatherResult.status === 'fulfilled') {
    const { observedAt, ...weather } = weatherResult.value;
    base.weather = weather;
    base.observedAt = observedAt;
  }

  // 缓存：即使部分降级也缓存（TTL 短，下轮自然重试失败的部分）
  cache.set(key, { env: base, expires: Date.now() + CACHE_TTL_MS });
  return base;
}

/** 渲染成注入 system prompt 的结构化环境段落；无有效信息时返回 null */
export function renderEnvBrief(env: EnvContext | null | undefined): string | null {
  if (!env) return null;
  // 直辖市等场景 province 与 city 同名（如"北京市 · 北京市"），相邻去重
  const placeParts = [env.province, env.city, env.district].filter(Boolean) as string[];
  const place = placeParts.filter((p, i) => p !== placeParts[i - 1]).join(' · ');
  const lines: string[] = ['# 玩家此刻的环境（系统通过定位自动获取，每轮随定位刷新）'];
  if (place) {
    lines.push(`- 位置：${place}（坐标约 ${env.lat.toFixed(2)}, ${env.lon.toFixed(2)}）`);
  } else {
    lines.push(`- 位置：坐标约 ${env.lat.toFixed(2)}, ${env.lon.toFixed(2)}（未能解析出地名）`);
  }
  if (env.weather) {
    const w = env.weather;
    const parts = [`${w.text}`, `气温 ${w.tempC}°C`];
    if (w.feelsLikeC !== undefined) parts.push(`体感 ${w.feelsLikeC}°C`);
    if (w.humidityPct !== undefined) parts.push(`湿度 ${w.humidityPct}%`);
    if (w.windKmh !== undefined) parts.push(`风速 ${w.windKmh}km/h`);
    lines.push(`- 天气：${parts.join('，')}`);
  } else {
    lines.push('- 天气：暂未获取到（天气服务不可用）');
  }
  lines.push(
    '用法：构思和推荐支线时，把天气与位置当成现实约束——下雨/高温/大风/严寒优先室内或有遮蔽的玩法，晴好微风再优先户外；极端气温避开长时间暴晒或挨冻的选项；位置用于判断商圈/公园/场馆等资源的可得性。但绝不能像天气预报一样播报这些数据，要自然融进推荐里（如"这会儿外头正晒，先挑个屋里能玩的？"）。玩家未授权定位时本段不存在：不要追问位置、不要假装知道天气。',
  );
  return lines.join('\n');
}
