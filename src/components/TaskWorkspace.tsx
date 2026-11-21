import { useEffect, useRef, useState } from 'react';
import type { ActivityPlan, FSMState, QuestProgress, StepReview, TimelineItem } from '../types';
import type { QuestReward, GoalNotice } from '../hooks/useAgentSession';
import type { StepTimerApi } from '../hooks/useStepTimer';
import { StepSubmitArea } from './TaskStep';
import { StepTimer } from './StepTimer';
import { JourneyContext } from './JourneyContext';
import { appUrl } from '../paths';

interface Props {
  state: FSMState;
  quest: QuestProgress | null;
  selection: ActivityPlan | null;
  timeline: TimelineItem[];
  busy: boolean;
  restoring: boolean;
  lastAction: string;
  review: StepReview | null;
  error: string | null;
  timer: StepTimerApi;
  reward: QuestReward | null;
  goalNotice: GoalNotice | null;
  draftPrefix: string;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
  onAsk: () => void;
  onHome: () => void;
  onLibrary: () => void;
  onGoals: () => void;
  onNext: () => void;
  onAbandon: () => void;
  onRetry: () => void;
}

export function TaskWorkspace(props: Props) {
  const { state, quest, selection, busy, restoring, lastAction, review, error, timer } = props;
  const finished = state === 'S3';
  const step = !finished ? quest?.steps[quest.steps.length - 1] : undefined;
  const total = quest?.total || 0;
  const done = finished ? total : step?.index || 0;
  const title = quest?.title || selection?.title || '支线已选好';
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const root = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const stepKey = `${props.draftPrefix}:${step?.index ?? 'preparing'}`;
  useEffect(() => {
    body.current?.scrollTo({ top: 0, behavior: 'auto' });
    root.current?.querySelector<HTMLElement>('[data-task-heading]')?.focus({ preventScroll: true });
    setConfirmAbandon(false);
  }, [stepKey, finished]);
  useEffect(() => {
    if (review?.verdict !== 'pass') return;
    try { sessionStorage.removeItem(`${props.draftPrefix}:${review.stepIndex}`); } catch { /* optional local draft */ }
  }, [review, props.draftPrefix]);
  let reply = '';
  for (let i = props.timeline.length - 1; i >= 0; i--) {
    const item = props.timeline[i];
    if (item.kind === 'user') break;
    if (item.kind === 'npc' && item.content.trim()) { reply = item.content; break; }
  }
  const submitting = lastAction === 'submit_text' || lastAction === 'submit_photo';
  const rejected = review?.verdict === 'reject' && review.stepIndex === step?.index;
  const busyText = restoring ? '正在同步已保存的进度…' : !step && !finished ? '正在为这条支线安排步骤…' : submitting ? '吱呀正在看看你留下的作品…' : lastAction === 'abandon' ? '正在收好这次进度…' : '吱呀正在回复，你可以留在任务页等一会儿。';
  return <main className="task-workspace" ref={root} aria-label="当前支线">
    <header className="task-workspace-header"><button className="session-icon" onClick={props.onHome} aria-label="返回首页"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m3 11 9-8 9 8v10H4V11m5 10v-7h6v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></button><div><p className="session-eyebrow">{finished ? '这次的小小收获' : '把注意力，留给眼前这件事'}</p><span className="task-workspace-brand">支线任务</span></div><button className="session-secondary" onClick={props.onLibrary} aria-label="我的手册">我的手册</button></header>
    <div className="task-workspace-scroll" ref={body}>
      <div className="task-workspace-content">
        <div className="task-title"><p className="session-eyebrow">{finished ? '已完成' : step ? `正在进行 · 第 ${step.index + 1} 步` : '准备出发'}</p><h1 tabIndex={-1} data-task-heading>{title}</h1>{selection?.hook && !quest && <p>{selection.hook}</p>}</div>
        {total > 0 && <div className="task-overall-progress"><progress value={done} max={total} aria-label="支线完成进度" /><span>{done}/{total} 步完成</span></div>}
        <JourneyContext journey={step?.journey || quest?.steps[0]?.journey || selection?.journey} />
        {error && <div className="session-error" role="alert"><strong>暂时没能完成这次操作</strong><p>{error}</p><p>你的输入还在，可以重试提交，或重新连接同步进度。</p><button onClick={props.onRetry} disabled={busy}>重新连接</button></div>}
        {finished ? <section className="task-finished" aria-label="支线完成"><div className="task-completion-mark" aria-hidden><svg width="34" height="34" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5" /><path d="m9 16 5 5 10-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div><h2>这件小事，已经留下了自己的痕迹。</h2><p>这条支线已完成，作品和过程可以在日常记录里回看。</p>{props.reward?.newBadges.map(badge => <p className="task-earned" key={badge.id}>解锁成就 · {badge.name}</p>)}{props.goalNotice && <div className="task-goal-notice"><p>「{props.goalNotice.title}」· {props.goalNotice.completed}/{props.goalNotice.total} 章</p>{props.goalNotice.rewards.map(name => <p key={name}>{name}</p>)}<button className="session-secondary" onClick={props.onGoals}>查看心愿成果 →</button></div>}<div className="task-finished-actions"><button className="session-primary" onClick={props.onLibrary}>查看日常记录</button><button className="session-secondary" disabled={busy || restoring} onClick={props.onNext}>再找一条支线 →</button></div></section> : step ? <section className="task-current-step" aria-label={`当前第${step.index + 1}步`}>
          <div className="task-step-label"><span>现在，只做这一步</span><span>{step.index + 1} / {total}</span></div>
          <h2>{step.instruction}</h2>
          {step.hint && <p className="task-step-hint">{step.hint}</p>}
          {timer.active && <div className="task-timer"><StepTimer timer={timer} /></div>}
          <div className="task-evidence-prompt"><h3>{step.submissionType === 'photo' ? '留下一张照片和说明' : '留下这一步的发现'}</h3><p>{step.proofPrompt || step.submissionPrompt || '记录你实际做了什么、发现了什么。'}</p></div>
          {rejected && <div className="task-review-feedback" role="alert"><strong>再补充一点，就能继续</strong><p>{review.whatNeeded || review.reason}</p><small>原来的输入已保留，直接修改后再提交。</small></div>}
          <StepSubmitArea key={stepKey} step={step} disabled={busy || restoring} onSubmitText={props.onSubmitText} onSubmitPhoto={props.onSubmitPhoto} draftKey={stepKey} />
        </section> : <div className="task-preparing" role="status"><span className="task-loading-dot" /><h2>支线选好了，准备开始</h2><p>{error ? '可以重新连接，或问问吱呀下一步怎么做。' : busyText}</p></div>}
        {(busy || restoring) && (step || finished) && <p className="task-busy-status" role="status"><span className="task-loading-dot" />{busyText}</p>}
        {!busy && reply && !rejected && (lastAction === 'text' || submitting || finished) && <details className="task-agent-reply" open={reply.length < 180}><summary>吱呀的回应</summary><p>{reply}</p></details>}
        {quest && quest.steps.length > (finished ? 0 : 1) && <details className="task-step-history"><summary>{finished ? '回看这次走过的步骤' : `已走过的步骤 · ${done}步`}</summary><ol>{quest.steps.filter(s => finished || s.index < (step?.index || 0)).map(s => <li key={s.index}><span>第 {s.index + 1} 步 · 已完成</span><p>{s.instruction}</p></li>)}</ol></details>}
        {!finished && <div className="task-abandon">{confirmAbandon ? <><p>要先放下这条支线吗？已完成的日常记录会保留。</p><div><button className="session-secondary" disabled={busy || restoring} onClick={() => setConfirmAbandon(false)}>继续做这条</button><button className="session-secondary" disabled={busy || restoring} onClick={props.onAbandon}>确认放下</button></div></> : <button disabled={busy || restoring} onClick={() => setConfirmAbandon(true)}>暂时不想做了</button>}</div>}
      </div>
    </div>
    <footer className="task-companion"><button className="task-ask" onClick={props.onAsk} aria-label="问问吱呀" aria-haspopup="dialog"><img src={appUrl('agent_avatar.png')} alt="" width={38} height={38} /><span><strong>问问吱呀</strong><small>{busy ? '回复准备中，也可以打开看看' : '卡住了、想调整，随时说一句'}</small></span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 3-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></button></footer>
  </main>;
}
