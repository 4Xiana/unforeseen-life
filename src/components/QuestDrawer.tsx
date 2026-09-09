import type { ReactNode } from 'react';
import type { FSMState, QuestProgress, PublishedStep, ActivityPlan, ArchivedQuest } from '../types';
import { submissionTypeShort, StepSubmitArea } from './TaskStep';
import { ActivityCards } from './ActivityCards';

interface Props {
  fsmState: FSMState;
  // S1 选支线阶段：最新一批待选支线
  activities: ActivityPlan[];
  // S2/S3 执行阶段：当前支线步骤进度
  quest: QuestProgress | null;
  // 已结束的支线（走完/放弃）：时间轴里逐条累积
  history: ArchivedQuest[];
  isStreaming: boolean;
  onSelectActivity: (id: string) => void;
  onRefreshActivities: () => void;
  // 当前步骤就地提交（抽屉内直接交证物，不必回聊天任务卡）
  onCheck: () => void;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
  // 放弃当前支线/不选了：按钮收进抽屉底部，贴着任务进度
  onAbandon: () => void;
  onClose: () => void;
}

// ── 时间轴左轨：圆点 + 竖向连接线，所有阶段节点共用一套结构，保证衔接无缝 ──

type LineTone = 'done' | 'active' | 'pending';

function Rail({ dot, isLast, lineTone, children }: {
  dot: ReactNode;
  isLast: boolean;
  lineTone: LineTone;
  children: ReactNode;
}) {
  const lineColor =
    lineTone === 'done' ? 'bg-teal/40'
    : lineTone === 'active' ? 'bg-moss/40'
    : 'bg-fog-light/60';
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        {dot}
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-[18px] my-1 rounded-full ${lineColor}`}/>
        )}
      </div>
      <div className="flex-1 min-w-0 pb-5">{children}</div>
    </div>
  );
}

function CheckDot({ tone }: { tone: 'teal' | 'moss' }) {
  const bg = tone === 'teal' ? 'bg-teal' : 'bg-moss';
  return (
    <div className={`w-7 h-7 rounded-full ${bg} text-card flex items-center justify-center shrink-0 shadow-paper-sm`}>
      <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
        <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function CurrentDot({ color }: { color: 'moss' | 'orange' }) {
  return (
    <div className={`w-7 h-7 rounded-full ${color === 'orange' ? 'bg-orange' : 'bg-moss'} text-card flex items-center justify-center shrink-0 ring-4 ${color === 'orange' ? 'ring-orange/20' : 'ring-moss/20'}`}>
      <span className="w-2 h-2 rounded-full bg-card animate-pulse"/>
    </div>
  );
}

function PendingDot() {
  return (
    <div className="w-7 h-7 rounded-full bg-paper-2 border border-dashed border-fog-light text-fog flex items-center justify-center shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-fog-light"/>
    </div>
  );
}

function AbandonedDot() {
  return (
    <div className="w-7 h-7 rounded-full bg-paper-2 border border-dashed border-fog-light text-fog flex items-center justify-center shrink-0">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2.5 5H7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// 阶段小标题（圆点右侧第一行）
function StageLabel({ children, tone }: { children: ReactNode; tone: 'teal' | 'moss' | 'orange' | 'fog' }) {
  const color =
    tone === 'teal' ? 'text-teal'
    : tone === 'moss' ? 'text-moss-deep'
    : tone === 'orange' ? 'text-orange'
    : 'text-fog';
  return <span className={`font-hand text-[12px] leading-none ${color}`}>{children}</span>;
}

// ── 步骤行（当前支线的每一步） ──

function StepRow({
  index,
  step,
  status,
  isLast,
  disabled,
  onCheck,
  onSubmitText,
  onSubmitPhoto,
}: {
  index: number;
  step?: PublishedStep;
  status: 'done' | 'current' | 'pending';
  isLast: boolean;
  disabled: boolean;
  onCheck: () => void;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
}) {
  const dot =
    status === 'done' ? <CheckDot tone="teal"/>
    : status === 'current' ? <CurrentDot color="moss"/>
    : <PendingDot/>;
  const lineTone: LineTone = status === 'done' ? 'done' : 'pending';

  return (
    <Rail dot={dot} isLast={isLast} lineTone={lineTone}>
      {status === 'current' && step ? (
        <div className="bg-card border-2 border-moss/50 rounded-2xl p-3.5 shadow-paper-sm relative">
          <div className="tape tape-top-left" style={{ width: '44px', height: '14px' }}/>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-hand text-[13px] text-moss-deep leading-none">正在进行 · 第 {index + 1} 步</span>
            <span className="shrink-0 font-hand text-[11px] text-teal bg-teal/10 border border-teal/30 px-2 py-0.5 rounded-full">
              {submissionTypeShort(step.submissionType)}
            </span>
          </div>
          <p className="text-ink font-semibold text-[14px] leading-[1.7]">{step.instruction}</p>
          {step.proofPrompt && (
            <div className="mt-2.5 flex items-start gap-1.5 bg-teal/[8%] border border-teal/25 rounded-xl px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-teal shrink-0 mt-0.5">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.6"/>
                <path d="M5 8.2L7.2 10.2L11.2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-[12.5px] text-ink-2 leading-relaxed">
                <span className="font-hand text-teal mr-1">交证物</span>
                {step.proofPrompt}
              </p>
            </div>
          )}
          <div className="mt-3">
            <StepSubmitArea
              step={step}
              compact
              disabled={disabled}
              onCheck={onCheck}
              onSubmitText={onSubmitText}
              onSubmitPhoto={onSubmitPhoto}
            />
          </div>
        </div>
      ) : status === 'done' && step ? (
        <div className="pt-0.5">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-hand text-[12px] text-teal leading-none">第 {index + 1} 步 · 已完成</span>
            <span className="font-hand text-[11px] text-fog bg-paper-2 border border-fog-light/70 px-1.5 py-0.5 rounded-full">
              {submissionTypeShort(step.submissionType)}
            </span>
          </div>
          <p className="text-ink-2/70 text-[13px] leading-relaxed line-clamp-2">{step.instruction}</p>
        </div>
      ) : (
        <div className="pt-1">
          <p className="font-hand text-fog/70 text-[13px] leading-none">第 {index + 1} 步 · 待解锁</p>
        </div>
      )}
    </Rail>
  );
}

// 等待中的占位提示（活动/步骤生成间隙，保证抽屉无空白、时间轴不断档）
function LoadingHint({ text }: { text: string }) {
  return (
    <div className="bg-paper-2/60 border border-dashed border-fog-light rounded-2xl px-4 py-3.5 flex items-center gap-2.5">
      <div className="flex items-center gap-1 shrink-0">
        <span className="typing-dot" style={{ width: '5px', height: '5px' }}/>
        <span className="typing-dot" style={{ animationDelay: '0.15s', width: '5px', height: '5px' }}/>
        <span className="typing-dot" style={{ animationDelay: '0.3s', width: '5px', height: '5px' }}/>
      </div>
      <p className="font-hand text-fog text-[13px] leading-snug">{text}</p>
    </div>
  );
}

export function QuestDrawer({
  fsmState,
  activities,
  quest,
  history,
  isStreaming,
  onSelectActivity,
  onRefreshActivities,
  onCheck,
  onSubmitText,
  onSubmitPhoto,
  onAbandon,
  onClose,
}: Props) {
  const finished = fsmState === 'S3';
  const picking = fsmState === 'S1';
  // 当前支线已归档（S3 走完）时它在历史里，编号 = 历史总数；否则编号 = 历史 + 1
  const currentArchived = !!(quest?.id && history.some(h => h.id === quest.id));
  const journeyNo = currentArchived ? history.length : history.length + 1;

  const handleSelect = (id: string) => {
    if (isStreaming) return;
    onSelectActivity(id);
    onClose();
  };

  // 当前支线进度条数据
  const published = quest?.steps ?? [];
  const currentIndex = published.length ? published[published.length - 1].index : -1;
  const total = quest?.total ?? published.length;
  const doneCount = !quest ? 0 : finished ? total : Math.max(0, currentIndex);

  const subtitle =
    picking ? '挑一条，这就出发'
    : quest ? `「${quest.title}」`
    : history.length > 0 ? '从挑选到完成，都记在这里'
    : '任务进度';

  // 放弃入口贴着任务进度放在抽屉底部：挑选中有卡可"不选了"，执行中可"放弃这条支线"，走完则不出现
  const canAbandon = (picking && activities.length > 0) || (fsmState === 'S2' && !!quest);
  const abandonText = picking ? '不选了' : '放弃这条支线';

  // ── 组装时间轴节点（按时间顺序：已结束的历史支线 → 当前旅程） ──
  const nodes: ReactNode[] = [];

  history.forEach((h, hi) => {
    // 当前支线在 S2/S3 有完整时间轴展开时，跳过它自己的历史归档卡，避免同一条渲染两遍
    if (!picking && quest?.id && h.id === quest.id) return;
    const isDone = h.status === 'done';
    const reached = h.steps.length;
    nodes.push(
      <Rail
        key={`h${hi}`}
        dot={isDone ? <CheckDot tone="teal"/> : <AbandonedDot/>}
        isLast={false}
        lineTone="done"
      >
        <div className="bg-paper-2/60 border border-fog-light/50 rounded-2xl px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <StageLabel tone={isDone ? 'teal' : 'fog'}>
              {isDone ? `第 ${hi + 1} 条支线 · 走完了` : `第 ${hi + 1} 条支线 · 放下了`}
            </StageLabel>
            <span className="shrink-0 font-hand text-[11px] text-fog">
              {isDone ? `${h.total}/${h.total} 步` : `走到第 ${Math.max(1, reached)} 步`}
            </span>
          </div>
          <p className="text-ink-2/80 text-[13.5px] font-semibold mt-1 leading-snug">「{h.title}」</p>
        </div>
      </Rail>,
    );
  });

  if (picking) {
    // 阶段：挑选支线（当前节点）
    nodes.push(
      <Rail key="pick" dot={<CurrentDot color="orange"/>} isLast lineTone="pending">
        <div className="flex items-center gap-2 mb-2">
          <StageLabel tone="orange">第 {history.length + 1} 条支线 · 挑选中</StageLabel>
        </div>
        {activities.length > 0 ? (
          <>
            <ActivityCards activities={activities} onSelect={handleSelect} disabled={isStreaming}/>
            <div className="flex justify-center pt-2">
              <button
                onClick={onRefreshActivities}
                disabled={isStreaming}
                className="flex items-center gap-1.5 text-[12px] font-medium text-fog hover:text-ink bg-card border border-fog-light/70 hover:border-fog px-4 py-2 rounded-full transition-colors disabled:opacity-40"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M1.5 2.5V5.5H4.5M11.5 10.5V7.5H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2.25 5.5C2.75 3.75 4.5 2.25 6.5 2.25C8.75 2.25 10.5 3.75 11.25 5.5M10.75 7.5C10.25 9.25 8.5 10.75 6.5 10.75C4.25 10.75 2.5 9.25 1.75 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                换一批
              </button>
            </div>
          </>
        ) : (
          <LoadingHint text="小闲正在构思几条支线…"/>
        )}
      </Rail>,
    );
  } else if (quest) {
    // 阶段 1：已选定
    nodes.push(
      <Rail key="picked" dot={<CheckDot tone={finished ? 'teal' : 'moss'}/>} isLast={false} lineTone="active">
        <div className="bg-card border border-fog-light/70 rounded-2xl px-3.5 py-3 shadow-paper-sm">
          <StageLabel tone={finished ? 'teal' : 'moss'}>第 {journeyNo} 条支线 · 已选定</StageLabel>
          <p className="text-ink font-semibold text-[14px] mt-1 leading-snug">「{quest.title}」</p>
        </div>
      </Rail>,
    );

    // 阶段 2：一步步走
    const stepCount = total;
    for (let i = 0; i < stepCount; i++) {
      const step = published.find(s => s.index === i);
      const status: 'done' | 'current' | 'pending' =
        finished || i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending';
      const isLastStep = finished ? false : i === stepCount - 1;
      nodes.push(
        <StepRow
          key={`step${i}`}
          index={i}
          step={step}
          status={status}
          isLast={isLastStep}
          disabled={isStreaming}
          onCheck={onCheck}
          onSubmitText={onSubmitText}
          onSubmitPhoto={onSubmitPhoto}
        />,
      );
    }

    // 阶段 3：走完盖戳
    if (finished) {
      nodes.push(
        <Rail key="done" dot={<CheckDot tone="teal"/>} isLast lineTone="done">
          <div className="bg-teal/10 border border-teal/30 rounded-2xl px-4 py-3.5 flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-teal shrink-0">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="font-hand text-[14px] text-teal leading-snug">这条支线走完了，戳记已经盖进手账。</p>
          </div>
        </Rail>,
      );
    }
  } else if (fsmState === 'S2') {
    // 刚选定、步骤还在生成的间隙：时间轴不断档
    nodes.push(
      <Rail key="prep" dot={<CurrentDot color="moss"/>} isLast lineTone="pending">
        <div className="mb-2">
          <StageLabel tone="moss">第 {journeyNo} 条支线 · 准备出发</StageLabel>
        </div>
        <LoadingHint text="小闲正在安排这条支线的步骤…"/>
      </Rail>,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in"
      style={{ background: 'rgba(45,42,38,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-sm bg-paper shadow-paper-lg flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-7 pb-4 shrink-0 border-b border-fog-light/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-ink text-[22px] leading-none">任务进度</h2>
              <p className="font-hand text-fog text-[14px] mt-2 truncate">{subtitle}</p>
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
        </div>

        <div className="px-6 py-5 overflow-y-auto min-h-0">
          {quest && !picking && (
            <div className="flex items-center gap-3 mb-5">
              <span
                className="shrink-0 font-hand text-[12px] px-2.5 py-1 rounded-full"
                style={{
                  color: finished ? 'var(--teal)' : 'var(--moss-deep)',
                  background: finished ? 'rgba(63,162,143,0.12)' : 'rgba(96,139,97,0.12)',
                }}
              >
                {finished ? '已完成' : '进行中'}
              </span>
              <div className="flex-1 h-2 rounded-full bg-paper-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${total ? (doneCount / total) * 100 : 0}%`,
                    background: finished ? 'var(--teal)' : 'var(--moss)',
                  }}
                />
              </div>
              <span className="shrink-0 font-display text-[13px] text-fog tabular-nums">{doneCount}/{total}</span>
            </div>
          )}

          {nodes.length > 0 ? nodes : (
            <div className="pt-10 text-center">
              <p className="font-hand text-fog text-[14px] leading-relaxed">
                还没有任务在进行。<br/>回聊天里让小闲给你挑条支线吧。
              </p>
            </div>
          )}

          {!picking && (
            <div className="font-hand text-fog/50 text-[12px] text-center pt-2">
              证物直接在这儿交就行，步骤卡被刷上去也不怕
            </div>
          )}
        </div>

        {canAbandon && (
          <div className="shrink-0 px-6 pt-3 pb-6 border-t border-fog-light/40">
            <button
              onClick={onAbandon}
              disabled={isStreaming}
              className="mx-auto flex items-center gap-1.5 text-[12.5px] font-medium text-fog hover:text-coral bg-card border border-fog-light/70 hover:border-coral/40 px-4 py-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {abandonText}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
