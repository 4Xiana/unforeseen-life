import type { ActivityPlan } from '../types';

interface Props {
  activities: ActivityPlan[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  // 历史卡（已翻过的一批）：永久不可点
  locked?: boolean;
}

const TAG_COLORS = ['tag-moss', 'tag-blue', 'tag-orange', 'tag-coral', 'tag-teal', 'tag-fog'];
const ROTATIONS = ['', 'rotate-neg-1', 'rotate-pos-1', 'rotate-neg-1', 'rotate-pos-1'];
const ACCENT_COLORS = ['moss', 'blue', 'orange', 'coral', 'teal'];

function tagColor(tag: string): string {
  const hash = tag.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

function ActivityCardVertical({ activity, i, onSelect, disabled, locked }: {
  activity: ActivityPlan;
  i: number;
  onSelect: (id: string) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const accentIdx = i % ACCENT_COLORS.length;
  const accent = ACCENT_COLORS[accentIdx];
  const rotation = ROTATIONS[i % ROTATIONS.length];
  const nonInteractive = disabled || locked;

  return (
    <button
      onClick={() => !nonInteractive && onSelect(activity.id)}
      disabled={nonInteractive}
      className={`ticket-card w-full text-left ${rotation} disabled:opacity-45 ${locked ? 'disabled:cursor-not-allowed' : 'disabled:cursor-wait'} group shrink-0`}
      style={{
        borderLeftColor: `var(--${accent})`,
        animationDelay: `${i * 80}ms`,
      }}
    >
      <div className="flex items-start gap-3 pr-7">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-display hollow-num"
          style={{
            background: `var(--card)`,
            border: `2px solid var(--${accent})`,
            color: `var(--${accent})`,
            fontSize: '15px',
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[16px] text-ink mb-1 leading-snug">
            {activity.title}
          </h3>
          <p className="text-[13px] text-ink-2 leading-relaxed line-clamp-2 mb-2">
            {activity.hook}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activity.tags.map((tag) => (
              <span key={tag} className={`tag ${tagColor(tag)}`}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border transition-all duration-200 flex items-center justify-center"
        style={{ borderColor: `var(--fog-light)`, background: `var(--paper)` }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: `var(--${accent})` }}>
          <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </button>
  );
}

export function ActivityCards({ activities, onSelect, disabled, locked }: Props) {
  if (activities.length === 0) return null;

  return (
    <div className="my-5 animate-fade-in">
      <div className="section-label mb-3 px-1">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-fog">
          <path d="M6 1L7.5 4.5L11 5L8.5 7.5L9 11L6 9.5L3 11L3.5 7.5L1 5L4.5 4.5L6 1Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
        </svg>
        <span className="text-fog">{locked ? '上一批支线' : '可接取的支线'}</span>
      </div>

      <div className="space-y-3">
        {activities.map((activity, i) => (
          <ActivityCardVertical
            key={activity.id}
            activity={activity}
            i={i}
            onSelect={onSelect}
            disabled={disabled}
            locked={locked}
          />
        ))}
      </div>
    </div>
  );
}
