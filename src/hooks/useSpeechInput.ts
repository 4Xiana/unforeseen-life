import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechInputController, type RecognitionConstructor, type SpeechPhase } from '../speechRecognition';

function getRecognitionCtor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechInputApi {
  supported: boolean;
  /** True only after the recognition service has actually started. */
  listening: boolean;
  phase: SpeechPhase;
  active: boolean;
  error: string | null;
  /** Click to dictate into the input; click again to stop without sending. */
  toggle: () => void;
  /** Hold-to-talk; end() submits only speech captured during this recording. */
  begin: () => void;
  end: () => void;
  /** Cancel a gesture and restore the draft from before this recording. */
  cancel: () => void;
  /** Stop on submission/navigation, without restoring already submitted text. */
  reset: () => void;
}

export function useSpeechInput(
  value: string,
  onChange: (next: string) => void,
  onAutoCommit?: (text: string) => void,
): SpeechInputApi {
  const supported = getRecognitionCtor() !== null;
  const [phase, setPhase] = useState<SpeechPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<SpeechInputController | null>(null);
  const latest = useRef({ value, onChange, onAutoCommit });
  latest.current = { value, onChange, onAutoCommit };

  const reset = useCallback(() => engineRef.current?.cancel(), []);
  const cancel = useCallback(() => engineRef.current?.cancel(true), []);

  useEffect(() => {
    // Navigating away or locking the phone must not send an unfinished recording.
    const onHide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', cancel);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [cancel]);

  const start = useCallback((hold: boolean) => {
    if (!window.isSecureContext) {
      setError('语音输入需要安全连接，请使用 HTTPS 地址打开页面。');
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('当前浏览器不支持语音识别，请使用系统浏览器，或手机键盘上的语音输入。');
      return;
    }
    const policy = (document as Document & {
      permissionsPolicy?: { allowsFeature(name: string): boolean };
      featurePolicy?: { allowsFeature(name: string): boolean };
    });
    if ((policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature('microphone') === false) {
      setError('当前页面未开放麦克风权限，请在独立浏览器窗口打开后再试。');
      return;
    }
    // Shared by chat, evidence inputs and immersive calls: never record the NPC's voice.
    window.dispatchEvent(new Event('xian:microphone-start'));
    try { window.speechSynthesis?.cancel(); } catch { /* speech output unavailable */ }
    if (!engineRef.current) {
      engineRef.current = new SpeechInputController(Ctor, {
        onPhase: setPhase,
        onError: setError,
        onText: text => latest.current.onChange(text),
        onCommit: text => latest.current.onAutoCommit?.(text),
      });
    }
    engineRef.current.start(latest.current.value, hold);
  }, []);

  const end = useCallback(() => engineRef.current?.stop(), []);
  const begin = useCallback(() => start(true), [start]);
  const toggle = useCallback(() => {
    if (engineRef.current?.active) engineRef.current.stop();
    else start(false);
  }, [start]);

  return { supported, phase, active: phase !== 'idle', listening: phase === 'listening', error, toggle, begin, end, cancel, reset };
}
