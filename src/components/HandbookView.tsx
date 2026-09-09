import type { HandbookView, QuestCategory, BadgeState } from '../types';
import { CATEGORY_META, CATEGORY_ORDER, formatDate } from '../handbook';

interface Props {
  view: HandbookView;
  onClose: () => void;
}

function CategoryStamps({ view }: { view: HandbookView }) {
  return (
    <div className="flex justify-between gap-2 mb-6">
      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_META[cat];
        const count = view.stats.byCategory[cat] || 0;
        const active = count > 0;
        return (
          <div key={cat} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-display text-[18px] transition-all"
              style={{
                border: `2px ${active ? 'solid' : 'dashed'} ${active ? meta.color : 'var(--fog-light)'}`,
                color: active ? meta.color : 'var(--fog-light)',
                background: active ? `${meta.color}14` : 'transparent',
                transform: active ? 'rotate(-6deg)' : 'none',
              }}
            >
              {meta.char}
            </div>
            <span className="font-hand text-[12px]" style={{ color: active ? 'var(--ink-2)' : 'var(--fog)' }}>
              {meta.label}·{count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BadgeWall({ badges }: { badges: BadgeState[] }) {
  return (
    <div className="mb-6">
      <h3 className="font-hand text-fog text-[14px] mb-3 px-0.5">成就墙</h3>
      <div className="grid grid-cols-3 gap-2.5">
        {badges.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl border p-3 flex flex-col items-center text-center gap-1"
            style={{
              borderColor: b.earned ? 'var(--paper-edge)' : 'var(--fog-light)',
              borderStyle: b.earned ? 'solid' : 'dashed',
              background: b.earned ? '#fff' : 'transparent',
              opacity: b.earned ? 1 : 0.7,
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: b.earned ? 'var(--moss)' : 'transparent',
                border: b.earned ? 'none' : '1.5px dashed var(--fog-light)',
                color: b.earned ? '#fff' : 'var(--fog-light)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                {b.earned ? (
                  <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round"/>
                ) : (
                  <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
                )}
              </svg>
            </div>
            <span className="font-display text-[13px] leading-tight" style={{ color: b.earned ? 'var(--ink)' : 'var(--fog)' }}>
              {b.name}
            </span>
            {!b.earned && (
              <span className="font-hand text-[11px] text-fog leading-none">{b.progress}/{b.target}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketStub({ cat, title, date, evidence }: {
  cat: QuestCategory; title: string; date: string; evidence?: string;
}) {
  const meta = CATEGORY_META[cat];
  return (
    <div
      className="relative bg-card border border-ink/[0.07] rounded-2xl p-4 pl-5 shadow-paper-sm"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-display text-[15px] text-ink leading-tight">「{title}」</span>
        <span
          className="shrink-0 ml-2 font-hand text-[12px] px-2 py-0.5 rounded-full"
          style={{ color: meta.color, background: `${meta.color}14` }}
        >
          {meta.label}
        </span>
      </div>
      {evidence ? (
        <p className="font-hand text-[13px] text-ink-2 leading-relaxed mt-1 line-clamp-2">
          “{evidence}”
        </p>
      ) : (
        <p className="font-hand text-[13px] text-fog leading-relaxed mt-1">完成了这件小事</p>
      )}
      <p className="text-[11px] text-fog mt-1.5">{date}</p>
    </div>
  );
}

export function HandbookView({ view, onClose }: Props) {
  const empty = view.stats.total === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(45,42,38,0.35)', backdropFilter: 'blur(4px)' }}>
      <div className="relative w-full max-w-md max-h-[86vh] flex flex-col animate-slide-up">
        <div className="tape tape-top-left" style={{ width: '60px', height: '18px', background: 'rgba(240,160,62,0.32)' }}/>
        <div className="tape tape-top-right" style={{ width: '60px', height: '18px', background: 'rgba(63,162,143,0.28)' }}/>

        <div className="bg-paper border border-ink/[0.07] rounded-[28px] shadow-paper-lg flex flex-col min-h-0">
          <div className="px-6 pt-7 pb-4 flex items-start justify-between shrink-0">
            <div>
              <h2 className="font-display text-ink text-[24px] leading-none">支线手账</h2>
              <p className="font-hand text-fog text-[14px] mt-2">
                {empty
                  ? '还空着——去插第一面旗吧'
                  : `已盖 ${view.stats.total} 枚戳记 · 本周出发 ${view.stats.weekCount} 次`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-card border border-fog-light/70 text-fog hover:text-ink flex items-center justify-center transition-colors shrink-0"
              aria-label="关闭"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="px-6 pb-6 overflow-y-auto min-h-0">
            {empty ? (
              <div className="py-12 text-center">
                <div className="mx-auto w-20 h-20 rounded-full border-2 border-dashed border-fog-light flex items-center justify-center mb-4 text-fog-light">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M12 21C12 21 5 15.5 5 10C5 6.5 7.5 4 12 4C16.5 4 19 6.5 19 10C19 15.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                    <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                </div>
                <p className="font-hand text-fog text-[15px] leading-relaxed">
                  每完成一条支线，<br/>这里就多一枚戳记、多一张票根。
                </p>
              </div>
            ) : (
              <>
                <CategoryStamps view={view} />
                <BadgeWall badges={view.badges} />
                <h3 className="font-hand text-fog text-[14px] mb-3">票根</h3>
                <div className="space-y-2.5">
                  {view.quests.map((q) => (
                    <TicketStub
                      key={q.id}
                      cat={q.category}
                      title={q.title}
                      date={formatDate(q.date)}
                      evidence={q.evidence}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
