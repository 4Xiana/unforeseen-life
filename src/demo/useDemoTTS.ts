import { useCallback, useEffect, useRef, useState } from 'react';
import type { TTSApi } from '../hooks/useTTS';

/** Device narration keeps the demonstration independent of paid speech services. */
export function useDemoTTS(): TTSApi {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const active = useRef(new Set<SpeechSynthesisUtterance>());
  const [speaking, setSpeaking] = useState(false);
  const [currentSentence, setCurrentSentence] = useState('');
  const [error, setError] = useState('');
  const last = useRef('');
  const cancel = useCallback(() => {
    if (active.current.size) {
      for (const utterance of active.current) utterance.onstart = utterance.onend = utterance.onerror = null;
      active.current.clear();
      window.speechSynthesis.cancel();
    }
    setSpeaking(false); setCurrentSentence(''); setError('');
  }, []);
  const feed = useCallback((text: string) => {
    if (!supported || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, ''));
    utterance.lang = 'zh-CN';
    // Prefer an on-device voice; browsers without one can continue with subtitles.
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(item => item.localService && /^zh/i.test(item.lang));
    if (voice) utterance.voice = voice;
    last.current = text;
    utterance.onstart = () => { if (active.current.has(utterance)) { setSpeaking(true); setCurrentSentence(text); setError(''); } };
    utterance.onend = () => { active.current.delete(utterance); if (!active.current.size) { setSpeaking(false); setCurrentSentence(''); } };
    utterance.onerror = () => { active.current.delete(utterance); setSpeaking(false); setCurrentSentence(''); setError('此设备暂时无法朗读，可以继续看字幕。'); };
    active.current.add(utterance);
    window.speechSynthesis.speak(utterance);
  }, [supported]);
  const retry = useCallback(() => { cancel(); feed(last.current); }, [cancel, feed]);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', cancel); cancel(); };
  }, [cancel]);
  return { supported, speaking, loading: false, error, currentSentence, feed, cancel, retry, unlock: () => {} };
}
