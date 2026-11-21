import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface GuidePlayback {
  advance: () => void;
  togglePause: () => void;
  paused: boolean;
  canPause: boolean;
  checkpoint: boolean;
}
export const GuidePlaybackContext = createContext<(playback: GuidePlayback | null) => void>(() => {});

/** Captions replace one another; completed narration unlocks the related action. */
export function GuideNarration({ lines, children, label = '吱呀', onReady, floating = false, scenes }: {
  lines: string[];
  children?: ReactNode;
  label?: string;
  onReady?: () => void;
  floating?: boolean;
  scenes?: Record<number, ReactNode>;
}) {
  return <NarrationPlayer key={lines.join('\n')} lines={lines} label={label} onReady={onReady} floating={floating} scenes={scenes}>{children}</NarrationPlayer>;
}

function NarrationPlayer({ lines, children, label, onReady, floating, scenes }: {
  lines: string[];
  children?: ReactNode;
  label: string;
  onReady?: () => void;
  floating: boolean;
  scenes?: Record<number, ReactNode>;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const callback = useRef(onReady);
  callback.current = onReady;
  const line = lines[index] || '';
  const checkpoint = !!scenes?.[index] && !ready;
  const root = useRef<HTMLDivElement>(null);
  const registerPlayback = useContext(GuidePlaybackContext);
  const advance = useCallback(() => {
    if (index < lines.length - 1) setIndex(index + 1);
    else setReady(true);
  }, [index, lines]);
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    registerPlayback(ready ? null : {
      advance: () => advanceRef.current(),
      togglePause: () => setPaused(value => !value),
      paused,
      canPause: !reduced && !checkpoint,
      checkpoint,
    });
    return () => registerPlayback(null);
  }, [ready, paused, reduced, checkpoint, registerPlayback]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (paused || ready || reduced || !visible || checkpoint) return;
    const timer = window.setTimeout(() => {
      if (index < lines.length - 1) setIndex(value => value + 1);
      else setReady(true);
    }, 800 + Math.max(3500, line.length * 90) - 2000);
    return () => window.clearTimeout(timer);
  }, [paused, ready, reduced, visible, checkpoint, index, line, lines.length]);
  useEffect(() => {
    if (ready) { setRevealed(true); callback.current?.(); }
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    if (document.activeElement === document.body) root.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('.walk-focus')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [ready, reduced]);

  useEffect(() => {
    if (!checkpoint) return;
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('.guide-scene')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [checkpoint, reduced, index]);

  return <div ref={root} className={`guide-narration ${ready ? 'is-ready' : ''} ${floating ? 'guide-floating' : ''} ${checkpoint ? 'has-scene' : ''}`} data-position={['center', 'left', 'right'][index % 3]} tabIndex={-1}>
      <div className="guide-caption-label"><span>{label}</span><span aria-label={`第 ${index + 1} 句，共 ${lines.length} 句`}>{lines.map((_, i) => <i key={i} className={i === index ? 'current' : i < index ? 'read' : ''} />)}</span></div>
      <div className="guide-caption-text" key={index}>
        <span aria-hidden>{line}</span>
        <span className="sr-only" role="status">{line}</span>
      </div>
    {checkpoint && <div className="guide-scene" key={`scene-${index}`}>{scenes?.[index]}</div>}
    {(ready || revealed) && children && <div className="guide-action-reveal" hidden={!ready}>{children}</div>}
  </div>;
}
