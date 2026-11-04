import { useCallback, useEffect, useRef, useState } from 'react';

// 浏览器原生 SpeechRecognition 的最小类型声明（TS DOM lib 对 webkit 前缀覆盖不全）
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_HINTS: Record<string, string> = {
  'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风后再试',
  'service-not-allowed': '麦克风服务不可用，请检查系统的麦克风权限',
  'no-speech': '没有听到声音，靠近一点再试一次',
  'audio-capture': '找不到麦克风设备，请检查麦克风连接',
  network: '语音识别服务网络异常，请稍后再试',
};

export interface SpeechInputApi {
  /** 浏览器是否支持语音识别（Firefox 等不支持时为 false，调用方应隐藏入口） */
  supported: boolean;
  /** 是否正在录音识别 */
  listening: boolean;
  /** 最近一次错误（中文提示），约 4 秒后自动清除 */
  error: string | null;
  /** 开始 / 停止切换；停止时已识别文本保留在输入框，不自动发送 */
  toggle: () => void;
  /** 按住说话：按下时开始（continuous，不静音自动断），松手前调 end() 收尾 */
  begin: () => void;
  /** 按住说话收尾：停止识别，onend 时把最终文本通过 onAutoCommit 回传（空文本不回传） */
  end: () => void;
  /** 作废收场：内容已被提交取走时调用，中止识别并丢弃后续异步写回 */
  reset: () => void;
}

/**
 * 语音输入：把浏览器原生 SpeechRecognition 接到一个受控文本输入上。
 * - 识别中的 interim 文本实时回填，final 文本在结束时固化；
 * - toggle 模式：单次识别（continuous=false），说完自动结束，不自动发送，留给用户检查/编辑；
 * - begin/end 按住模式：continuous=true，松手结束时通过 onAutoCommit 回传最终文本（首页快启用）；
 * - 提交内容时必须调 reset()，避免 onend 异步把文本写回已清空的输入框。
 */
export function useSpeechInput(
  value: string,
  onChange: (next: string) => void,
  onAutoCommit?: (text: string) => void,
): SpeechInputApi {
  const ctorRef = useRef<SpeechRecognitionCtor | null>(null);
  if (ctorRef.current === null && typeof window !== 'undefined') {
    ctorRef.current = getRecognitionCtor();
  }
  const supported = ctorRef.current !== null;

  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const silentRef = useRef(false);
  // 本轮是否为"按住说话"：只在该模式下松手 onend 才触发 onAutoCommit
  const holdModeRef = useRef(false);
  const baseRef = useRef('');
  const finalRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAutoCommitRef = useRef(onAutoCommit);
  onAutoCommitRef.current = onAutoCommit;
  const valueRef = useRef(value);
  valueRef.current = value;

  const teardown = useCallback((rec: SpeechRecognitionLike | null) => {
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
    }
    if (recRef.current === rec) recRef.current = null;
    listeningRef.current = false;
    setListening(false);
  }, []);

  // 卸载时中止识别，避免离开页面后麦克风灯还亮着
  useEffect(() => {
    return () => {
      const rec = recRef.current;
      if (rec) {
        silentRef.current = true;
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch {
          /* noop */
        }
      }
      recRef.current = null;
      listeningRef.current = false;
    };
  }, []);

  // 错误提示几秒后自动消失
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  const start = useCallback((opts?: { continuous?: boolean; hold?: boolean }) => {
    const Ctor = ctorRef.current;
    if (!Ctor || listeningRef.current) return;
    setError(null);
    silentRef.current = false;
    holdModeRef.current = !!opts?.hold;

    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.continuous = !!opts?.continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const current = valueRef.current;
    baseRef.current = current.trim() ? current.replace(/\s+$/, '') + ' ' : '';
    finalRef.current = '';
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);

    rec.onstart = () => {
      listeningRef.current = true;
      setListening(true);
    };

    rec.onresult = (event) => {
      if (silentRef.current) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finalRef.current += transcript;
        else interim += transcript;
      }
      onChangeRef.current(baseRef.current + finalRef.current + interim);
    };

    rec.onerror = (event) => {
      if (silentRef.current || event.error === 'aborted') return;
      setError(ERROR_HINTS[event.error] ?? `语音识别出了点问题（${event.error}）`);
    };

    rec.onend = () => {
      // 手动停止 / 说完自动结束 / 报错收尾都走这里
      const committed = baseRef.current + finalRef.current;
      if (!silentRef.current) {
        onChangeRef.current(committed);
        // 按住说话松手：把最终文本回传给调用方（空串不回传，交由 error 提示兜底）
        if (holdModeRef.current && committed.trim()) {
          onAutoCommitRef.current?.(committed.trim());
        }
      }
      holdModeRef.current = false;
      teardown(rec);
    };

    try {
      rec.start();
    } catch {
      // InvalidStateError 等竞态：安全复位
      silentRef.current = true;
      try {
        rec.abort();
      } catch {
        /* noop */
      }
      teardown(rec);
      setError('语音启动失败，请再点一次试试');
    }
  }, [teardown]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || !listeningRef.current) return;
    try {
      rec.stop();
    } catch {
      /* noop */
    }
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (listeningRef.current) stop();
    else start();
  }, [supported, start, stop]);

  // 按住说话：按下开始（continuous，停顿不自动断），松手调 end
  const begin = useCallback(() => {
    start({ continuous: true, hold: true });
  }, [start]);

  const reset = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      silentRef.current = true;
      try {
        rec.abort();
      } catch {
        /* noop */
      }
      teardown(rec);
    }
    holdModeRef.current = false;
    baseRef.current = '';
    finalRef.current = '';
  }, [teardown]);

  return { supported, listening, error, toggle, begin, end: stop, reset };
}
