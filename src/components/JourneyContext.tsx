import { useEffect, useState } from 'react';
import type { Goal, Journey } from '../../server/goals-types';
import { getGoal } from '../goals-api';
import { appUrl } from '../paths';
import './journey-context.css';

/** 聊天卡、任务抽屉和通话共用。展开时读取原文，避免把长篇证物复制进每条事件。 */
export function JourneyContext({ journey }: { journey?: Journey }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const goalId = journey?.goalId;
  useEffect(() => {
    if (!open || !goalId) return;
    let cancelled = false;
    setGoal(null); setError('');
    getGoal(goalId).then(data => { if (!cancelled) setGoal(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : '暂时没能翻开记录'); });
    return () => { cancelled = true; };
  }, [goalId, open, attempt]);
  if (!journey) return null;
  return <aside className="journey-context" aria-label="心愿计划与前序成果">
    <p className="journey-heading">✳ {journey.title} · 第 {journey.ordinal}/{journey.total} 章</p>
    <p>{journey.purpose}</p>
    {journey.ordinal > 1 ? <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>翻看前面留下的成果</summary>
      {open && !goal && !error && <p role="status">正在翻开原来的记录…</p>}
      {error && <p role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>再试一次</button></p>}
      {open && goal && goal.records.filter(record =>
        goal.plan.chapters.findIndex(c => c.id === record.chapterId) < journey.ordinal - 1
      ).map(record => <section className="journey-record" key={record.chapterId}>
        <h4>{goal.plan.chapters.find(c => c.id === record.chapterId)?.title}</h4>
        <time>{new Date(record.at).toLocaleDateString()}</time>
        {record.steps.map((step, i) => <div key={i}>
          <p>{step.instruction}</p>
          {step.submittedEvidence && <blockquote>{step.submittedEvidence.text}
            {step.submittedEvidence.photoUrl && <a href={appUrl(step.submittedEvidence.photoUrl)} target="_blank" rel="noreferrer">
              <img src={appUrl(step.submittedEvidence.photoUrl)} alt={`第${i + 1}步留下的原始照片`} loading="lazy" />
              <span>查看原图 ↗</span>
            </a>}
          </blockquote>}
        </div>)}
      </section>)}
    </details> : <p className="journey-first">这是第一章，从此刻开始留下自己的发现。</p>}
  </aside>;
}
