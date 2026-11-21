/**
 * 系统时间服务：给 Agent 提供"和玩家对话时的实时时间"。
 *
 * 与定位/天气不同，时间永远可用（无需玩家授权、不依赖外部 API），因此：
 * - 每轮无条件注入 system prompt 的 snapshot 层（见 renderTimeBrief）；
 * - 同时提供 get_current_time 工具，玩家主动问"几点/周几"时可取精确值。
 *
 * 时区显式固定 Asia/Shanghai（UTC+8，无夏令时）：产品面向中文玩家、
 * 场景都在国内，不依赖服务器本地时区（容器常为 UTC，直接 new Date().getHours()
 * 会差 8 小时）。
 */

const TIME_ZONE = 'Asia/Shanghai';
const TZ_OFFSET = '+08:00';

export interface TimeInfo {
  /** 上海时区 ISO-like 串：2026-09-09T15:30:00+08:00 */
  iso: string;
  /** 2026年9月9日 */
  date: string;
  /** 周三 */
  weekday: string;
  /** 15:30 */
  time: string;
  /** 时段：凌晨/早上/上午/中午/下午/傍晚/晚上/深夜 */
  period: string;
  isWeekend: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function periodOf(hour: number): string {
  if (hour < 5) return '凌晨';
  if (hour < 8) return '早上';
  if (hour < 11) return '上午';
  if (hour < 13) return '中午';
  if (hour < 17) return '下午';
  if (hour < 19) return '傍晚';
  if (hour < 23) return '晚上';
  return '深夜';
}

export function getCurrentTime(now: Date = new Date()): TimeInfo {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  // 个别环境 hour 会给 "24"，归一到 0
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekday = get('weekday'); // zh-CN short 形如"周三"

  return {
    iso: `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${TZ_OFFSET}`,
    date: `${year}年${month}月${day}日`,
    weekday,
    time: `${pad2(hour)}:${pad2(minute)}`,
    period: periodOf(hour),
    isWeekend: weekday === '周六' || weekday === '周日',
  };
}

/** 渲染成注入 system prompt 的时间段落（每轮重组装时调用，时间实时） */
export function renderTimeBrief(now: Date = new Date()): string {
  const t = getCurrentTime(now);
  const dayKind = t.isWeekend ? '周末' : '工作日';
  return [
    '# 当前时间',
    `现在是 ${t.date} ${t.weekday} ${t.time}（${t.period}，${dayKind}）。`,
    '用法：把时段和作息当成现实约束来构思支线——深夜/凌晨不推外出或喧闹玩法、优先家里安静放松的；饭点前后别安排太耗时的；工作日白天适合十几分钟的碎片玩法，晚上和周末才铺得开长任务、走远路。玩家没主动问时间，就绝不能像报时器一样念出"现在是几点/今天周几"，自然融进推荐里即可（如"这个点外头还晒，先屋里待会儿？"）。',
  ].join('\n');
}
