import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { OnboardingSceneTry } from './OnboardingSceneTry';
import './app-onboarding.css';

// Preserve existing stored form IDs; 4 now opens the short demonstration.
const pageSteps = [0, 4, 5, 6];

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
      <header className="app-guide-top">
        <span>{pageIndex + 1} / 4</span>
        <nav aria-label="教程导航">{pageIndex > 0 && <button onClick={() => onStep(pageSteps[pageIndex - 1])}>上一步</button>}<button onClick={onSkip}>稍后再看</button></nav>
      </header>
      <div className="app-guide-progress" aria-label={`应用引导，第 ${pageIndex + 1} 页，共 4 页`}>
        {pageSteps.map((id, index) => <i key={id} className={index <= pageIndex ? 'filled' : ''} />)}
      </div>
      <div ref={body} className="app-guide-body">
        <div className="app-guide-page" key={step}>
          {step === 0 && <div className="quick-guide-intro">
            <XianMascot size={112} />
            <h1 id="app-guide-title" tabIndex={-1}>和吱呀聊聊，发现想尝试的小事。</h1>
            <p className="quick-guide-description">没想法也没关系，一起找找。</p>
          </div>}
          {step === 4 && <>
            <h1 id="app-guide-title" tabIndex={-1}>挑件小事，跟着做，再留下收获。</h1>
            <OnboardingSceneTry scene="home" onComplete={() => setSceneCompleted(true)} />
          </>}
          {step === 5 && <>
            <h1 id="app-guide-title" tabIndex={-1}>分享你的喜好，让吱呀更了解你。</h1>
            <p className="quick-guide-description">随心选选，不确定也可以跳过。</p>
            <div className="app-guide-real-form">{preferences}</div>
          </>}
          {step === 6 && <>
            <h1 id="app-guide-title" tabIndex={-1}>有哪些想要开启的支线任务？</h1>
            <div className="app-guide-real-form">{goals}</div>
          </>}
        </div>
      </div>
      <div className="app-guide-controls quick-guide-footer" role="group" aria-label="引导控制">
        {step === 0 ? <button className="app-guide-next" onClick={() => onStep(4)}>一起试试 →</button>
          : step === 4 ? <button className={sceneCompleted ? 'app-guide-next' : 'app-guide-back'} onClick={() => onStep(5)}>{sceneCompleted ? '聊聊我的喜好 →' : '先跳过这一步'}</button>
          : step === 5 ? <button className="app-guide-back" onClick={() => onStep(6)}>先跳过，下一步 →</button>
          : <button className="app-guide-back" onClick={onFinish}>还没想好，先出发 →</button>}
      </div>
    </div>
  </div>;
}
