import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { OnboardingSceneTry } from './OnboardingSceneTry';
import { GuideNarration, GuidePlaybackContext, type GuidePlayback } from './GuideNarration';
import './app-onboarding.css';

// Keep persisted IDs for the optional forms; the former rehearsal pages are retired.
const pageSteps = [0, 5, 6, 7];
const titles: Record<number, string> = {
  6: '想长期做的事，也可以从小处开始',
  7: '现在，开启你的第一条支线',
};
const examples = ['我有15分钟，在家想放松一下', '今天有点累，想做件轻松的小事'];

export function AppOnboarding({ step, onStep, onSkip, onFinish, onStart, returning, startPending, preferences, goals }: {
  step: number;
  onStep: (step: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  onStart: (text: string) => void;
  returning: boolean;
  startPending: boolean;
  preferences: ReactNode;
  goals: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [phrase, setPhrase] = useState(examples[0]);
  const [playback, setPlayback] = useState<GuidePlayback | null>(null);
  const [sceneCompleted, setSceneCompleted] = useState(false);
  const [sceneReplay, setSceneReplay] = useState(0);
  const pageIndex = pageSteps.indexOf(step);
  const form = step === 5 || step === 6;
  useEffect(() => {
    setSceneCompleted(false);
    setSceneReplay(0);
    (root.current?.querySelector<HTMLElement>('#app-guide-title') || root.current)?.focus();
    body.current?.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onSkip(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onSkip]);
  return <GuidePlaybackContext.Provider value={setPlayback}><div className="app-guide" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={step === 0 ? '支线任务 · 使用指南' : step === 5 ? '记下喜好' : undefined} aria-labelledby={step === 0 || step === 5 ? undefined : 'app-guide-title'} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onSkip(); }
    if (e.key !== 'Tab') return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,summary,a[href],[tabindex="0"]') || [])].filter(el => el.getClientRects().length && el.tabIndex >= 0);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current || document.activeElement?.id === 'app-guide-title')) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <div className={`app-guide-book ${form ? 'app-guide-form' : ''}`}>
      <header className="app-guide-top">
        <span>支线任务 · 使用指南</span>
        <button onClick={onSkip}>跳过引导</button>
      </header>
      <div className="app-guide-progress" aria-label={`应用引导，第 ${pageIndex + 1} 页，共 4 页`}>
        {pageSteps.map((id, index) => <i key={id} className={index <= pageIndex ? 'filled' : ''} />)}
      </div>
      <div ref={body} className="app-guide-body">
        <div className="app-guide-page">
          {step !== 0 && step !== 5 && <div key={`heading-${step}`} className="app-guide-heading">
            <h1 id="app-guide-title" tabIndex={-1}>{step === 7 && returning ? '随时可以回来，再试一次' : titles[step]}</h1>
          </div>}
          {step === 0 && <div className="app-guide-welcome">
            <XianMascot variant="face" size={170} />
            <GuideNarration floating scenes={{
              4: <OnboardingSceneTry key={sceneReplay} scene="home" onComplete={() => setSceneCompleted(true)} />,
            }} lines={[
              '白天努力工作，晚上疲惫地刷刷手机，一天就这样结束了。',
              '你是否也偶尔感到空虚和无聊，想让日子多一点值得期待的事？',
              '或许，你可以为自己经营一些支线任务！下班、等车、周末，都是它的舞台。',
              '想不出合适的事情做，让吱呀帮你想；不知道怎么迈出第一步，让吱呀来引导。',
              '周末一个人在家，想做点有趣的事？试着告诉吱呀，看它怎么帮你策划一场桌上小物展。',
              '告诉吱呀你在哪里、有多少时间、和谁一起，还有你的喜好与雷点，它就能帮你找到合适的玩法。',
            ]}><p className="walk-slogan">生活有主线，快乐在支线</p></GuideNarration>
          </div>}
          {step === 5 && <div className="app-guide-real-form">{preferences}</div>}
          {step === 6 && <GuideNarration key="form-6" lines={[
            '总想着重新捡起画画，却很难空出一整个下午？可以把它写成一个心愿。',
            '吱呀会拆成几章小任务。今天画一件小物，下次试一处光影，空闲时接着做。',
            '写下愿望，吱呀会先记下来。具体安排可以之后在手册里查看，暂时没有想法也可以稍后再填。',
          ]}><div className="app-guide-real-form">{goals}</div></GuideNarration>}
          {step === 7 && <div className="app-guide-welcome">
            <XianMascot variant="face" size={140} />
            <GuideNarration lines={returning ? [
              '上次的支线还在。现在有空的话，可以回到对话，接着做；状态变了，也可以告诉吱呀。',
              '想不起怎么操作时，从「我的手册」打开使用指南，就能再看一次。',
            ] : [
              '下次下班想换换心情、午休想透口气，或周末想试点新鲜事，都可以来找吱呀。',
              '现在选一句符合此刻情况的话，点「开始体验」。吱呀会按你的时间和状态，推荐真正可以去做的活动。',
            ]}>{!returning && <div className="app-guide-options">{examples.map(text => <button key={text} aria-pressed={phrase === text} onClick={() => setPhrase(text)}>{text}</button>)}</div>}</GuideNarration>
          </div>}
      <div className="app-guide-controls" role="group" aria-label="引导控制">
        {step === 0 && sceneCompleted ? <>
          <button className="app-guide-back" onClick={() => { setSceneCompleted(false); setSceneReplay(value => value + 1); }}>再看一遍</button>
          <button className="app-guide-next" onClick={() => onStep(5)}>下一步</button>
        </> : step === 0 && playback?.checkpoint ? <button className="app-guide-next app-guide-scene-skip" onClick={() => onStep(5)}>跳过</button> : playback ? <>
          <button className="app-guide-back app-guide-round" disabled={!playback.canPause} aria-label={playback.paused ? '继续播放' : '暂停'} title={playback.paused ? '继续播放' : '暂停'} onClick={playback.togglePause}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {playback.paused ? <path d="m9 5 10 7-10 7Z" /> : <><path d="M8 5v14" /><path d="M16 5v14" /></>}
            </svg>
          </button>
          <button className="app-guide-next guide-continue app-guide-round" aria-label="跳过这一步" title="跳过这一步" onClick={playback.advance}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 5 10 7-10 7Z" /><path d="M19 5v14" />
            </svg>
          </button>
        </> : <>
        {step > 0 && !form && <button className="app-guide-back" onClick={() => onStep(pageSteps[pageIndex - 1])}>上一页</button>}
        {form ? <button className="app-guide-next" onClick={() => onStep(step + 1)}>这项稍后再填 →</button>
          : step === 7 ? <button className="app-guide-next" disabled={startPending} onClick={returning ? onFinish : () => onStart(phrase)}>{startPending ? '正在连接…' : '开始体验'} →</button>
          : <button className="app-guide-next" onClick={() => onStep(5)}>记下我的喜好 →</button>}
        </>}
      </div>
        </div>
      </div>
    </div>
  </div></GuidePlaybackContext.Provider>;
}
