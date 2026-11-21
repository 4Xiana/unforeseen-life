import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { OnboardingSceneTry } from './OnboardingSceneTry';
import './app-onboarding.css';

// Preserve existing stored form IDs; 4 now opens the short demonstration.
const pageSteps = [0, 4, 5, 6];
const labels = ['认识支线', '试试玩法', '选点喜好', '留个心愿'];

export function AppOnboarding({ step, onStep, onSkip, onFinish, preferences, goals }: {
  step: number;
  onStep: (step: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  preferences: ReactNode;
  goals: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [sceneCompleted, setSceneCompleted] = useState(false);
  const pageIndex = Math.max(0, pageSteps.indexOf(step));
  useEffect(() => {
    setSceneCompleted(false);
    root.current?.querySelector<HTMLElement>('#app-guide-title')?.focus({ preventScroll: true });
    body.current?.scrollTo({ top: 0 });
  }, [step]);
  return <div className="app-guide app-guide-compact" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="app-guide-title" onKeyDown={e => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onSkip(); }
    if (e.key !== 'Tab') return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,summary,a[href],[tabindex="0"]') || [])].filter(el => el.getClientRects().length && el.tabIndex >= 0);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current || document.activeElement?.id === 'app-guide-title')) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <div className="app-guide-book">
      <header className="app-guide-top"><span>支线任务 · 快速上手</span><button onClick={onSkip}>跳过引导</button></header>
      <div className="app-guide-progress" aria-label={`应用引导，第 ${pageIndex + 1} 页，共 4 页`}>
        {pageSteps.map((id, index) => <i key={id} className={index <= pageIndex ? 'filled' : ''} />)}
      </div>
      <div className="quick-guide-location"><span>{String(pageIndex + 1).padStart(2, '0')} / 04 · {labels[pageIndex]}</span>{pageIndex > 0 && <button onClick={() => onStep(pageSteps[pageIndex - 1])}>上一步</button>}</div>
      <div ref={body} className="app-guide-body">
        <div className="app-guide-page" key={step}>
          {step === 0 && <div className="quick-guide-intro">
            <XianMascot size={112} />
            <p className="quick-guide-eyebrow">下班后、等车时，或周末的空档</p>
            <h1 id="app-guide-title" tabIndex={-1}>有一点空闲，<br />就来一条支线。</h1>
            <p>告诉吱呀你在哪儿、有多少时间，<br />它帮你找件有趣、现在就能做的小事。</p>
            <div className="quick-guide-example"><span>比如现在</span><p>“在家，有15分钟，想放松一下。”</p><strong>给桌上的小物办个展 →</strong></div>
            <p className="quick-guide-footnote">选一个点子 · 跟着做 · 留下自己的小作品</p>
          </div>}
          {step === 4 && <>
            <h1 id="app-guide-title" tabIndex={-1}>一条支线，就这样开始</h1>
            <p className="quick-guide-description">跟着点两下，看看从推荐到留下作品的过程。</p>
            <OnboardingSceneTry scene="home" onComplete={() => setSceneCompleted(true)} />
          </>}
          {step === 5 && <>
            <h1 id="app-guide-title" tabIndex={-1}>先记两点基本喜好</h1>
            <p className="quick-guide-description">活动节奏和预算，点两下就好。不确定可以跳过。</p>
            <div className="app-guide-real-form">{preferences}</div>
          </>}
          {step === 6 && <>
            <h1 id="app-guide-title" tabIndex={-1}>有件事，想慢慢做到？</h1>
            <p className="quick-guide-description">比如捡起画画。以后可以拆成小任务，空闲时做一点。</p>
            <div className="app-guide-real-form">{goals}</div>
          </>}
        </div>
      </div>
      <div className="app-guide-controls quick-guide-footer" role="group" aria-label="引导控制">
        {step === 0 ? <button className="app-guide-next" onClick={() => onStep(4)}>看看怎么玩 →</button>
          : step === 4 ? <button className={sceneCompleted ? 'app-guide-next' : 'app-guide-back'} onClick={() => onStep(5)}>{sceneCompleted ? '下一步：选点喜好 →' : '跳过演示'}</button>
          : step === 5 ? <button className="app-guide-back" onClick={() => onStep(6)}>暂时不选，下一步 →</button>
          : <button className="app-guide-back" onClick={onFinish}>暂时没有，完成引导 →</button>}
      </div>
    </div>
  </div>;
}
