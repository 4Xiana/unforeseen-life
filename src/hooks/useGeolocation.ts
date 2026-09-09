import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export interface GeoCoords {
  lat: number;
  lon: number;
  /** 米；GeolocationPosition.coords.accuracy */
  accuracy?: number;
}

export interface GeolocationApi {
  /** 浏览器是否支持定位（不支持时调用方隐藏入口） */
  supported: boolean;
  status: GeoStatus;
  /** 最近一次定位坐标（watch 持续刷新）；未授权/未请求时为 null */
  coords: GeoCoords | null;
  /** 最近一次错误的中文提示 */
  error: string | null;
  /** 请求定位授权并开始持续监听；已监听时重复调用会先清旧 watch 再重开 */
  request: () => void;
}

/**
 * 定位 hook：封装浏览器原生 navigator.geolocation。
 * - 用 watchPosition 持续拿坐标（低精度、省电），授权后坐标随移动自动刷新，
 *   发消息时读最新一份随请求上行，后端据此解析城市/天气并默认注入上下文；
 * - 权限拒绝/不可用/超时都给出中文原因，status 驱动 header 徽章的可见状态；
 * - 卸载时 clearWatch，避免离开页面后定位指示还亮着。
 */
export function useGeolocation(): GeolocationApi {
  const supportedRef = useRef<boolean>(
    typeof navigator !== 'undefined' && 'geolocation' in navigator,
  );
  const supported = supportedRef.current;

  const [status, setStatus] = useState<GeoStatus>(supported ? 'idle' : 'unavailable');
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const coordsRef = useRef<GeoCoords | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && supported) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {
        /* noop */
      }
    }
    watchIdRef.current = null;
  }, [supported]);

  useEffect(() => clearWatch, [clearWatch]);

  const request = useCallback(() => {
    if (!supported) {
      setStatus('unavailable');
      return;
    }
    clearWatch();
    setStatus('requesting');
    setError(null);

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const next: GeoCoords = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          coordsRef.current = next;
          setCoords(next);
          setStatus('granted');
          setError(null);
        },
        (err) => {
          // PERMISSION_DENIED 会终止监听；POSITION_UNAVAILABLE/TIMEOUT 浏览器仍会重试，
          // 但先把可见状态置为 denied 并给出原因，玩家点徽章可重新发起请求。
          coordsRef.current = null;
          setCoords(null);
          setStatus('denied');
          if (err.code === err.PERMISSION_DENIED) {
            setError('定位权限被拒绝了，可点浏览器地址栏的定位图标重新开启');
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setError('暂时没法定到你的位置，点这里再试一次');
          } else {
            setError('定位超时了，点这里再试一次');
          }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    } catch {
      setStatus('denied');
      setError('定位启动失败，点这里再试一次');
    }
  }, [supported, clearWatch]);

  return { supported, status, coords, error, request };
}
