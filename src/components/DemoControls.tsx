import { useEffect, useId, useRef, useState } from 'react';
import { isDemoMode, resetDemo, setDemoMode } from '../demo/mode';
import './demo-controls.css';

export type DemoAction =
  | 'home' | 'recommend' | 'task' | 'threads' | 'preferences' | 'goals'
  | 'inspiration' | 'handbook' | 'onboarding' | 'fill-task' | 'fill-chat'
  | 'fill-inspiration' | 'fill-goal' | 'fit-preview';

const destinations: { action: DemoAction; label: string; path: string }[] = [
  { action: 'recommend', label: '开始体验', path: 'm8 4 12 8-12 8V4Z' },
  { action: 'task', label: '任务体验', path: 'm4 6 2 2 4-4M13 6h7M4 13h6M13 13h7M4 20h6M13 20h7' },
  { action: 'threads', label: '任务地图', path: 'M6 5v14M6 8h12M18 8v8M4 3h4v4H4V3Zm12 11h4v4h-4v-4ZM4 17h4v4H4v-4Z' },
  { action: 'preferences', label: '偏好画像', path: 'M5 7h14M5 17h14M9 4v6M15 14v6' },
  { action: 'goals', label: '心愿计划', path: 'M5 21V3m0 1c5-5 9 5 14 0v10c-5 5-9-5-14 0' },
  { action: 'inspiration', label: '灵感收藏', path: 'm12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1 3-6Z' },
  { action: 'handbook', label: '日常记录', path: 'M12 5C9 3 5 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v16' },
  { action: 'onboarding', label: '新手教程', path: 'M12 17v.01M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z' },
];

/** Presenter controls live outside page navigation; changing mode reloads the app. */
export function DemoControls({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const demo = isDemoMode();
  const titleId = useId();
  const modeId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.altKey && event.shiftKey && event.code === 'KeyD' && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(value => !value);
      }
    }
    document.addEventListener('keydown', shortcut, true);
    return () => document.removeEventListener('keydown', shortcut, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  function navigate(action: DemoAction) {
    setOpen(false);
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('xian-demo-action', { detail: { action } }));
    });
  }

  return <>
    <button ref={trigger} type="button" className={`demo-settings-trigger ${demo ? 'is-demo' : ''}`}
      aria-label="演示设置" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {demo ? <span className="demo-mode-badge">演示</span> : <span className="demo-hidden-dot" aria-hidden="true" />}
    </button>
    {open && <div className="demo-settings-overlay" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]') || [])]
        .filter(element => element.getClientRects().length && element.tabIndex >= 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first?.focus();
      }
    }}>
      <button type="button" className="demo-settings-scrim" tabIndex={-1} aria-label="关闭演示设置" onClick={() => setOpen(false)} />
      <div ref={panel} className="demo-settings-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="demo-settings-header">
          <h2 id={titleId}>{demo ? '演示控制台' : '演示设置'}</h2>
          <button type="button" className="demo-settings-close" aria-label="关闭演示控制台" onClick={() => setOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="demo-settings-body">
          <div className="demo-mode-setting">
            <div><p id={modeId}>演示模式</p><small>{demo ? '当前展示的是示例数据' : '载入示例，即可开始演示'}</small></div>
            <button type="button" className="demo-mode-switch" role="switch" aria-checked={demo} aria-labelledby={modeId} onClick={() => setDemoMode(!demo)}><span /></button>
          </div>
          {demo ? <>
            <p className="demo-settings-note">随时跳到一个环节，演示操作只影响示例数据。</p>
            <nav className="demo-destinations" aria-label="演示导航">{destinations.map(item => <button type="button" key={item.action} disabled={busy && (item.action === 'task' || item.action === 'recommend')} data-demo-action={item.action} onClick={() => navigate(item.action)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={item.path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span>{item.label}</span>
            </button>)}</nav>
            <div className="demo-settings-footer"><button type="button" onClick={() => navigate('home')}>回到首页</button><button type="button" onClick={resetDemo}>重置演示</button></div>
          </> : <p className="demo-settings-note">开启后可体验完整示例，关闭即可回到你的记录。</p>}
        </div>
      </div>
    </div>}
  </>;
}
