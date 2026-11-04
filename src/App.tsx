import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAgentSession } from './hooks/useAgentSession';
import { ChatMessage } from './components/ChatMessage';
import { ActivityCards } from './components/ActivityCards';
import { TaskStep } from './components/TaskStep';
import { CompletionScreen } from './components/CompletionScreen';
import { HandbookView } from './components/HandbookView';
import { RecordsView } from './components/RecordsView';
import { QuestDrawer } from './components/QuestDrawer';
import { LandingScreen } from './components/LandingScreen';
import { ImmersiveCall } from './components/ImmersiveCall';
import { DockSkeleton } from './components/DockSkeleton';
import { VoiceButton } from './components/VoiceButton';
import { useSpeechInput } from './hooks/useSpeechInput';
import { useStepTimer } from './hooks/useStepTimer';

// 吱呀发出的内容块（文字 / 活动卡 / 步骤卡 / 骨架屏）：连续多块只显示一次头像
function isXianKind(kind: string | undefined): boolean {
  return kind === 'npc' || kind === 'activities' || kind === 'step';
}

// 非文字内容（活动卡 / 步骤卡 / 骨架屏）共用的信封：头像 + 署名
function NpcEnvelope({ children, showHeader = true }: { children: ReactNode; showHeader?: boolean }) {
  return (
    <div className="flex justify-start animate-slide-in-left">
      <div className="w-full flex gap-2.5">
        {showHeader ? (
          <img
            src="/agent_avatar.png"
            alt="吱呀"
            width={32}
            height={32}
            className="w-8 h-8 rounded-full mt-0.5 shrink-0 self-start object-cover"
          />
        ) : (
          <div className="w-8 shrink-0 self-start" aria-hidden />
        )}
        <div className="flex-1 min-w-0">
          {showHeader && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-hand text-[15px] leading-none text-fog">
                吱呀
              </span>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

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
    const update = () => setHeight(Math.round(vv.height - vv.offsetTop));
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
  const {
    started,
    timeline,
    fsmState,
    isStreaming,
    isThinking,
    steppingText,
    uiSkeleton,
    isConnecting,
    error,
    completed,
    handbook,
    reward,
    quest,
    questHistory,
    proposedActivities,
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
  } = useAgentSession();
  const viewportHeight = useViewportHeight();

  const [inputValue, setInputValue] = useState('');
  const [showHandbook, setShowHandbook] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [showQuest, setShowQuest] = useState(false);
  // 沉浸通话模式：语音对话 + 字幕 + 独立卡片弹层
  const [immersive, setImmersive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatVoice = useSpeechInput(inputValue, setInputValue);

  // 最近一批活动卡 / 最近一张步骤卡的位置：只有"最新且处于对应阶段"的卡可交互
  let lastActivitiesIdx = -1;
  let lastStepIdx = -1;
  timeline.forEach((it, i) => {
    if (it.kind === 'activities') lastActivitiesIdx = i;
    if (it.kind === 'step') lastStepIdx = i;
  });

  const s2Evaluating = fsmState === 'S2' && isStreaming;

  // ── 当前步的软节奏计时器（聊天卡与抽屉共用这一个实例）──
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
    if (prevStreamingRef.current && !isStreaming && fsmState === 'S2') {
      stepTimer.resume();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, fsmState, stepTimer]);

  // 提交证物前先定格计时、取实际耗时上行（不计时的步骤 outcome=null）
  const handleSubmitText = (text: string) => {
    const outcome = stepTimer.active ? stepTimer.markSubmitted() : null;
    submitText(text, outcome?.elapsedSeconds);
  };
  const handleSubmitPhoto = (file: File, description: string) => {
    const outcome = stepTimer.active ? stepTimer.markSubmitted() : null;
    void submitPhoto(file, description, outcome?.elapsedSeconds);
  };

  // 任务板抽屉：选支线（S1）→ 步骤进度（S2）→ 完成（S3）全程常驻。
  // tag 一旦出现就不再卸载，只换文案/颜色；数据未到的间隙用过程态文案兜底，衔接不留空位
  const questDoneCount = quest
    ? (fsmState === 'S3'
        ? quest.total
        : Math.max(0, quest.steps[quest.steps.length - 1]?.index ?? 0))
    : 0;
  const boardAvailable = fsmState === 'S1' || fsmState === 'S2' || fsmState === 'S3';
  // 活动卡/步骤还在生成的间隙：tag 保持在原位，显示过程态
  const boardLoading =
    (fsmState === 'S1' && proposedActivities.length === 0) ||
    (fsmState === 'S2' && !quest);
  const boardLabel = {
    S0: '',
    S1: proposedActivities.length > 0 ? '挑选支线' : '构思支线…',
    S2: quest ? `进度 ${questDoneCount}/${quest.total}` : '准备出发…',
    S3: `已完成 ${questDoneCount}/${quest?.total ?? 0}`,
  }[fsmState];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline, isThinking, steppingText, uiSkeleton]);

  const handleSend = () => {
    if (!inputValue.trim() || isStreaming) return;
    chatVoice.reset();
    sendText(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isInputDisabled = isStreaming || isConnecting;

  const stateDotColor = {
    S0: 'var(--fog)',
    S1: 'var(--orange)',
    S2: 'var(--moss)',
    S3: 'var(--teal)',
  }[fsmState];

  // 定位徽章：进应用即请求授权，仅在定位成功开启后出现，显示"城市 · 天气"（env_resolved 回传）
  const geoPlace = envInfo?.city || envInfo?.district || null;
  const geoWeather = envInfo?.weather
    ? `${envInfo.weather.text} ${envInfo.weather.tempC}°`
    : null;
  const geoLabel = geoPlace ? `${geoPlace}${geoWeather ? ` · ${geoWeather}` : ''}` : '定位已开';
  const geoTitle = geoWeather
    ? `已开启定位：${geoPlace || '已获取位置'}，${geoWeather}。吱呀会参考天气和位置推荐支线`
    : '已开启定位，吱呀会参考你在哪儿、什么天气来推荐支线';

  return (
    <div
      className="h-[100dvh] flex flex-col relative overflow-hidden notebook-page"
      style={viewportHeight ? { height: viewportHeight } : undefined}
    >
      {completed && (
        <CompletionScreen
          reward={reward}
          totalCount={handbook?.stats.total ?? 0}
          onDismiss={dismissCompletion}
          onViewHandbook={() => { dismissCompletion(); setShowHandbook(true); }}
        />
      )}
      {showHandbook && handbook && (
        <HandbookView view={handbook} onClose={() => setShowHandbook(false)} />
      )}
      {showRecords && handbook && (
        <RecordsView view={handbook} onClose={() => setShowRecords(false)} />
      )}
      {showQuest && (
        <QuestDrawer
          fsmState={fsmState}
          activities={proposedActivities}
          quest={quest}
          history={questHistory}
          isStreaming={isStreaming}
          onSelectActivity={selectActivity}
          onRefreshActivities={() => sendText('换一批')}
          onSubmitText={handleSubmitText}
          onSubmitPhoto={handleSubmitPhoto}
          onAbandon={abandon}
          onClose={() => setShowQuest(false)}
          timer={stepTimer}
        />
      )}

      {!started ? (
        <LandingScreen onStart={start} onOpenHandbook={() => { refreshHandbook(); setShowHandbook(true); }} profile={profile} pairs={questPairs} onSaveProfile={saveUserProfile} />
      ) : (
      <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
      {immersive ? (
        <ImmersiveCall
          fsmState={fsmState}
          timeline={timeline}
          isStreaming={isStreaming}
          quest={quest}
          questHistory={questHistory}
          proposedActivities={proposedActivities}
          stepTimer={stepTimer}
          onExit={() => setImmersive(false)}
          onOpenHandbook={() => { refreshHandbook(); setShowHandbook(true); }}
          onSendText={sendText}
          onSelectActivity={selectActivity}
          onRefreshActivities={() => sendText('换一批')}
          onSubmitText={handleSubmitText}
          onSubmitPhoto={handleSubmitPhoto}
          onAbandon={abandon}
        />
      ) : (
      <>
      <header className="shrink-0 z-10 relative">
        <div className="px-5 pt-5 pb-3 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl bg-card border-2 border-ink text-moss flex items-center justify-center shadow-paper"
                  style={{ transform: 'rotate(-3deg)' }}>
                  <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                    <path d="M3 15L3.5 9L9 3L14.5 9L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 15V11C6 9.34315 7.34315 8 9 8C10.6569 8 12 9.34315 12 11V15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <circle cx="9" cy="6" r="0.8" fill="currentColor"/>
                  </svg>
                </div>
              </div>
              <div>
                <h1 className="font-display text-ink text-[22px] leading-none">
                  支线任务
                </h1>
                <p className="font-hand text-fog text-[14px] leading-none mt-1.5">
                  unforeseen · life
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {geoSupported && geoStatus === 'granted' && (
                <span
                  title={geoTitle}
                  className="stamp-badge flex items-center gap-1.5 text-teal border-teal/40"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 14 14" fill="none"
                    className="shrink-0 text-teal"
                  >
                    <path d="M7 12.5C7 12.5 11.5 8.6 11.5 5.6C11.5 3.1 9.5 1.3 7 1.3C4.5 1.3 2.5 3.1 2.5 5.6C2.5 8.6 7 12.5 7 12.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                    <circle cx="7" cy="5.5" r="1.7" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                  {geoLabel}
                </span>
              )}
              {boardAvailable && (
                <button
                  onClick={() => setShowQuest(true)}
                  className={`stamp-badge transition-colors flex items-center justify-center gap-1.5 min-w-[96px] ${
                    boardLoading ? 'text-fog' : 'hover:text-moss-deep hover:border-moss/40'
                  }`}
                  title="任务进度"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${boardLoading ? 'animate-pulse' : ''}`}
                    style={{ background: boardLoading ? 'var(--fog)' : stateDotColor }}
                  />
                  <span className="tabular-nums">{boardLabel}</span>
                </button>
              )}
              <button
                onClick={() => setShowHandbook(true)}
                className="stamp-badge hover:text-moss-deep hover:border-moss/40 transition-colors flex items-center gap-1"
                title="我的支线手账"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-orange">
                  <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" fill="currentColor" strokeLinejoin="round"/>
                </svg>
                手账{handbook && handbook.stats.total > 0 ? ` ${handbook.stats.total}` : ''}
              </button>
              <button
                onClick={() => setShowRecords(true)}
                className="stamp-badge hover:text-moss-deep hover:border-moss/40 transition-colors flex items-center gap-1"
                title="支线记录：每一步的证物"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-teal">
                  <path d="M3 2.5H11V11.5H3V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  <path d="M5 5H9M5 7.5H9M5 10H7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
                记录
              </button>
              <button
                onClick={() => setImmersive(true)}
                className="stamp-badge hover:text-moss-deep hover:border-moss/40 transition-colors flex items-center gap-1"
                title="沉浸通话模式：语音对话 + 字幕"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-moss">
                  <path d="M4 7V9C4 11.2 5.8 13 8 13C10.2 13 12 11.2 12 9V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <rect x="2.5" y="3" width="3" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                  <rect x="10.5" y="3" width="3" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
                沉浸
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-fog-light/50 mx-5"/>
      </header>

      {error && (
        <div className="px-5 py-2 bg-coral/[8%] border-b border-coral/20 shrink-0 z-10">
          <p className="text-coral text-[12px] flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
              <path d="M6 3.5V6.5M6 8V8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {error}
          </p>
        </div>
      )}

      {isConnecting ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="relative w-10 h-10 mx-auto mb-4">
              <div className="absolute inset-0 border-2 border-fog-light rounded-full"/>
              <div className="absolute inset-0 border-2 border-transparent border-t-moss rounded-full animate-spin"/>
            </div>
            <p className="font-hand text-fog text-[16px]">吱呀正在赶来…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4" id="message-scroll-area">
            <div className="max-w-lg mx-auto space-y-4">
              {timeline.map((item, idx) => {
                const prev = timeline[idx - 1];
                // 连续同属吱呀的块只显示一次头像+署名
                const showHeader = !prev || !isXianKind(prev.kind);
                if (item.kind === 'activities') {
                  const isActive = idx === lastActivitiesIdx && fsmState === 'S1';
                  return (
                    <NpcEnvelope key={item.id} showHeader={showHeader}>
                      <ActivityCards
                        activities={item.activities}
                        onSelect={selectActivity}
                        disabled={isActive && isStreaming}
                        locked={!isActive}
                      />
                      {isActive && !isStreaming && (
                        <div className="flex justify-center pb-1 pt-0.5">
                          <button
                            onClick={() => sendText('换一批')}
                            className="flex items-center gap-1.5 text-[12px] font-medium text-fog hover:text-ink bg-card border border-fog-light/70 hover:border-fog px-4 py-2 rounded-full transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                              <path d="M1.5 2.5V5.5H4.5M11.5 10.5V7.5H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M2.25 5.5C2.75 3.75 4.5 2.25 6.5 2.25C8.75 2.25 10.5 3.75 11.25 5.5M10.75 7.5C10.25 9.25 8.5 10.75 6.5 10.75C4.25 10.75 2.5 9.25 1.75 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            </svg>
                            换一批
                          </button>
                        </div>
                      )}
                    </NpcEnvelope>
                  );
                }

                if (item.kind === 'step') {
                  const isActive = idx === lastStepIdx && fsmState === 'S2';
                  return (
                    <NpcEnvelope key={item.id} showHeader={showHeader}>
                      <div className="relative">
                        {isActive && s2Evaluating && (
                          <div className="absolute inset-0 z-10 bg-paper/85 backdrop-blur-[1px] flex items-center justify-center rounded-[24px]">
                            <div className="flex items-center gap-2 font-hand text-fog text-[15px]">
                              <span className="typing-dot" style={{animationDelay:'0ms',width:'5px',height:'5px'}}/>
                              <span className="typing-dot" style={{animationDelay:'150ms',width:'5px',height:'5px'}}/>
                              <span className="typing-dot" style={{animationDelay:'300ms',width:'5px',height:'5px'}}/>
                              <span>看看你做得怎么样…</span>
                            </div>
                          </div>
                        )}
                        <TaskStep
                          step={item.step}
                          total={item.total}
                          onSubmitText={handleSubmitText}
                          onSubmitPhoto={handleSubmitPhoto}
                          disabled={isStreaming}
                          done={!isActive}
                          timer={isActive ? stepTimer : null}
                        />
                      </div>
                    </NpcEnvelope>
                  );
                }

                const isLast = idx === timeline.length - 1;
                const isLastNpc = isLast && item.kind === 'npc';
                // 动效线性化：气泡只在它自己是"最新一步"时带动效；
                // 骨架屏（出卡/出步骤中）或 S2 评估遮罩一旦出现，动效归它们，气泡完全静止
                const npcAnimActive = isLastNpc && !uiSkeleton && !s2Evaluating;
                // 空的占位气泡（含纯空白）且动效已由骨架屏/遮罩承担 → 不渲染空卡片
                if (isLastNpc && !item.content?.trim() && (uiSkeleton || s2Evaluating)) return null;
                return (
                  <ChatMessage
                    key={item.id}
                    message={{
                      id: item.id,
                      role: item.kind,
                      content: item.content,
                      timestamp: item.timestamp,
                      imageUrl: item.kind === 'user' ? item.imageUrl : undefined,
                    }}
                    showHeader={showHeader}
                    isStreaming={isStreaming && npcAnimActive}
                    isThinking={isThinking && npcAnimActive}
                    steppingText={npcAnimActive ? steppingText : null}
                  />
                );
              })}

              {uiSkeleton && (
                <NpcEnvelope showHeader={!isXianKind(timeline[timeline.length - 1]?.kind)}>
                  <DockSkeleton type={uiSkeleton} />
                </NpcEnvelope>
              )}

              {isStreaming && !uiSkeleton && timeline[timeline.length - 1]?.kind !== 'npc' && (
                <div className="flex items-center gap-2 pl-11 py-2">
                  <div className="typing-dot"/>
                  <div className="typing-dot" style={{ animationDelay: '0.2s' }}/>
                  <div className="typing-dot" style={{ animationDelay: '0.4s' }}/>
                </div>
              )}

              <div ref={messagesEndRef}/>
            </div>
          </div>

          <div className="shrink-0 z-20 relative">
            <div className="px-5 py-3 bg-paper">
              <div className="max-w-lg mx-auto">
                {fsmState === 'S0' && !isStreaming && timeline.some(it => it.kind === 'npc') && (
                  <div className="flex justify-center pb-2">
                    <button
                      onClick={() => { setInputValue(''); sendText('我也没想好，你按15分钟给我推荐吧'); }}
                      className="flex items-center gap-1.5 text-[13.5px] font-hand text-moss-deep bg-moss/[12%] border border-moss/40 hover:bg-moss/20 px-4 py-2 rounded-full transition-colors shadow-paper-sm"
                    >
                      没想好？按 15 分钟直接来
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7H11M8 4L11 7L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                )}
                <div className="bg-card border border-paper-edge/80 rounded-full shadow-paper-md p-1.5 pl-2 flex gap-1 items-end">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      chatVoice.listening ? '正在聆听，说完点一下麦克风…' :
                      fsmState === 'S0' ? '说说你有多少空闲，可以留给自己…' :
                      fsmState === 'S1' ? '选一个，或者说说你的想法...' :
                      '想跟吱呀说点什么…'
                    }
                    disabled={isInputDisabled}
                    className="flex-1 bg-transparent text-ink text-[14px] px-3 py-2.5 focus:outline-none placeholder:text-fog/70 min-w-0"
                  />
                  {chatVoice.supported && (
                    <VoiceButton
                      listening={chatVoice.listening}
                      error={chatVoice.error}
                      onToggle={chatVoice.toggle}
                      disabled={isInputDisabled}
                    />
                  )}
                  <button
                    onClick={handleSend}
                    disabled={isInputDisabled || !inputValue.trim()}
                    className="p-3 bg-moss text-ink rounded-full hover:bg-moss-deep hover:text-card transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-btn"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M3 9L15 3L12 15L9 10L3 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 10L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <p className="text-center font-hand text-fog/60 text-[13px] mt-2">
                  unforeseen life · 支线任务
                </p>
              </div>
            </div>
          </div>
        </>
      )}
      </>
      )}
      </div>
      )}

    </div>
  );
}
