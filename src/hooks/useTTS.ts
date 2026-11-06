import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../paths';
import { getClientId } from '../handbook';

export interface TTSApi {
  supported: boolean;
  speaking: boolean;
  loading: boolean;
  error: string;
  currentSentence: string;
  feed: (text: string) => void;
  cancel: () => void;
  retry: () => void;
  unlock: () => void;
}

/** MiniMax audio queue. Generation guards prevent late responses after mute/exit. */
export function useTTS(): TTSApi {
  const supported = typeof Audio !== 'undefined';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  const generation = useRef(0);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  const settle = useRef<(() => void) | null>(null);
  const failed = useRef('');
  const pump = useRef<() => Promise<void>>();
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSentence, setCurrentSentence] = useState('');
  const getAudio = useCallback(() => audioRef.current ??= new Audio(), []);
  const unlock = useCallback(() => {
    if (!supported) return;
    const audio = getAudio();
    if (running.current || audio.src) return;
    // Play a silent PCM frame inside the user gesture to enable subsequent audio on mobile.
    audio.src = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
    void audio.play().then(() => { if (!running.current) { audio.pause(); audio.removeAttribute('src'); } }).catch(() => { if (!running.current) audio.removeAttribute('src'); });
  }, [supported, getAudio]);
  const cancel = useCallback(() => {
    generation.current++;
    controller.current?.abort(); controller.current = null;
    queue.current = []; failed.current = ''; running.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    settle.current?.(); settle.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setSpeaking(false); setLoading(false); setError(''); setCurrentSentence('');
  }, []);
  pump.current = async () => {
    if (running.current || !supported) return;
    const text = queue.current.shift();
    if (!text) return;
    const token = generation.current;
    running.current = true; setLoading(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    let objectUrl: string | undefined;
    try {
      const response = await fetch(`${API_BASE}/tts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
        body: JSON.stringify({ text }), signal: abort.signal,
      });
      if (!response.ok) throw new Error('吱呀的语音暂时没连上，点击重试。');
      const blob = await response.blob();
      if (generation.current !== token) return;
      const audio = getAudio();
      objectUrl = URL.createObjectURL(blob); url.current = objectUrl; audio.src = objectUrl;
      const finished = new Promise<void>((resolve, reject) => {
        settle.current = resolve;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('这句话没能播放，点击重试。'));
      });
      await audio.play().catch(() => { throw new Error('点一下播放，让吱呀开口。'); });
      if (generation.current !== token) return;
      setLoading(false); setSpeaking(true); setCurrentSentence(text);
      await finished;
    } catch (cause) {
      if (generation.current !== token) return;
      failed.current = text;
      setError(cause instanceof Error ? cause.message : '语音播放失败，点击重试。');
      return;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (generation.current === token) {
        const audio = audioRef.current;
        if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); }
        settle.current = null; url.current = null; controller.current = null; running.current = false;
        setSpeaking(false); setLoading(false); setCurrentSentence('');
      }
    }
    if (generation.current === token) void pump.current?.();
  };
  const feed = useCallback((text: string) => {
    const clean = text.replace(/https?:\/\/\S+/g, '').replace(/[*#`]/g, '').trim();
    const chunks = clean.match(/[\s\S]{1,400}(?:[。！？]|$)|[\s\S]{1,400}/g) || [];
    queue.current.push(...chunks);
    if (!failed.current) void pump.current?.();
  }, []);
  const retry = useCallback(() => {
    unlock();
    if (failed.current) { queue.current.unshift(failed.current); failed.current = ''; }
    setError(''); void pump.current?.();
  }, [unlock]);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    window.addEventListener('xian:microphone-start', cancel);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', cancel); window.removeEventListener('xian:microphone-start', cancel); cancel(); };
  }, [cancel]);
  return { supported, speaking, loading, error, currentSentence, feed, cancel, retry, unlock };
}
