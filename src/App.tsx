import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAgentSession } from './hooks/useAgentSession';
import { ChatMessage } from './components/ChatMessage';
import { ActivityCards } from './components/ActivityCards';
import { TaskStep } from './components/TaskStep';
import { CompletionScreen } from './components/CompletionScreen';
import { HandbookView } from './components/HandbookView';
import { QuestDrawer } from './components/QuestDrawer';
import { LandingScreen } from './components/LandingScreen';
import { DockSkeleton } from './components/DockSkeleton';
import { XianMascot } from './components/XianMascot';
import { VoiceButton } from './components/VoiceButton';
import { useSpeechInput } from './hooks/useSpeechInput';

// 小闲发出的内容块（文字 / 活动卡 / 步骤卡 / 骨架屏）：连续多块只显示一次头像
function isXianKind(kind: string | undefined): boolean {
  return kind === 'npc' || kind === 'activities' || kind === 'step';
}

// 非文字内容（活动卡 / 步骤卡 / 骨架屏）共用的信封：头像 + 署名
function NpcEnvelope({ children, showHeader = true }: { children: ReactNode; showHeader?: boolean }) {
  return (
    <div className="flex justify-start animate-slide-in-left">
      <div className="w-full flex gap-2.5">
        {showHeader ? (
          <div className="avatar-badge mt-0.5 shrink-0 self-start">
            <XianMascot variant="face" mono size={15} />
          </div>
        ) : (
          <div className="w-8 shrink-0 self-start" aria-hidden />
        )}
        <div className="flex-1 min-w-0">
          {showHeader && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-hand text-[15px] leading-none text-fog">
                小闲
              </span>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
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
    confirmCheck,
    submitText,
    submitPhoto,
    abandon,
    dismissCompletion,
    refreshHandbook,
  } = useAgentSession();

  const [inputValue, setInputValue] = useState('');
  const [showHandbook, setShowHandbook] = useState(false);
  const [showQuest, setShowQuest] = useState(false);
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
    ? `已开启定位：${geoPlace || '已获取位置'}，${geoWeather}。小闲会参考天气和位置推荐支线`
    : '已开启定位，小闲会参考你在哪儿、什么天气来推荐支线';

  return (
    <div className="h-screen flex flex-col relative overflow-hidden notebook-page">
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
      {showQuest && (
        <QuestDrawer
          fsmState={fsmState}
          activities={proposedActivities}
          quest={quest}
          history={questHistory}
          isStreaming={isStreaming}
          onSelectActivity={selectActivity}
          onRefreshActivities={() => sendText('换一批')}
          onCheck={confirmCheck}
          onSubmitText={submitText}
          onSubmitPhoto={submitPhoto}
          onAbandon={abandon}
          onClose={() => setShowQuest(false)}
        />
      )}

      {!started ? (
        <LandingScreen onStart={start} />
      ) : (
      <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
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
            <p className="font-hand text-fog text-[16px]">小闲正在赶来…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4" id="message-scroll-area">
            <div className="max-w-lg mx-auto space-y-4">
              {timeline.map((item, idx) => {
                const prev = timeline[idx - 1];
                // 连续同属小闲的块只显示一次头像+署名
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
                          onCheck={confirmCheck}
                          onSubmitText={submitText}
                          onSubmitPhoto={submitPhoto}
                          disabled={isStreaming}
                          done={!isActive}
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
                      onClick={() => { setInputValue(''); sendText('没有啦，请开始构思吧'); }}
                      className="flex items-center gap-1.5 text-[13.5px] font-hand text-moss-deep bg-moss/[12%] border border-moss/40 hover:bg-moss/20 px-4 py-2 rounded-full transition-colors shadow-paper-sm"
                    >
                      没有啦，请开始构思吧
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
                      fsmState === 'S0' ? '聊聊你现在的时间和心情...' :
                      fsmState === 'S1' ? '选一个，或者说说你的想法...' :
                      '写下你的反馈...'
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
      </div>
      )}

      {!started && (
        <button
          onClick={() => { refreshHandbook(); setShowHandbook(true); }}
          className="absolute top-5 right-5 z-20 stamp-badge hover:text-moss-deep hover:border-moss/40 transition-colors flex items-center gap-1.5"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-orange">
            <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" fill="currentColor" strokeLinejoin="round"/>
          </svg>
          支线手账
        </button>
      )}
    </div>
  );
}
