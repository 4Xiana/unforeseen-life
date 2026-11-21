import type { HandbookView, BadgeState } from '../types';
import { CATEGORY_META, CATEGORY_ORDER } from '../handbook';
import { QuestRecordCard } from './RecordsView';

interface Props {
  view: HandbookView;
  onClose: () => void;
  embedded?: boolean;
  onStartQuest: () => void;
  busy?: boolean;
}

function CategoryStamps({ view }: { view: HandbookView }) {
  return (
    <div className="category-stamps grid grid-cols-5 gap-1 sm:gap-2 mb-5">
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

function BadgeWall({ badges, showConditions = false }: { badges: BadgeState[]; showConditions?: boolean }) {
  return (
    <div className="badge-wall mb-6">
      <h3 className="font-hand text-fog text-[14px] mb-3 px-0.5">成就墙</h3>
      <div className="grid grid-cols-3 gap-2.5">
        {badges.map((b) => (
          <div
            key={b.id}
            data-earned={b.earned}
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
            {showConditions && <small className="font-hand text-[12px] text-fog leading-relaxed">未解锁 · {b.desc}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HandbookView({ view, onClose, embedded = false, onStartQuest, busy = false }: Props) {
  const empty = view.stats.total === 0;
  return (
    <div className={embedded ? 'handbook-embedded' : 'viewport-overlay journal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in'}
      style={embedded ? undefined : { background: 'rgba(45,42,38,0.35)', backdropFilter: 'blur(4px)' }}>
      <div role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-label="日常记录" className="journal-shell relative w-full max-w-md max-h-[86dvh] flex flex-col animate-slide-up">
        <div className="tape tape-top-left" style={{ width: '60px', height: '18px', background: 'rgba(240,160,62,0.32)' }}/>
        <div className="tape tape-top-right" style={{ width: '60px', height: '18px', background: 'rgba(63,162,143,0.28)' }}/>

        <div className="journal-panel bg-paper border border-ink/[0.07] rounded-[28px] shadow-paper-lg flex flex-col min-h-0">
          <div className="panel-header px-6 pt-7 pb-4 flex items-start justify-between gap-3 shrink-0">
            <div>
              <h2 className="font-display text-ink text-[24px] leading-none">日常记录</h2>
              <p className="font-hand text-fog text-[14px] mt-2">
                {empty
                  ? '从一条小支线，点亮第一枚成就'
                  : `已盖 ${view.stats.total} 枚戳记 · 本周出发 ${view.stats.weekCount} 次`}
              </p>
            </div>
            {!embedded && <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-card border border-fog-light/70 text-fog hover:text-ink flex items-center justify-center transition-colors shrink-0"
              aria-label="关闭"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>}
          </div>

          <div className="panel-content px-6 pb-6 overflow-y-auto min-h-0">
            {empty ? (
              <div className="handbook-empty">
                <BadgeWall badges={view.badges.filter(b => !b.earned).slice(0, 6)} showConditions />
                <p className="font-hand text-fog text-[15px] leading-relaxed mb-4">完成支线后，成就和每一步的作品都会留在这里。</p>
                <button type="button" disabled={busy} onClick={onStartQuest} className="w-full min-h-[48px] rounded-full bg-moss-deep text-card font-hand text-[16px] px-5 py-3 disabled:opacity-40">去开启一条支线 →</button>
              </div>
            ) : (
              <>
                <CategoryStamps view={view} />
                <BadgeWall badges={view.badges} />
                <h3 className="font-hand text-fog text-[14px] mb-3">支线记录 · 点击展开看证物</h3>
                <div className="space-y-2.5">
                  {view.quests.map((q) => (
                    <QuestRecordCard key={q.id} record={q} />
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
