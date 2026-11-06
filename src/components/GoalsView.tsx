import { useEffect, useRef, useState } from 'react';
import type { Goal, GoalInput, GoalScene } from '../../server/goals-types';
import { exampleInput } from '../../server/goals-types';
import { changeGoalStatus, createGoalDraft, listGoals } from '../goals-api';
import { appUrl } from '../paths';
import './goals.css';

const scenes: Record<GoalScene, string> = { any: '场景不限', home: '在家', outdoors: '在户外', work: '在公司/学校' };
const statuses = { draft: '待你确认', active: '慢慢生长', paused: '暂时歇歇', completed: '已成册' };
const emptyInput: GoalInput = { wish: '', motivation: '', preferences: '', avoid: '', minutes: 15, scene: 'any' };
const formKey = 'xian-goal-draft-input';
function readDraft(): GoalInput {
  try { return { ...emptyInput, ...JSON.parse(sessionStorage.getItem(formKey) || '{}') }; }
  catch { return emptyInput; }
}

function exportGoal(goal: Goal) {
  const lines = [goal.plan.title, goal.plan.outcome, `愿望：${goal.input.wish}`, `缘由：${goal.input.motivation}`, ''];
  for (const record of goal.records) {
    const chapter = goal.plan.chapters.find(c => c.id === record.chapterId)!;
    lines.push(`## ${chapter.title} · ${new Date(record.at).toLocaleDateString()}`);
    for (const step of record.steps) {
      lines.push(step.instruction, step.submittedEvidence?.text || '');
      if (step.submittedEvidence?.photoUrl) lines.push(new URL(appUrl(step.submittedEvidence.photoUrl), location.origin).href);
    }
    lines.push('');
  }
  lines.push('纪念章', ...goal.rewards.map(r => `${r.name}：${r.description}`));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${goal.plan.title.replace(/[\\/:*?"<>|]/g, '')}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GoalsView({ onClose, onStart, busy, executing, currentSessionId, revision, embedded = false, guided = false, recordOnly = false, onGoalsLoaded, onConfirmed }: {
  onClose: () => void;
  onStart: (goal: Goal, minutes: number, scene: string) => void;
  busy: boolean;
  executing: boolean;
  currentSessionId: string | null;
  revision: number;
  embedded?: boolean;
  guided?: boolean;
  recordOnly?: boolean;
  onGoalsLoaded?: (hasGoals: boolean, hasConfirmed: boolean) => void;
  onConfirmed?: () => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [input, setInput] = useState<GoalInput>(readDraft);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [scene, setScene] = useState<GoalScene>('home');
  const root = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const guidedStarted = useRef(false);
  const loadedCallback = useRef(onGoalsLoaded);
  loadedCallback.current = onGoalsLoaded;
  const confirmedCallback = useRef(onConfirmed);
  confirmedCallback.current = onConfirmed;
  const goal = goals.find(g => g.id === selectedId);
  const next = goal?.plan.chapters[goal.records.length];
  const patch = (g: Goal) => setGoals(prev => [g, ...prev.filter(x => x.id !== g.id)]);
  async function load() {
    setLoading(true); setError('');
    try { const data = await listGoals(); if (alive.current) setGoals(data); }
    catch (e) { if (alive.current) setError(String(e instanceof Error ? e.message : e)); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { void load(); }, [revision]);
  useEffect(() => {
    if (!loading && !error) loadedCallback.current?.(goals.length > 0, goals.some(g => g.status !== 'draft'));
  }, [loading, error, goals]);
  useEffect(() => {
    if (!guided) { guidedStarted.current = false; return; }
    if (loading || error || guidedStarted.current) return;
    guidedStarted.current = true;
    if (!selectedId && !creating) {
      const draft = goals.find(g => g.status === 'draft');
      if (draft) setSelectedId(draft.id);
      else { setEditingId(undefined); setCreating(true); }
    }
  }, [guided, loading, error, goals, selectedId, creating]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener('xian-goals-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('xian-goals-changed', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { try { sessionStorage.setItem(formKey, JSON.stringify(input)); } catch { /* private mode */ } }, [input]);
  useEffect(() => {
    if (embedded) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, [embedded]);
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab') return;
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,summary,[href]') || [])].filter(n => n.offsetParent !== null);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  async function generate() {
    if (pending) return;
    setPending(recordOnly ? '正在记下你的心愿…' : '正在为愿望安排章节，通常需要一些时间…'); setError('');
    try {
      const isExample = Object.keys(exampleInput).every(key => input[key as keyof GoalInput] === exampleInput[key as keyof GoalInput]);
      const g = await createGoalDraft(isExample ? { example: true } : { ...emptyInput, wish: input.wish }, editingId);
      if (alive.current) { patch(g); setSelectedId(g.id); setCreating(false); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current) setPending(''); }
  }
  async function action(action: 'confirm' | 'pause' | 'resume') {
    if (!goal || pending) return;
    setPending('正在保存…'); setError('');
    try { const g = await changeGoalStatus(goal.id, action); if (alive.current) { patch(g); if (action === 'confirm') confirmedCallback.current?.(); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current) setPending(''); }
  }
  const conflictingTask = executing && goal?.inProgress?.sessionId !== currentSessionId;
  const unsuitable = !!next && (minutes < next.minutes || (next.scene !== 'any' && next.scene !== scene));

  return <div className={`${embedded ? 'goals-overlay goals-embedded' : 'goals-overlay'}${guided ? ' goals-guided' : ''}`} ref={root} tabIndex={embedded ? undefined : -1} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="goals-heading" onKeyDown={embedded ? undefined : trapFocus}>
    <div className="goals-paper">
      <header className="goals-top">
        {(!embedded || goal || creating) && <button className="goals-back" onClick={() => { if (goal || creating) { setSelectedId(undefined); setCreating(false); setError(''); } else onClose(); }}>{goal || creating ? '← 心愿计划' : '← 回到此刻'}</button>}
        <span className="font-hand">一点一点，也会很远</span>
        {!embedded && <button className="goals-close" onClick={onClose} aria-label="关闭心愿计划">×</button>}
      </header>
      <main className="goals-body">
        {error && <div className="goals-error" role="alert">{error} {!pending && <button onClick={load}>刷新记录</button>}</div>}
        {pending && <p className="goals-pending" role="status">{pending}<small>{recordOnly ? '可以稍后再填；保存成功后，心愿会留在我的手册里。' : '可以先回到此刻；生成成功的草稿会保存在心愿计划里。'}</small></p>}
        {loading && <p role="status">正在打开你的心愿计划…</p>}
        {creating ? <>
          {!guided && <p className="goals-eyebrow">一颗愿望，几片日常</p>}
          <h1 id="goals-heading">你想慢慢靠近什么？</h1>
          <p className="goals-intro">{recordOnly ? '简单写下你想做的事，先为这个念头留个位置。' : '简单写下你想做的事就好。吱呀会结合你的喜好，把它安排成具体的小任务。'}</p>
          <form className="goals-form" onSubmit={e => { e.preventDefault(); void generate(); }}>
            <label>我的愿望<textarea required minLength={2} maxLength={500} value={input.wish} placeholder="比如：留意住处附近的建筑，做一本自己的街区观察册" onChange={e => setInput({ ...input, wish: e.target.value })} /></label>
            {guided && <div className="goal-wish-seeds" aria-label="心愿灵感">
              {['做一本街区观察册', '重新捡起画画', '找到自己的拿手菜'].map(wish => <button type="button" key={wish} onClick={() => setInput({ ...input, wish })}>{wish}</button>)}
            </div>}
            <button className="goals-primary" disabled={!!pending}>{recordOnly ? '记下心愿 →' : '替我安排章节 →'}</button>
            {input.wish === exampleInput.wish && <small>完整保留示例内容时使用预设章节；修改后会按你的输入重新生成。</small>}
            <small>{recordOnly ? '先记下来，之后在我的手册里查看安排，再决定何时开始。' : '先预览，再决定是否开启。没有每日打卡，也没有过期惩罚。'}</small>
          </form>
        </> : goal && recordOnly ? <>
          <h1 id="goals-heading">心愿已记下</h1>
          <div className="goals-reason"><p>{goal.input.wish}</p></div>
          <p className="goals-intro">这个念头已经留在「我的手册」里。之后有空，再去看看具体安排，决定何时开始。</p>
          <button className="goals-primary" onClick={() => confirmedCallback.current?.()}>记好了，继续 →</button>
        </> : goal ? <>
          <p className="goals-eyebrow">{statuses[goal.status]} · {goal.records.length} / {goal.plan.chapters.length} 章</p>
          <h1 id="goals-heading">{goal.plan.title}</h1>
          <p className="goals-intro">{goal.plan.outcome}</p>
          <div className="goals-reason"><span>起初，是因为</span><p>{goal.input.motivation || goal.input.wish}</p>
            {(goal.input.preferences || goal.input.avoid) && <small>喜好：{goal.input.preferences || '慢慢探索'}　雷点：{goal.input.avoid || '暂无'}</small>}
          </div>
          <div className="goals-progress" role="progressbar" aria-label="心愿计划完成进度" aria-valuemin={0} aria-valuemax={goal.plan.chapters.length} aria-valuenow={goal.records.length}><span style={{ width: `${goal.records.length / goal.plan.chapters.length * 100}%` }} /></div>
          <div className="goals-toolbar">
            {goal.status === 'draft' ? <><button className="goals-primary" disabled={!!pending} onClick={() => action('confirm')}>开启心愿计划</button>
              <button disabled={!!pending} onClick={() => { setInput({ ...goal.input }); setEditingId(goal.id); setCreating(true); }}>修改愿望与安排</button></>
              : goal.status !== 'completed' && <button disabled={!!pending} onClick={() => action(goal.status === 'paused' ? 'resume' : 'pause')}>{goal.status === 'paused' ? '继续生长' : '先歇一阵'}</button>}
            {!!goal.records.length && <button onClick={() => exportGoal(goal)}>下载我的成果</button>}
          </div>
          {(goal.status === 'active' || goal.inProgress) && next && <section className="goals-next">
            <span className="goals-eyebrow">{goal.inProgress ? '你已经接下这一章' : '下一次，接着这一页'}</span>
            <h2>{next.title}</h2><p>{next.connection}</p>
            {!goal.inProgress && <div className="goals-field-pair">
              <label>此刻有空<select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[5, 10, 15, 20, 30, 60].map(n => <option key={n} value={n}>{n} 分钟</option>)}</select></label>
              <label>此刻在<select value={scene} onChange={e => setScene(e.target.value as GoalScene)}>{Object.entries(scenes).filter(([k]) => k !== 'any').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            </div>}
            <button className="goals-primary" disabled={busy || !!pending || conflictingTask || (!goal.inProgress && unsuitable)} onClick={() => { onStart(goal, minutes, scenes[scene]); onClose(); }}>{goal.inProgress ? '继续这一章 →' : '今天想推进一点 →'}</button>
            {conflictingTask ? <small>先完成或放下当前支线，再来接这一章。</small>
              : !goal.inProgress && unsuitable ? <small>这一章需要约 {next.minutes} 分钟，{scenes[next.scene]}。条件合适时再开始就好。</small>
                : <small>{goal.inProgress ? '将打开已经保存的任务和证物。' : '平时做碎片任务时，它也可能悄悄出现在推荐里。'}</small>}
          </section>}
          <section className="goals-chapters" aria-label="章节与真实成果">
            {goal.plan.chapters.map((chapter, i) => {
              const record = goal.records.find(r => r.chapterId === chapter.id);
              return <article className={`goals-chapter ${record ? 'is-done' : ''}`} key={chapter.id}>
                <div className="goals-chapter-number">{record ? '✓' : String(i + 1).padStart(2, '0')}</div>
                <div className="goals-chapter-content"><span className="goals-eyebrow">{record ? '已经留下' : i === goal.records.length ? '下一章' : '以后慢慢来'} · {chapter.minutes} 分钟 · {scenes[chapter.scene]}</span>
                  <h2>{chapter.title}</h2><p>{chapter.purpose}</p><p className="goals-connection">{chapter.connection}</p>
                  <div className="goals-outcome">会留下：{chapter.outcome}</div>
                  {!record && i > goal.records.length && <small>完成第 {i} 章后解锁；前面的成果会成为这一章的材料。</small>}
                  <details open={!!record || goal.status === 'draft'}>
                    <summary>{record ? `翻看成果 · ${new Date(record.at).toLocaleDateString()}` : '看看这一章怎么做'}</summary>
                    {(record?.steps || chapter.steps).map((step, j) => <div className="goals-evidence" key={j}>
                      <strong>{j + 1}. {step.instruction}</strong>
                      <p className="goals-proof">{step.proofPrompt}</p>
                      {step.submittedEvidence && <blockquote>{step.submittedEvidence.text}
                        {step.submittedEvidence.photoUrl && <a href={appUrl(step.submittedEvidence.photoUrl)} target="_blank" rel="noreferrer"><img src={appUrl(step.submittedEvidence.photoUrl)} alt={`${chapter.title}第${j + 1}步的原始证物`} loading="lazy" /></a>}
                      </blockquote>}
                    </div>)}
                  </details>
                </div>
              </article>;
            })}
          </section>
          <section className="goals-rewards"><p className="goals-eyebrow">只属于「{goal.plan.title}」的纪念</p><h2>走过的路，会有回声</h2>
            <div className="goals-stamps">{[{ id: 'first', name: '第一片拼图', at: '完成第一章' }, { id: 'half', name: '渐渐成形', at: `完成第 ${Math.ceil(goal.plan.chapters.length / 2)} 章` }, { id: 'complete', name: '愿望成册', at: '完成所有章节' }].map(item => {
              const earned = goal.rewards.find(r => r.id === item.id);
              return <div className={earned ? 'earned' : ''} key={item.id}><span aria-hidden>{earned ? '✳' : '◌'}</span><strong>{item.name}</strong><small>{earned ? new Date(earned.at).toLocaleDateString() : item.at}</small></div>;
            })}</div>
            {goal.status === 'completed' && <p className="goals-finale">从一个念头，到这一册真实发生过的日常。它已经属于你了。</p>}
          </section>
        </> : <>
          <p className="goals-eyebrow">LONG LITTLE JOURNEYS</p>
          <h1 id="goals-heading">把喜欢，慢慢过成生活。</h1>
          <p className="goals-intro">不必一下走很远。把一个愿望放在这里，每次留一点时间，让零碎的小事有自己的来处和去向。</p>
          <div className="goals-toolbar"><button className="goals-primary" disabled={!!pending} onClick={() => { setEditingId(undefined); setCreating(true); }}>＋ 种下一颗愿望</button><button disabled={!!pending} onClick={() => { setEditingId(undefined); setInput({ ...exampleInput }); setCreating(true); }}>体验示例 · 声音小册</button></div>
          {!loading && goals.length === 0 && <div className="goals-empty"><span aria-hidden>✳</span><h2>还没有心愿计划</h2><p>想做一本观察册，想更了解自己的口味，或想重新捡起画画。<br />从一个你愿意靠近的念头开始就好。</p><small>每章都有真实成果，彼此相连，也允许随时歇歇。</small></div>}
          <div className="goals-list">{goals.map((g, i) => <button className="goals-cover" key={g.id} onClick={() => { setSelectedId(g.id); setMinutes(Math.max(15, g.plan.chapters[g.records.length]?.minutes || 15)); setScene(g.plan.chapters[g.records.length]?.scene === 'any' ? 'home' : g.plan.chapters[g.records.length]?.scene || 'home'); }}>
            <span className="goals-cover-number">{String(i + 1).padStart(2, '0')}</span><span className="goals-eyebrow">{statuses[g.status]}</span><h2>{g.plan.title}</h2><p>{g.plan.outcome}</p><div className="goals-cover-footer"><span>{g.records.length} / {g.plan.chapters.length} 章 · {g.rewards.length} 枚纪念章</span><span>翻开 →</span></div>
          </button>)}</div>
        </>}
      </main>
      <footer className="goals-footer font-hand">生活有主线，快乐在支线。</footer>
    </div>
  </div>;
}
