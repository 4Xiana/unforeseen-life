import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineItem, FSMState, ActivityPlan, QuestProgress, ArchivedQuest } from '../types';
import { useTTS } from '../hooks/useTTS';
import { useSpeechInput } from '../hooks/useSpeechInput';
import type { StepTimerApi } from '../hooks/useStepTimer';
import { CallCardSheet } from './CallCardSheet';

type TextItem = Extract<TimelineItem, { kind: 'user' | 'npc' }>;

interface Props {
  fsmState: FSMState;
  timeline: TimelineItem[];
  isStreaming: boolean;
  quest: QuestProgress | null;
  questHistory: ArchivedQuest[];
  proposedActivities: ActivityPlan[];
  stepTimer: StepTimerApi;
  onExit: () => void;
  onOpenHandbook: () => void;
  onSendText: (text: string) => void;
  onSelectActivity: (id: string) => void;
  onRefreshActivities: () => void;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
  onAbandon: () => void;
}

export function ImmersiveCall(props: Props) {
  const {
    fsmState, timeline, isStreaming, quest, questHistory, proposedActivities, stepTimer,
    onExit, onOpenHandbook, onSendText, onSelectActivity, onRefreshActivities,
    onSubmitText, onSubmitPhoto, onAbandon,
  } = props;

  const tts = useTTS();
  const [muted, setMuted] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [voiceText, setVoiceText] = useState('');

  // 提交最终识别文本：用 ref 规避「hook 回调引用尚未声明的 callVoice」的顺序问题
  const commitRef = useRef<(text: string) => void>(() => {});
  const callVoice = useSpeechInput(voiceText, setVoiceText, t => commitRef.current(t));
  commitRef.current = (text: string) => {
    callVoice.reset();
    setVoiceText('');
    onSendText(text);
  };

  const spokenIdRef = useRef<string | null>(null);

  // 轮次开始：停止吱呀语音；轮次结束：朗读该轮 npc 成稿（静音或不支持时跳过）
  useEffect(() => {
    if (isStreaming) {
      tts.cancel();
      return;
    }
    for (let i = timeline.length - 1; i >= 0; i--) {
      const it = timeline[i];
      if (it.kind === 'npc') {
        if (spokenIdRef.current !== it.id) {
          spokenIdRef.current = it.id;
          if (!muted && it.content.trim()) tts.feed(it.content);
        }
        break;
      }
    }
  }, [isStreaming, timeline, muted, tts]);

  // 进入选支线 / 做步骤阶段：自动拉出卡片弹层（非阻断，可关可重开）
  useEffect(() => {
    if (fsmState === 'S1' || fsmState === 'S2') setCardOpen(true);
  }, [fsmState]);

  // 退出通话页：停止语音与收音
  useEffect(() => {
    return () => {
      tts.cancel();
      callVoice.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTalk = useCallback(() => {
    if (!callVoice.supported || isStreaming) return;
    tts.cancel();
    setVoiceText('');
    callVoice.begin();
  }, [callVoice, isStreaming, tts]);

  const endTalk = useCallback(() => {
    callVoice.end();
  }, [callVoice]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      if (!m) tts.cancel();
      return !m;
    });
  }, [tts]);

  // ── 字幕：只取文字条目，最近 3 条；聆听中追加实时识别句 ──
  const textItems: TextItem[] = timeline.filter(
    (it): it is TextItem => (it.kind === 'user' || it.kind === 'npc') && !!it.content.trim(),
  );
  const recent = textItems.slice(-3);
  const listeningNow = callVoice.listening;

  const status = listeningNow
    ? { label: '聆听中', dot: 'bg-orange' }
    : tts.speaking
      ? { label: '吱呀中', dot: 'bg-moss' }
      : isStreaming
        ? { label: '思考中', dot: 'bg-fog animate-pulse' }
        : { label: '待命中', dot: 'bg-fog-light' };

  const pillLabel = {
    S0: '',
    S1: proposedActivities.length ? `支线 · ${proposedActivities.length} 选 1` : '支线构思中…',
    S2: quest ? `进度 ${Math.max(0, quest.steps[quest.steps.length - 1]?.index ?? 0)}/${quest.total}` : '准备出发…',
    S3: '支线已完成',
  }[fsmState];
  const boardAvailable = fsmState === 'S1' || fsmState === 'S2' || fsmState === 'S3';

  const active = listeningNow || tts.speaking;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* 顶部：退出 / 标题 / 手账 */}
      <header className="shrink-0 z-10">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-[13px] font-hand text-fog hover:text-ink transition-colors px-2 py-1"
            title="退出沉浸，返回对话"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3.5L5 7L9 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            退出
          </button>

          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <h1 className="font-display text-ink text-[16px] leading-none">支线 · 通话中</h1>
          </div>

          <button
            onClick={onOpenHandbook}
            className="flex items-center gap-1 text-[13px] font-hand text-fog hover:text-orange transition-colors px-2 py-1"
            title="支线手账"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" fill="currentColor" strokeLinejoin="round"/>
            </svg>
            手账
          </button>
        </div>
        <div className="h-px bg-fog-light/50 mx-4"/>
      </header>

      {/* 中部：大头像 + 呼吸环 + 状态 */}
      <div className="shrink-0 flex flex-col items-center pt-8 pb-4">
        <div className="relative w-[120px] h-[120px]">
          {active && (
            <span
              className={`absolute inset-0 rounded-full animate-ping opacity-20 ${listeningNow ? 'bg-orange' : 'bg-moss'}`}
            />
          )}
          <div
            className={`absolute inset-0 rounded-full transition-transform duration-300 ${active ? 'scale-105' : 'scale-100'}`}
          >
            <img
              src="/agent_avatar.png"
              alt="吱呀"
              width={120}
              height={120}
              className="w-full h-full rounded-full object-cover border-[3px] border-card shadow-paper-md"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-4">
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <p className="font-hand text-[15px] text-ink-2 leading-none">{status.label}</p>
        </div>
      </div>

      {/* 字幕区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
        <div className="max-w-md mx-auto flex flex-col justify-end gap-2.5 min-h-full">
          {recent.map((it, i) => {
            const isLatest = !listeningNow && i === recent.length - 1;
            const isUser = it.kind === 'user';
            return (
              <div
                key={it.id}
                className={`flex flex-col gap-0.5 transition-opacity duration-300 ${isLatest ? 'opacity-100' : 'opacity-45'}`}
              >
                <span className={`text-[11px] font-hand leading-none ${isUser ? 'text-orange' : 'text-moss'}`}>
                  {isUser ? '我' : '吱呀'}
                </span>
                <p className={`text-[15px] leading-relaxed text-ink ${isLatest ? 'font-medium' : ''}`}>
                  {it.content}
                </p>
              </div>
            );
          })}
          {listeningNow && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-hand leading-none text-orange">我</span>
              <p className="text-[15px] leading-relaxed text-ink font-medium">
                {voiceText || <span className="text-fog">正在聆听…</span>}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 支线药丸 */}
      {boardAvailable && (
        <div className="shrink-0 flex justify-center pb-2">
          <button
            onClick={() => setCardOpen(true)}
            className="flex items-center gap-1.5 text-[12.5px] font-hand text-moss-deep bg-moss/[10%] border border-moss/30 hover:bg-moss/20 px-3.5 py-1.5 rounded-full transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
            </svg>
            {pillLabel}
          </button>
        </div>
      )}

      {/* 底部控制条：静音 / 说话 / 挂断 */}
      <div className="shrink-0 z-20 px-6 pb-7 pt-1">
        <div className="flex items-center justify-between max-w-xs mx-auto">
          <button
            onClick={toggleMute}
            aria-label={muted ? '取消静音' : '静音'}
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${
              muted ? 'bg-coral/15 border-coral/40 text-coral' : 'bg-card border-fog-light text-fog hover:text-ink'
            }`}
          >
            {muted ? (
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
                <path d="M5 8V12H8L12 15V5L8 8H5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M15 7.5C16 9 16 11 15 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M3.5 3.5L16.5 16.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
                <path d="M5 8V12H8L12 15V5L8 8H5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M15 7.5C16 9 16 11 15 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          <button
            onPointerDown={startTalk}
            onPointerUp={endTalk}
            onPointerLeave={endTalk}
            onPointerCancel={endTalk}
            disabled={!callVoice.supported || isStreaming}
            aria-label="按住说话"
            className="w-20 h-20 rounded-full bg-moss text-card shadow-btn flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed touch-none select-none"
          >
            {listeningNow ? (
              <span className="flex items-end gap-1 h-7">
                <span className="w-1.5 bg-card rounded-full origin-bottom animate-[eq_0.7s_ease-in-out_infinite] h-3"/>
                <span className="w-1.5 bg-card rounded-full origin-bottom animate-[eq_0.7s_ease-in-out_infinite] h-6" style={{ animationDelay: '0.15s' }}/>
                <span className="w-1.5 bg-card rounded-full origin-bottom animate-[eq_0.7s_ease-in-out_infinite] h-4" style={{ animationDelay: '0.3s' }}/>
                <span className="w-1.5 bg-card rounded-full origin-bottom animate-[eq_0.7s_ease-in-out_infinite] h-7" style={{ animationDelay: '0.45s' }}/>
              </span>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7"/>
                <path d="M5.5 11.5C5.5 15 8 17.5 12 17.5C16 17.5 18.5 15 18.5 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                <path d="M12 17.5V21M9 21H15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          <button
            onClick={onExit}
            aria-label="挂断并退出沉浸"
            className="w-12 h-12 rounded-full bg-coral text-card flex items-center justify-center shadow-btn active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <path d="M4 5.5C4 4.7 4.7 4 5.5 4H8.5C9.3 4 10 4.7 10 5.5V8C10 8.8 9.3 9.5 8.5 9.5H7.5C7.5 12.5 9.5 14.5 12.5 14.5V13.5C12.5 12.7 13.2 12 14 12H16.5C17.3 12 18 12.7 18 13.5V16.5C18 17.3 17.3 18 16.5 18H14C8 18 4 14 4 8V5.5Z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <p className="text-center text-[12px] text-fog mt-3 font-hand">
          {callVoice.supported ? '按住大圆钮说话，松开就发给吱呀' : '当前浏览器不支持语音识别，可看字幕 / 返回对话'}
        </p>
        {callVoice.error && (
          <p className="text-center text-[12px] text-coral mt-1">{callVoice.error}</p>
        )}
      </div>

      <CallCardSheet
        open={cardOpen}
        fsmState={fsmState}
        activities={proposedActivities}
        quest={quest}
        history={questHistory}
        isStreaming={isStreaming}
        timer={stepTimer}
        onClose={() => setCardOpen(false)}
        onSelectActivity={onSelectActivity}
        onRefreshActivities={onRefreshActivities}
        onSubmitText={onSubmitText}
        onSubmitPhoto={onSubmitPhoto}
        onAbandon={onAbandon}
      />
    </div>
  );
}
