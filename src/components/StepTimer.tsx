import type { StepTimerApi } from '../hooks/useStepTimer';
import { formatClock } from '../hooks/useStepTimer';

// ── 步骤软节奏圆环 ──────────────────────────────────────────────────────────
// 建议时间内：teal 圆环随剩余时间消减，最后 20% 转暖色轻脉动；
// 超时：不红不响，圆环变橙、时钟转成正计时，旁边一句"不急，做完再交"；
// 玩家可暂停 / +2 分钟 / 收起（收起后留一枚"节奏"小钮随时叫回）。
// 纯展示组件：状态全部来自 App 层唯一的 useStepTimer 实例。

interface Props {
  timer: StepTimerApi;
  compact?: boolean;
}

export function StepTimer({ timer, compact }: Props) {
  if (!timer.active) return null;

  // 收起态：只剩一枚安静的小钮（计时仍在后台走）
  if (timer.dismissed) {
    return (
      <button
        type="button"
        onClick={timer.restore}
        className={`inline-flex items-center gap-1.5 text-fog hover:text-moss font-hand border border-dashed border-fog-light rounded-full transition-colors ${
          compact ? 'text-[11px] px-2.5 py-1' : 'text-[12px] px-3 py-1.5'
        }`}
        title="把节奏计时器叫回来"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 5V8L10 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        节奏
      </button>
    );
  }

  const size = compact ? 42 : 52;
  const stroke = compact ? 3.2 : 4;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const total = timer.suggestedSeconds + timer.extraSeconds;
  const frac = timer.overtime ? 0 : Math.max(0, Math.min(1, timer.remaining / total));
  const urgent = !timer.overtime && !timer.paused && frac <= 0.2;
  const tone = timer.overtime ? 'text-orange' : timer.paused ? 'text-fog' : urgent ? 'text-orange' : 'text-teal';
  const offset = c * (1 - frac);
  const shown = timer.overtime ? timer.elapsed : timer.remaining;

  const ctrlBtn = `flex items-center justify-center rounded-full border border-fog-light bg-paper text-fog hover:text-moss hover:border-moss/50 transition-colors disabled:opacity-40 ${
    compact ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-[12px]'
  }`;

  return (
    <div
      className={`step-timer max-w-full flex items-center rounded-2xl border bg-paper/70 ${
        compact ? 'gap-2 px-2.5 py-1.5 border-fog-light/70' : 'gap-3 px-3 py-2 border-fog-light'
      }`}
    >
      <div className={`relative shrink-0 ${urgent ? 'animate-pulse' : ''}`} style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--paper-3)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={`${tone} transition-[stroke-dashoffset] duration-1000 ease-linear`}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-display tabular-nums leading-none ${tone} ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {formatClock(shown)}
        </span>
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <span className={`font-hand leading-snug ${tone} ${compact ? 'text-[11.5px]' : 'text-[13px]'}`}>
          {timer.overtime
            ? '不急，做完再交'
            : timer.paused
              ? '歇一下，计时停了'
              : urgent
                ? '快到建议节奏啦'
                : '建议节奏'}
        </span>
        {!compact && !timer.overtime && (
          <span className="text-[11px] text-fog/70 leading-none">
            {timer.extraSeconds > 0 ? `含加时 ${timer.extraSeconds / 60} 分钟` : '超时也没关系，照常交'}
          </span>
        )}
        <div className="flex items-center gap-1">
          {timer.paused ? (
            <button type="button" onClick={timer.resume} className={ctrlBtn} title="继续计时" aria-label="继续计时">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button type="button" onClick={timer.pause} className={ctrlBtn} title="暂停计时" aria-label="暂停计时">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <rect x="2.2" y="1.5" width="2.4" height="9" rx="1" fill="currentColor" />
                <rect x="7.4" y="1.5" width="2.4" height="9" rx="1" fill="currentColor" />
              </svg>
            </button>
          )}
          <button type="button" onClick={timer.addTime} className={`${ctrlBtn} font-hand px-1 w-auto`} title="再给两分钟" aria-label="再加两分钟">
            +2分
          </button>
          <button type="button" onClick={timer.dismiss} className={ctrlBtn} title="收起计时器" aria-label="收起计时器">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** 已完成步骤的"踩点"小章：建议节奏内交的，抽屉时间轴上留个仪式感记号 */
export function OnTimeStamp({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-teal bg-teal/10 border border-teal/30 rounded-full font-hand ${
        compact ? 'text-[10.5px] px-2 py-0.5' : 'text-[11px] px-2.5 py-1'
      }`}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M6 3.2V6L7.8 7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      踩点完成
    </span>
  );
}
