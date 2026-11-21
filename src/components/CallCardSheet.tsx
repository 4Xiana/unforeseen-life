import type { ReactNode } from 'react';
import type { FSMState, ActivityPlan, QuestProgress, ArchivedQuest } from '../types';
import { ActivityCards } from './ActivityCards';
import { TaskStep } from './TaskStep';
import type { StepTimerApi } from '../hooks/useStepTimer';

interface Props {
  open: boolean;
  fsmState: FSMState;
  activities: ActivityPlan[];
  quest: QuestProgress | null;
  history: ArchivedQuest[];
  isStreaming: boolean;
  timer: StepTimerApi;
  onClose: () => void;
  onSelectActivity: (id: string) => void;
  onRefreshActivities: () => void;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
  onAbandon: () => void;
}

function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="viewport-overlay fixed inset-0 z-40 flex flex-col justify-end">
      <button
        aria-label="关闭卡片弹层"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20 cursor-default"
      />
      <div role="dialog" aria-modal="true" aria-label={title} className="call-sheet relative w-full max-w-xl mx-auto bg-paper rounded-t-[28px] border-t-2 border-paper-edge shadow-[0_-8px_30px_rgba(45,42,38,0.12)] max-h-[88%] sm:max-h-[78%] flex flex-col animate-slide-up">
        <div className="shrink-0 pt-2.5 pb-1 flex flex-col items-center gap-1">
          <div className="w-10 h-1.5 rounded-full bg-fog-light/80 rounded-full" />
          <div className="w-full px-4 sm:px-5 pt-2 flex items-center justify-between gap-3">
            <h2 className="min-w-0 font-display text-ink text-[17px] leading-snug">{title}</h2>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="w-11 h-11 shrink-0 rounded-full text-fog hover:text-ink flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="panel-content min-h-0 overflow-y-auto px-5 pb-6 scrollbar-hide">
          <div className="max-w-lg mx-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CallCardSheet(props: Props) {
  const {
    open, fsmState, activities, quest, isStreaming, timer,
    onClose, onSelectActivity, onRefreshActivities,
    onSubmitText, onSubmitPhoto, onAbandon,
  } = props;

  if (!open) return null;

  const title = {
    S0: '支线 · 通话中',
    S1: '挑选一条支线',
    S2: quest?.title ?? '进行中的支线',
    S3: '支线已完成',
  }[fsmState];

  return (
    <SheetShell title={title} onClose={onClose}>
      {fsmState === 'S1' && (
        <>
          <ActivityCards
            activities={activities}
            onSelect={onSelectActivity}
            disabled={isStreaming}
            locked={false}
          />
          <div className="flex justify-center pt-2">
            <button
              onClick={onRefreshActivities}
              disabled={isStreaming}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-fog hover:text-ink bg-card border border-fog-light/70 hover:border-fog px-4 py-2 rounded-full transition-colors disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1.5 2.5V5.5H4.5M11.5 10.5V7.5H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2.25 5.5C2.75 3.75 4.5 2.25 6.5 2.25C8.75 2.25 10.5 3.75 11.25 5.5M10.75 7.5C10.25 9.25 8.5 10.75 6.5 10.75C4.25 10.75 2.5 9.25 1.75 7.5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              换一批
            </button>
          </div>
        </>
      )}

      {fsmState === 'S2' && quest && (
        <>
          <TaskStep
            step={quest.steps[quest.steps.length - 1]}
            total={quest.total}
            onSubmitText={onSubmitText}
            onSubmitPhoto={onSubmitPhoto}
            disabled={isStreaming}
            done={false}
            timer={timer}
          />
          <div className="flex justify-center pt-3">
            <button
              onClick={onAbandon}
              disabled={isStreaming}
              className="text-[12.5px] text-fog hover:text-coral transition-colors disabled:opacity-40"
            >
              放下这条支线
            </button>
          </div>
        </>
      )}

      {fsmState === 'S3' && (
        <div className="text-center py-6 font-hand text-ink-2 text-[15px] leading-relaxed">
          这条支线，已经存入日常记录啦。
        </div>
      )}

      {fsmState === 'S0' && (
        <div className="text-center py-6 font-hand text-fog text-[15px]">
          先告诉吱呀，你有多少空闲，我们再挑支线。
        </div>
      )}
    </SheetShell>
  );
}
