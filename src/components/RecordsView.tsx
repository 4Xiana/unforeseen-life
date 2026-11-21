import { useState } from 'react';
import type { HandbookView, QuestRecord, StepDetail } from '../types';
import { CATEGORY_META, formatDate } from '../handbook';
import { appUrl } from '../paths';

interface Props {
  view: HandbookView;
  onClose: () => void;
}

function EvidenceBlock({ step }: { step: StepDetail }) {
  const ev = step.evidence;
  if (!ev) {
    return (
      <p className="font-hand text-[12px] text-fog/70 italic">这一步没有留下证物</p>
    );
  }
  if (ev.type === 'photo') {
    return (
      <div className="space-y-1.5">
        {ev.photoUrl && (
          <img
            src={appUrl(ev.photoUrl)}
            alt="现场证物"
            className="w-full rounded-xl border border-fog-light/60 object-cover max-h-56"
            loading="lazy"
          />
        )}
        {ev.text && (
          <p className="text-[13px] text-ink-2 leading-relaxed bg-teal/[6%] border border-teal/20 rounded-lg px-2.5 py-1.5">
            <span className="font-hand text-teal mr-1">图说</span>
            {ev.text}
          </p>
        )}
      </div>
    );
  }
  return (
    <p className="text-[13px] text-ink-2 leading-relaxed bg-teal/[6%] border border-teal/20 rounded-lg px-2.5 py-1.5">
      <span className="font-hand text-teal mr-1">记录</span>
      {ev.text}
    </p>
  );
}

export function QuestRecordCard({ record }: { record: QuestRecord }) {
  const [open, setOpen] = useState(false);
  const meta = CATEGORY_META[record.category];
  const hasDetails = !!record.stepDetails?.length;

  return (
    <div
      className="bg-card border border-ink/[0.07] rounded-2xl shadow-paper-sm overflow-hidden"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left px-3 sm:px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-paper-2/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-display text-[15px] text-ink leading-snug">「{record.title}」</span>
            <span
              className="shrink-0 font-hand text-[11px] px-1.5 py-0.5 rounded-full"
              style={{ color: meta.color, background: `${meta.color}14` }}
            >
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-fog">
            <span>{formatDate(record.date)}</span>
            <span>·</span>
            <span>{record.steps} 步</span>
            {hasDetails && <span className="text-moss">· 含证物</span>}
          </div>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`shrink-0 text-fog transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && hasDetails && (
        <div className="px-3 sm:px-4 pb-4 space-y-3 border-t border-fog-light/40 pt-3">
          {record.stepDetails!.map((step, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-moss/15 text-moss-deep text-[11px] font-display flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-[13.5px] text-ink font-semibold leading-relaxed">{step.instruction}</p>
              </div>
              {step.proofPrompt && (
                <p className="text-[12px] text-fog pl-7 leading-relaxed">交证物：{step.proofPrompt}</p>
              )}
              <div className="pl-7">
                <EvidenceBlock step={step} />
              </div>
            </div>
          ))}
        </div>
      )}
      {open && !hasDetails && record.evidence && <p className="px-4 pb-4 text-[13px] text-ink-2 whitespace-pre-wrap break-words">{record.evidence}</p>}
    </div>
  );
}

export function RecordsView({ view, onClose }: Props) {
  const empty = view.quests.length === 0;
  return (
    <div
      className="viewport-overlay journal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(45,42,38,0.35)', backdropFilter: 'blur(4px)' }}
    >
      <div role="dialog" aria-modal="true" aria-label="支线记录" className="journal-shell relative w-full max-w-md max-h-[86dvh] flex flex-col animate-slide-up">
        <div className="tape tape-top-left" style={{ width: '60px', height: '18px', background: 'rgba(114,148,81,0.32)' }} />
        <div className="tape tape-top-right" style={{ width: '60px', height: '18px', background: 'rgba(240,160,62,0.28)' }} />

        <div className="journal-panel bg-paper border border-ink/[0.07] rounded-[28px] shadow-paper-lg flex flex-col min-h-0">
          <div className="panel-header px-6 pt-7 pb-4 flex items-start justify-between gap-3 shrink-0">
            <div>
              <h2 className="font-display text-ink text-[24px] leading-none">支线记录</h2>
              <p className="font-hand text-fog text-[14px] mt-2">
                {empty
                  ? '还没有记录——完成一条支线后，这里会留下每一步的证物'
                  : `共 ${view.quests.length} 条支线 · 点击展开看证物`}
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

          <div className="panel-content px-6 pb-6 overflow-y-auto min-h-0">
            {empty ? (
              <div className="py-12 text-center">
                <div className="mx-auto w-20 h-20 rounded-full border-2 border-dashed border-fog-light flex items-center justify-center mb-4 text-fog-light">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M5 4H19V20H5V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M9 8H15M9 12H15M9 16H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="font-hand text-fog text-[15px] leading-relaxed">
                  每走完一条支线，<br/>这里会记下你每一步交的证物。
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {view.quests.map((q) => (
                  <QuestRecordCard key={q.id} record={q} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
