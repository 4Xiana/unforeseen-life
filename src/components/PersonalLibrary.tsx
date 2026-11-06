import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getClientId } from '../handbook';
import './personal-library.css';

export type LibraryTab = 'preferences' | 'goals' | 'handbook' | 'inspiration';
const tabs: { id: LibraryTab; label: string; mark: string }[] = [
  { id: 'preferences', label: '喜好', mark: '♡' },
  { id: 'goals', label: '心愿计划', mark: '✳' },
  { id: 'handbook', label: '日常记录', mark: '✧' },
  { id: 'inspiration', label: '灵感收藏', mark: '♡' },
];

type Guide = 'preferences' | 'goals' | 'done' | 'off';
interface GuidePanels {
  guidedPreferences: boolean;
  guidedGoals: boolean;
  onPreferencesSaved: () => void;
  onGoalsLoaded: (hasGoals: boolean, hasConfirmed: boolean) => void;
  onGoalConfirmed: () => void;
}

export function PersonalLibrary({ tab, onTabChange, onClose, onOpenGuide, needsPreferences, panels }: {
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onClose: () => void;
  onOpenGuide: () => void;
  needsPreferences: boolean;
  panels: (guide: GuidePanels) => Record<LibraryTab, ReactNode>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [guide, setGuide] = useState<Guide>('off');
  const [goalState, setGoalState] = useState<{ hasGoals: boolean; hasConfirmed: boolean } | null>(null);
  const key = `xian-library-guide-v1:${getClientId()}`;
  const guided = guide === 'preferences' || guide === 'goals';
  function remember(value: string) {
    try { localStorage.setItem(key, value); } catch { /* continue in memory */ }
  }
  function startGuide() {
    const next = needsPreferences ? 'preferences' : 'goals';
    remember(next); setGuide(next); onTabChange(next);
  }
  function skipGuide() { remember('skipped'); setGuide('off'); }
  function selectTab(next: LibraryTab) {
    if (guided) skipGuide();
    if (guide === 'done') setGuide('off');
    onTabChange(next);
  }
  useEffect(() => {
    if (guide === 'goals' || guide === 'done') {
      root.current?.querySelector<HTMLElement>('.library-guide-title')?.focus();
    }
  }, [guide]);
  const content = panels({
    guidedPreferences: guide === 'preferences',
    guidedGoals: guide === 'goals',
    onPreferencesSaved: () => {
      if (guide !== 'preferences') return;
      if (goalState?.hasConfirmed) { remember('done'); setGuide('done'); }
      else { remember('goals'); setGuide('goals'); onTabChange('goals'); }
    },
    onGoalsLoaded: (hasGoals, hasConfirmed) => setGoalState(prev => prev?.hasGoals === hasGoals && prev.hasConfirmed === hasConfirmed ? prev : { hasGoals, hasConfirmed }),
    onGoalConfirmed: () => {
      if (guide !== 'goals') return;
      remember('done'); setGuide('done');
    },
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div ref={root} className="library-overlay" role="dialog" aria-modal="true" aria-labelledby="library-title" tabIndex={-1} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key !== 'Tab') return;
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,summary,a[href],[tabindex="0"]') || [])].filter(n => n.getClientRects().length && n.tabIndex >= 0);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <div className="library-book">
      <header className="library-header">
        <h1 id="library-title">我的手册</h1>
        <button className="min-h-[44px] px-3 text-[12px] text-fog ml-auto" onClick={onOpenGuide}>使用指南</button>
        <button className="library-close" onClick={onClose} aria-label="关闭我的手册">×</button>
      </header>
      <div className="library-tabs" role="tablist" aria-label="手册栏目" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const index = tabs.findIndex(item => item.id === tab);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next].id);
        root.current?.querySelector<HTMLElement>(`#library-tab-${tabs[next].id}`)?.focus();
      }}>
        {tabs.map(item => <button key={item.id} id={`library-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`library-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => { if (tab !== item.id) selectTab(item.id); }}>
          <span aria-hidden>{item.mark}</span>{item.label}
          {item.id === 'preferences' && needsPreferences && <i className="library-dot" aria-label="尚未填写喜好" />}
        </button>)}
      </div>
      {guided && <div className="library-guide">
        <div className="library-guide-track" aria-label={`首次填写，第 ${guide === 'preferences' ? 1 : 2} 步，共 2 步`}>
          <span className={guide === 'preferences' ? 'current' : 'complete'}><i>{guide === 'preferences' ? '1' : '✓'}</i>记下喜好</span>
          <b aria-hidden />
          <span className={guide === 'goals' ? 'current' : ''}><i>2</i>种下心愿</span>
        </div>
        <button onClick={skipGuide}>稍后再填</button>
        <p className="library-guide-title" tabIndex={-1} key={guide}>{guide === 'preferences' ? '从你喜欢的开始。' : '喜好已记下，再留一个想慢慢实现的心愿。'}</p>
      </div>}
      {guide === 'done' && <div className="library-guide library-guide-done" role="status">
        <p className="library-guide-title" tabIndex={-1}><span aria-hidden>✳</span> 喜好与心愿，都收好了。</p>
        <button onClick={() => setGuide('off')}>翻开我的手册 →</button>
      </div>}
      {guide === 'off' && (needsPreferences || !goalState?.hasConfirmed) && <div className="library-guide-resume"><button onClick={startGuide}>继续填写引导 →</button></div>}
      {tabs.map(item => <section key={item.id} className="library-panel" id={`library-panel-${item.id}`} role="tabpanel" aria-labelledby={`library-tab-${item.id}`} tabIndex={0} hidden={tab !== item.id}>
        {content[item.id]}
      </section>)}
    </div>
  </div>;
}
