import { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useAgentSession } from './hooks/useAgentSession';
import { HandbookView } from './components/HandbookView';
import { LandingScreen } from './components/LandingScreen';
import { ImmersiveCall } from './components/ImmersiveCall';
import { useStepTimer } from './hooks/useStepTimer';
import { GoalsView } from './components/GoalsView';
import { PersonalLibrary, type LibraryTab } from './components/PersonalLibrary';
import { InspirationView } from './components/InspirationView';
import { PreferenceSheet } from './components/PreferenceSheet';
import { AppOnboarding } from './components/AppOnboarding';
import { useAppOnboarding, useFirstVisitGuide } from './hooks/useAppOnboarding';
import { ConversationPanel } from './components/ConversationPanel';
import { TaskWorkspace } from './components/TaskWorkspace';
import './components/session-layout.css';

/**
 * 可见视口高度（px）：手机软键盘弹起时 window.innerHeight / 100vh 不会缩短，
 * 但 visualViewport.height 会变矮。根容器按它定高，底部操作条就能抬到键盘上方。
 * 不支持 visualViewport 时返回 null，由 CSS 的 100dvh 兜底。
 */
function useViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Pinch zoom should magnify the page, not reflow the app into a smaller layout.
    const update = () => {
      if (vv.scale === 1) setHeight(Math.round(vv.height));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return height;
}

export default function App() {
  const onboarding = useAppOnboarding();
  const {
    started,
    isRestoring,
    retryRestore,
    startNewSession,
    startGoal,
    sessionId,
    timeline,
    fsmState,
    isStreaming,
    isThinking,
    steppingText,
    uiSkeleton,
    isConnecting,
    error,
    handbook,
    reward,
    goalNotice,
    quest,
    questHistory,
    proposedActivities,
    selectedActivity,
    stepReview,
    lastAction,
    envInfo,
    geoSupported,
    geoStatus,
    start,
    sendText,
    selectActivity,
    submitText,
    submitPhoto,
    abandon,
    dismissCompletion,
    refreshHandbook,
    profile,
    questPairs,
    saveUserProfile,
    fitUserProfile,
  } = useAgentSession({ requestLocation: !onboarding.active });
  useFirstVisitGuide(onboarding, !isRestoring && profile !== null && handbook !== null, started || !!profile?.onboarded || (handbook?.stats.total ?? 0) > 0);
  const guideStepRef = useRef(onboarding.step);
  guideStepRef.current = onboarding.step;
  const viewportHeight = useViewportHeight();

  const [inputValue, setInputValue] = useState('');
  const [libraryTab, setLibraryTab] = useState<LibraryTab | null>(null);
  const [showHome, setShowHome] = useState(false);
  const openLibrary = (tab: LibraryTab = 'goals') => { refreshHandbook(); setLibraryTab(tab); };
  const startFromHome = (text?: string) => {
    setShowHome(false);
    if (started) { if (text?.trim()) sendText(text.trim()); }
    else start(text);
  };
  const startGoalFromLibrary: typeof startGoal = (...args) => { setShowHome(false); startGoal(...args); };
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [browseAfterCompletion, setBrowseAfterCompletion] = useState(false);
  // 沉浸通话模式：语音对话 + 字幕 + 独立卡片弹层
  const [immersive, setImmersive] = useState(false);
  const assistantTrigger = useRef<HTMLButtonElement | null>(null);
  const openGuide = () => {
    setLibraryTab(null);
    setImmersive(false);
    onboarding.replay();
  };

  // Selection hands the main surface to the task immediately, including step preparation.
  const taskMode = fsmState === 'S2' || (fsmState === 'S3' && !!quest && !browseAfterCompletion) || (lastAction === 'select_activity' && isStreaming && !!selectedActivity);
  useEffect(() => {
    if (taskMode) setImmersive(false);
    else setAssistantOpen(false);
  }, [taskMode]);
  useEffect(() => { if (fsmState !== 'S3') setBrowseAfterCompletion(false); }, [fsmState]);
  const closeAssistant = useCallback(() => { setAssistantOpen(false); requestAnimationFrame(() => assistantTrigger.current?.focus()); }, []);
  const askAssistant = useCallback(() => { assistantTrigger.current = document.activeElement as HTMLButtonElement; setAssistantOpen(true); }, []);
  const nextQuest = () => { dismissCompletion(); setBrowseAfterCompletion(true); setAssistantOpen(false); sendText('再推荐几条支线吧'); };

  // 当前步的软节奏计时器：辅助对话开关不影响任务计时状态。
  // 当前步 = S2 已发布的最后一步；check 就位步 suggestedSeconds=0 → 不开表（stepKey=null）
  const activeStep = fsmState === 'S2' && quest ? quest.steps[quest.steps.length - 1] : undefined;
  const activeTimed = !!(activeStep?.suggestedSeconds && activeStep.suggestedSeconds > 0);
  const timerStepKey = quest?.id && activeStep && activeTimed
    ? `${quest.id}#${activeStep.index}`
    : null;
  const stepTimer = useStepTimer(timerStepKey, activeTimed ? activeStep!.suggestedSeconds! : 0);

  // 提交后若被吱呀驳回（一轮结束仍停在 S2 同一步）：解冻计时器接着走；
  // 通过则会有新的 step_published 切键重置，resume 对新键是空操作
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && fsmState === 'S2' && (lastAction === 'submit_text' || lastAction === 'submit_photo')) {
      stepTimer.resume();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, fsmState, stepTimer, lastAction]);

  // 提交证物前先定格计时、取实际耗时上行（不计时的步骤 outcome=null）
  const handleSubmitText = (text: string) => {
    const outcome = stepTimer.active ? stepTimer.markSubmitted() : null;
    submitText(text, outcome?.elapsedSeconds);
  };
  const handleSubmitPhoto = (file: File, description: string) => {
    const outcome = stepTimer.active ? stepTimer.markSubmitted() : null;
    void submitPhoto(file, description, outcome?.elapsedSeconds);
  };

  const isInputDisabled = isStreaming || isConnecting || isRestoring;
  // 定位徽章：进应用即请求授权，仅在定位成功开启后出现，显示"城市 · 天气"（env_resolved 回传）
  const geoPlace = envInfo?.city || envInfo?.district || null;
  const geoWeather = envInfo?.weather
    ? `${envInfo.weather.text} ${envInfo.weather.tempC}°`
    : null;
  const geoLabel = geoPlace ? `${geoPlace}${geoWeather ? ` · ${geoWeather}` : ''}` : '定位已开';

  if (typeof onboarding.step === 'number') return (
    <div className="app-shell h-[100dvh]" style={viewportHeight ? { height: viewportHeight, '--app-height': `${viewportHeight}px` } as CSSProperties : undefined}>
      <AppOnboarding
        step={onboarding.step}
        onStep={onboarding.go}
        onSkip={() => onboarding.close()}
        onFinish={() => onboarding.close('done')}
        preferences={<PreferenceSheet embedded open compact onClose={() => onboarding.go(6)} initial={profile} pairs={questPairs} onSave={saveUserProfile} onSaved={() => { if (guideStepRef.current === 5) onboarding.go(6); }} />}
        goals={<GoalsView embedded quickSetup onClose={() => onboarding.close('done')} onStart={startGoalFromLibrary} busy={isStreaming || isRestoring || isConnecting} executing={fsmState === 'S2'} currentSessionId={sessionId} revision={handbook?.stats.total ?? 0} onConfirmed={() => { if (guideStepRef.current === 6) onboarding.close('done'); }} />}
      />
    </div>
  );

  return (
    <div
      className="app-shell h-[100dvh] flex flex-col relative overflow-hidden notebook-page"
      style={viewportHeight ? { height: viewportHeight, '--app-height': `${viewportHeight}px` } as CSSProperties : undefined}
    >
      {libraryTab && <PersonalLibrary tab={libraryTab} onTabChange={setLibraryTab} onClose={() => setLibraryTab(null)} onOpenGuide={openGuide} needsPreferences={!profile?.onboarded} panels={guide => ({
        inspiration: <InspirationView />,
        preferences: <PreferenceSheet embedded open guided={guide.guidedPreferences} onSaved={guide.onPreferencesSaved} onClose={() => setLibraryTab(null)} initial={profile} pairs={questPairs} onSave={saveUserProfile} onFit={fitUserProfile} />,
        goals: <GoalsView embedded guided={guide.guidedGoals} onGoalsLoaded={guide.onGoalsLoaded} onConfirmed={guide.onGoalConfirmed} onClose={() => setLibraryTab(null)} onStart={startGoalFromLibrary} busy={isStreaming || isRestoring || isConnecting} executing={fsmState === 'S2'} currentSessionId={sessionId} revision={handbook?.stats.total ?? 0} />,
        handbook: handbook ? <HandbookView embedded view={handbook} onClose={() => setLibraryTab(null)} busy={isStreaming || isConnecting || isRestoring} onStartQuest={() => { setLibraryTab(null); setShowHome(false); if (!started) start('我有15分钟，想做一件轻松的小事'); }} /> : <div className="library-loading" role="status">还没能打开日常记录<button onClick={refreshHandbook}>重新加载</button></div>,
      })} />}
      {!started && isRestoring ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center" role="status">
          <p className="font-hand text-fog">{error || '正在打开你的支线记录…'}</p>
          {error && <button className="stamp-badge min-h-[44px]" onClick={retryRestore}>重新连接</button>}
        </div>
      ) : null}
      {(!started && !isRestoring || showHome) && <LandingScreen onStart={startFromHome} onResume={started ? () => setShowHome(false) : undefined} busy={isInputDisabled} onOpenLibrary={() => openLibrary()} onOpenGuide={openGuide} needsPreferences={!profile?.onboarded} />}
      {started && <div className="session-layout" hidden={showHome}>
        {taskMode && <div className="task-main-surface" ref={node => { if (node) node.inert = assistantOpen; }} aria-hidden={assistantOpen || undefined}>
          <TaskWorkspace
            state={fsmState} quest={quest} selection={selectedActivity} timeline={timeline}
            busy={isStreaming} restoring={isRestoring} lastAction={lastAction} review={stepReview} error={error}
            timer={stepTimer} reward={reward} goalNotice={goalNotice}
            draftPrefix={`xian-task-draft:${sessionId}:${questHistory.filter(q => q.id !== quest?.id).length}:${quest?.title || selectedActivity?.title || ''}`}
            onSubmitText={handleSubmitText} onSubmitPhoto={handleSubmitPhoto}
            onAsk={askAssistant} onHome={() => setShowHome(true)} onLibrary={() => { dismissCompletion(); openLibrary('handbook'); }}
            onGoals={() => { dismissCompletion(); openLibrary('goals'); }} onNext={nextQuest} onAbandon={abandon} onRetry={retryRestore}
          />
        </div>}
        {(!taskMode || assistantOpen) && <div className={taskMode ? 'task-conversation-overlay' : 'conversation-main'}>
          {taskMode && <button className="task-conversation-scrim" aria-label="关闭辅助对话，返回任务" tabIndex={-1} onClick={closeAssistant} />}
          {!taskMode && immersive ? <ImmersiveCall
            fsmState={fsmState} timeline={timeline} isStreaming={isStreaming} quest={quest} questHistory={questHistory}
            proposedActivities={proposedActivities} stepTimer={stepTimer} onExit={() => setImmersive(false)}
            onOpenHandbook={() => openLibrary('handbook')} onSendText={sendText} onSelectActivity={selectActivity}
            onRefreshActivities={() => sendText('换一批')} onSubmitText={handleSubmitText} onSubmitPhoto={handleSubmitPhoto} onAbandon={abandon}
          /> : <ConversationPanel
            timeline={timeline} fsmState={fsmState} streaming={isStreaming} thinking={isThinking}
            stepping={steppingText} skeleton={uiSkeleton} disabled={isInputDisabled} connecting={isConnecting}
            error={error} value={inputValue} onChange={setInputValue} onSend={sendText} onSelect={selectActivity}
            onRetry={retryRestore} onHome={() => setShowHome(true)} onLibrary={() => openLibrary()}
            onNew={() => { setInputValue(''); startNewSession(); }} onImmersive={() => setImmersive(true)}
            taskTitle={taskMode ? quest?.title || selectedActivity?.title : undefined} onReturnToTask={taskMode ? closeAssistant : undefined}
            locationLabel={geoSupported && geoStatus === 'granted' ? geoLabel : null}
          />}
        </div>}
      </div>}
    </div>
  );
}
