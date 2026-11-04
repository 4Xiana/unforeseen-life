import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 把成段文本切成适合朗读的短句：
 * - 先按句末标点（。！？!? 换行）切；
 * - 超过阈值的长句再按句内停顿（，、；,;）细分。
 */
function splitSentences(text: string, maxLen = 42): string[] {
  const norm = text.replace(/\s+/g, ' ').trim();
  if (!norm) return [];

  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t) out.push(t);
  };

  const primary = norm.match(/[^。！？!?\n]+[。！？!?\n]?/g) ?? [norm];
  for (const raw of primary) {
    if (raw.trim().length > maxLen) {
      const sub = raw.match(/[^，、；,;]+[，、；,;]?/g) ?? [raw];
      sub.forEach(push);
    } else {
      push(raw);
    }
  }
  return out;
}

export interface TTSApi {
  /** 当前环境是否支持语音合成 */
  supported: boolean;
  /** 是否正在朗读 */
  speaking: boolean;
  /** 当前正在朗读的句子（供字幕高亮） */
  currentSentence: string;
  /** 朗读一段文本：分句入队，若当前空闲则立即开始 */
  feed: (text: string) => void;
  /** 停止朗读并清空队列（切轮 / 退出 / 开麦前调用） */
  cancel: () => void;
}

/**
 * 浏览器内置语音合成（speechSynthesis）封装：
 * - 优先选择中文嗓音；分句顺序朗读，维护待播队列；
 * - 纯前端、零后端，调用方只需在文字成稿后 feed()。
 */
export function useTTS(): TTSApi {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const speakingRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const currentRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [speaking, setSpeaking] = useState(false);
  const [currentSentence, setCurrentSentence] = useState('');

  // 嗓音列表（部分浏览器异步加载）
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current;
    if (!voices.length) return null;
    return (
      voices.find(v => v.lang.toLowerCase().startsWith('zh')) ??
      voices.find(v => v.default) ??
      voices[0] ??
      null
    );
  }, []);

  const speakNext = useCallback(() => {
    if (!supported) return;
    const utter = queueRef.current.shift();
    if (!utter) {
      speakingRef.current = false;
      currentRef.current = null;
      setSpeaking(false);
      setCurrentSentence('');
      return;
    }
    currentRef.current = utter;
    utter.onstart = () => {
      speakingRef.current = true;
      setSpeaking(true);
      setCurrentSentence(utter.text);
    };
    const done = () => {
      speakingRef.current = false;
      currentRef.current = null;
      setSpeaking(false);
      setCurrentSentence('');
      speakNext();
    };
    utter.onend = done;
    utter.onerror = done;
    window.speechSynthesis.speak(utter);
  }, [supported]);

  const feed = useCallback((text: string) => {
    if (!supported) return;
    const sentences = splitSentences(text);
    if (!sentences.length) return;
    for (const s of sentences) {
      const utter = new SpeechSynthesisUtterance(s);
      utter.lang = 'zh-CN';
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      queueRef.current.push(utter);
    }
    // 当前既不在朗读、也没有残留播放时，立即起播
    if (!speakingRef.current && !window.speechSynthesis.speaking) speakNext();
  }, [supported, pickVoice, speakNext]);

  const cancel = useCallback(() => {
    if (!supported) return;
    queueRef.current = [];
    speakingRef.current = false;
    currentRef.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    setSpeaking(false);
    setCurrentSentence('');
  }, [supported]);

  // 卸载 / 切后台前停止，避免队列卡死
  useEffect(() => {
    if (!supported) return;
    const onHide = () => cancel();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      cancel();
    };
  }, [supported, cancel]);

  return { supported, speaking, currentSentence, feed, cancel };
}
