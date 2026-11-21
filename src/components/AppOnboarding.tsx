import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { OnboardingSceneTry } from './OnboardingSceneTry';
import './app-onboarding.css';

// Preserve existing stored form IDs; 4 now opens the short demonstration.
const pageSteps = [0, 4, 5, 6];
const labels = ['认识吱呀', '试一试', '你的喜好', '小小心愿'];

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
      <header className="app-guide-top"><span>你好，我是吱呀</span><button onClick={onSkip}>稍后再看</button></header>
      <div className="app-guide-progress" aria-label={`应用引导，第 ${pageIndex + 1} 页，共 4 页`}>
        {pageSteps.map((id, index) => <i key={id} className={index <= pageIndex ? 'filled' : ''} />)}
      </div>
      <div className="quick-guide-location"><span>{String(pageIndex + 1).padStart(2, '0')} / 04 · {labels[pageIndex]}</span>{pageIndex > 0 && <button onClick={() => onStep(pageSteps[pageIndex - 1])}>上一步</button>}</div>
      <div ref={body} className="app-guide-body">
        <div className="app-guide-page" key={step}>
          {step === 0 && <div className="quick-guide-intro">
            <XianMascot size={112} />
            <p className="quick-guide-eyebrow">日常里，也有意想不到的小乐趣</p>
            <h1 id="app-guide-title" tabIndex={-1}>跟着好奇，<br />试点新鲜事。</h1>
            <p>和吱呀聊聊，找件有意思的小事。<br />还没想好？一起找找也可以。</p>
            <div className="quick-guide-example"><span>比如，你对吱呀说</span><p>“想在家试点有创意的事。”</p><strong>给桌上的小物办个展 →</strong></div>

          </div>}
          {step === 4 && <>
            <h1 id="app-guide-title" tabIndex={-1}>一起试一条支线</h1>
            <p className="quick-guide-description">挑个点子，跟着做，再留下自己的小收获。</p>
            <OnboardingSceneTry scene="home" onComplete={() => setSceneCompleted(true)} />
          </>}
          {step === 5 && <>
            <h1 id="app-guide-title" tabIndex={-1}>分享你的喜好，<br />让吱呀更了解你</h1>
            <p className="quick-guide-description">随心选选，不确定也可以跳过。</p>
            <div className="app-guide-real-form">{preferences}</div>
          </>}
          {step === 6 && <>
            <h1 id="app-guide-title" tabIndex={-1}>有什么一直想试试？</h1>
            <p className="quick-guide-description">画画、做饭，或是认识身边的街区。先留个小心愿吧。</p>
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
