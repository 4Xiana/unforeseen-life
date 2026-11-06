import type { QuestReward, GoalNotice } from '../hooks/useAgentSession';
import { CATEGORY_META } from '../handbook';

interface Props {
  reward: QuestReward | null;
  totalCount: number;
  onDismiss: () => void;
  onViewHandbook: () => void;
  goalNotice?: GoalNotice | null;
  onViewGoals?: () => void;
}

export function CompletionScreen({ reward, totalCount, onDismiss, onViewHandbook, goalNotice, onViewGoals }: Props) {
  const meta = reward ? CATEGORY_META[reward.category] : null;

  return (
    <div className="viewport-overlay completion-overlay fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in"
      style={{ background: 'rgba(253,251,247,0.92)', backdropFilter: 'blur(6px)' }}>

      <div role="dialog" aria-modal="true" aria-label="支线完成" className="completion-shell relative max-w-sm w-full animate-slide-up">
        <div className="tape tape-top-left" style={{ width: '60px', height: '18px', background: 'rgba(114,148,81,0.3)' }}/>
        <div className="tape tape-top-right" style={{ width: '60px', height: '18px', background: 'rgba(63,162,143,0.28)' }}/>

        <div className="completion-card bg-card border border-ink/[0.07] p-5 sm:p-8 rounded-[28px] shadow-paper-lg text-center relative overflow-hidden">
          <div className="relative">
            <div className="mx-auto mb-6 w-28 h-28 flex items-center justify-center animate-stamp"
              style={{ color: meta?.color ?? 'var(--teal)', transform: 'rotate(-8deg)' }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 112 112" fill="none">
                <path
                  d="M57 9 C83 7 103 28 104 55 C105 82 84 103 57 104 C31 105 10 85 9 57 C8 30 30 11 57 9 Z"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M60 12 C84 11 101 30 100 56"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.5"
                />
              </svg>
              <div className="text-center leading-tight">
                <div className="font-display text-[22px] leading-none">
                  {meta ? meta.char : '成'}
                </div>
                <div className="font-hand text-[14px] leading-none mt-1 opacity-80">
                  {meta ? meta.label : 'done'}
                </div>
              </div>
            </div>

            <h2 className="font-display text-ink text-[26px] mb-3">
              支线完成
            </h2>
            <p className="text-ink-2 text-[13.5px] leading-relaxed mb-4">
              {reward ? <>「{reward.questTitle}」已存入日常记录，</> : '这条支线已存入日常记录，'}
              <br/>
              这是你地图上的第 <span className="font-display" style={{ color: meta?.color ?? 'var(--teal)' }}>{totalCount || 1}</span> 个坐标。
            </p>

            {reward && reward.newBadges.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2 justify-center">
                {reward.newBadges.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-moss/40 bg-moss/10 text-moss-deep font-hand text-[13px]"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" fill="currentColor" strokeLinejoin="round"/>
                    </svg>
                    解锁成就 · {b.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mb-6 justify-center">
              <div className="w-8 h-px bg-fog-light"/>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fog">
                <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" stroke="currentColor" strokeWidth="0.8"/>
              </svg>
              <div className="w-8 h-px bg-fog-light"/>
            </div>

            <div className="flex flex-col gap-2.5">
              {goalNotice && <div className="p-3 mb-2 rounded-xl bg-moss/10 text-moss-deep text-[13px] leading-relaxed">
                <p>「{goalNotice.title}」· {goalNotice.completed}/{goalNotice.total} 章</p>
                {goalNotice.rewards.map(name => <p key={name}>✳ {name}</p>)}
                <button onClick={onViewGoals} className="min-h-[44px] underline">查看心愿成果 →</button>
              </div>}
              <button
                onClick={onViewHandbook}
                className="w-full py-3 px-6 bg-card text-ink font-display text-[16px] rounded-full border border-paper-edge hover:border-moss/50 hover:text-moss-deep transition-all duration-200 active:scale-[0.97]"
              >
                查看日常记录
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-3.5 px-6 bg-moss text-ink font-display text-[17px] rounded-full shadow-btn hover:bg-moss-deep hover:text-card transition-all duration-200 active:scale-[0.97]"
              >
                接下一个支线
              </button>
            </div>
          </div>
        </div>

        <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full border-2 border-orange/50 bg-orange/10 flex items-center justify-center text-orange rotate-12">
          <span className="font-display text-[16px] leading-none">★</span>
        </div>
        <div className="absolute -bottom-3 -left-3 w-11 h-11 rounded-full border-2 border-teal/50 bg-teal/10 flex items-center justify-center text-teal -rotate-6">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <path d="M2 10L5 7L8 10L12 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
