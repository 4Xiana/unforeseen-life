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
            <p className="quick-guide-eyebrow">日常里，还有很多有趣的事等你发现</p>
            <h1 id="app-guide-title" tabIndex={-1}>从一点好奇，<br />开启一条支线。</h1>
            <p>说说你想试什么，没想法也可以。<br />吱呀帮你发现有趣、能动手做的事。</p>
            <div className="quick-guide-example"><span>比如，你想试试创作</span><p>“想在家试点有创意的事。”</p><strong>给桌上的小物办个展 →</strong></div>
            <p className="quick-guide-footnote">发现一个点子 · 动手试试 · 留下自己的作品</p>
          </div>}
          {step === 4 && <>
            <h1 id="app-guide-title" tabIndex={-1}>一条支线，就这样开始</h1>
            <p className="quick-guide-description">跟着点两下，体验从发现点子到动手完成的过程。</p>
            <OnboardingSceneTry scene="home" onComplete={() => setSceneCompleted(true)} />
          </>}
          {step === 5 && <>
            <h1 id="app-guide-title" tabIndex={-1}>先记两点基本喜好</h1>
            <p className="quick-guide-description">选个活动节奏和预算，让推荐更合你意。不确定可以跳过。</p>
            <div className="app-guide-real-form">{preferences}</div>
          </>}
          {step === 6 && <>
            <h1 id="app-guide-title" tabIndex={-1}>有件事，想慢慢做到？</h1>
            <p className="quick-guide-description">比如重新捡起画画。先记下来，之后再去心愿里安排小任务。</p>
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
