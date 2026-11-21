import { useEffect, useRef, useState } from 'react';
import { getClientId } from '../handbook';
import type { PairAnswer, QuestPair, UserProfile, PreferenceFitting } from '../types';

interface Draft { version: string; answers: Record<string, PairAnswer>; index: number }
const draftKey = () => `xian-preference-fitting-v1:${getClientId()}`;
const valid = (answer: unknown): answer is PairAnswer => typeof answer === 'string' && ['A', 'B', 'tie', 'skip'].includes(answer);
function readDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (draft?.version !== 'v1' || !draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers)) return null;
    return { ...draft, index: Number.isInteger(draft.index) && draft.index >= 0 ? draft.index : 0 };
  } catch { return null; }
}
function cleaned(answers: Record<string, PairAnswer>, pairs: QuestPair[]) {
  return Object.fromEntries(pairs.filter(pair => valid(answers[pair.id])).map(pair => [pair.id, answers[pair.id]]));
}
function FittingResult({ fit }: { fit?: PreferenceFitting }) {
  if (!fit?.reviewed) return null;
  return <section className="fitting-result" aria-label="我的喜好画像">
    <p className="preference-eyebrow">根据这次选择，留下的偏好线索</p>
    <h3>{fit.decisive ? '你喜欢的玩法，渐渐有了轮廓' : '目前还没有明显的偏向'}</h3>
    <p className="preference-note">已看 {fit.reviewed} 组 · 明确选择 {fit.decisive} 组 · 差不多 {fit.ties} 组 · 跳过 {fit.skipped} 组</p>
    <div className="fitting-dimensions">{fit.dimensions.map(dimension => {
      const positive = dimension.signals.filter(signal => signal.weight > .06 && signal.comparisons >= 2).slice(0, 2);
      const negative = dimension.signals.filter(signal => signal.weight < -.06 && signal.comparisons >= 2).slice(-1);
      return <article key={dimension.id}><h4>{dimension.label}</h4><p>{positive.length ? positive.map(s => s.label).join('、') : '暂未形成明显偏向'}</p>{negative.length > 0 && <small>相对较少选：{negative.map(s => s.label).join('、')}</small>}</article>;
    })}</div>
    <p className="preference-note">这是有限选择里的相对倾向，可以变化。推荐会参考这些线索，同时优先遵守你的明确限制和当下情况。</p>
  </section>;
}
export function PreferenceFittingPanel({ profile, pairs, onSave }: { profile: UserProfile; pairs: QuestPair[]; onSave?: (votes: Record<string, PairAnswer>) => Promise<UserProfile> }) {
  const [draft, setDraft] = useState(readDraft);
  const [answers, setAnswers] = useState<Record<string, PairAnswer>>(() => readDraft()?.answers || {});
  const [index, setIndex] = useState(() => readDraft()?.index || 0);
  const [view, setView] = useState<'intro' | 'question' | 'review' | 'result'>('intro');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [result, setResult] = useState(profile.fitting);
  const root = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const position = Math.max(0, Math.min(index, pairs.length - 1));
  const pair = pairs[position];
  const known = cleaned(answers, pairs);
  const count = Object.keys(known).length;
  const sections = [...new Set(pairs.map(pair => pair.section || '玩法对比'))];
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-fitting-heading]')?.focus({ preventScroll: true });
    root.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [index, view]);
  useEffect(() => {
    if (view !== 'question' && view !== 'review') return;
    const next = { version: 'v1', answers: known, index: position };
    try { localStorage.setItem(draftKey(), JSON.stringify(next)); setDraft(next); setStorageError(false); }
    catch { setStorageError(true); }
  }, [answers, index, view, pairs]);
  function start(reset: boolean) {
    clearTimeout(timer.current); setError('');
    const current = reset ? {} : cleaned(draft?.answers || profile.pairVotes, pairs);
    setAnswers(current);
    const first = pairs.findIndex(pair => !current[pair.id]);
    setIndex(!reset && draft ? Math.min(draft.index, pairs.length - 1) : first === -1 ? 0 : first);
    setView(first === -1 ? 'review' : 'question');
  }
  function move(next: number) { clearTimeout(timer.current); setIndex(next); setView('question'); setError(''); }
  function answer(value: PairAnswer) {
    clearTimeout(timer.current);
    setAnswers(prev => ({ ...prev, [pair.id]: value }));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      if (position < pairs.length - 1) setIndex(position + 1); else setView('review');
    }, reduced ? 0 : 240);
  }
  return <div className="preference-fitting" ref={root}>
    {view === 'intro' && <>
      <p className="preference-eyebrow">30组对比 · 6个方向</p><h3 tabIndex={-1} data-fitting-heading>两件小事，你更想做哪一件？</h3>
      <p>从真实的小玩法里做选择，让吱呀摸清你的节奏、场景和玩法口味。按平时的喜好选，不必局限于此刻。</p>
      <ul className="fitting-intro-notes"><li>每组时间、花费一致。需要同伴的选项，假设有人能陪你。</li><li>选卡片就进入下一组；拿不准可选「差不多」或跳过。</li><li>进度留在本机，可随时离开；最后确认后才更新画像。</li></ul>
      <div className="fitting-section-tags">{sections.map(section => <span key={section}>{section}</span>)}</div>
      {pairs.length > 0 ? <div className="fitting-actions">
        <button className="preference-primary" onClick={() => start(false)}>{draft ? `继续上次问卷（已看${Object.keys(cleaned(draft.answers, pairs)).length}/${pairs.length}组）` : profile.fitting?.complete ? '回看并调整我的答案' : '开始30组喜好对比 →'}</button>
        {profile.fitting?.complete && <button className="preference-secondary" onClick={() => { setResult(profile.fitting); setView('result'); }}>查看已保存画像</button>}
      </div> : <p className="preference-error" role="status">问卷暂时没有加载出来，请重新打开页面后重试。</p>}
    </>}
    {view === 'question' && pair && <>
      <div className="fitting-question-top"><span>{pair.section} · 第 {position + 1} / {pairs.length} 组</span><button onClick={() => { clearTimeout(timer.current); setView('intro'); }}>稍后继续</button></div>
      <progress aria-label="问卷完成进度" value={count} max={pairs.length} />
      <h3 tabIndex={-1} data-fitting-heading>{pair.when}</h3>
      <div className="fitting-pair-cards">{(['A', 'B'] as const).map(side => {
        const card = side === 'A' ? pair.a : pair.b;
        return <button key={pair.id + side} className="fitting-pair-card" aria-pressed={answers[pair.id] === side} aria-label={`选${side}：${card.title}`} onClick={() => answer(side)}>
          <span className="fitting-card-letter">{side}</span><strong>{card.title}</strong><p>{card.text}</p><small>约{card.min}分钟 · {card.scenes.join('/')} · {card.budget === '0' ? '不额外花钱' : '小额花费'}{card.people ? ` · ${card.people.map(p => ({ 独: '独自', 双: '两人', 众: '多人' })[p] || p).join('/')}` : ''}</small>
        </button>;
      })}</div>
      <div className="fitting-neutral"><button aria-pressed={answers[pair.id] === 'tie'} onClick={() => answer('tie')}>两个差不多</button><button aria-pressed={answers[pair.id] === 'skip'} onClick={() => answer('skip')}>都不想选，跳过</button></div>
      <div className="fitting-navigation"><button disabled={position === 0} onClick={() => move(position - 1)}>上一组</button><span>已看 {count}/{pairs.length} 组</span><button disabled={!answers[pair.id]} onClick={() => { clearTimeout(timer.current); if (position === pairs.length - 1) setView('review'); else move(position + 1); }}>下一组</button></div>
      {count === pairs.length && <button className="preference-secondary" onClick={() => { clearTimeout(timer.current); setView('review'); }}>检查全部答案</button>}
    </>}
    {view === 'review' && <>
      <h3 tabIndex={-1} data-fitting-heading>检查一下，再保存我的画像</h3>
      <p className="preference-note">已看 {count}/{pairs.length} 组，点击任意一组可以回改。跳过的题目不会被当作明确不喜欢。</p>
      <div className="fitting-review">{pairs.map((pair, i) => <button key={pair.id} disabled={saving} onClick={() => move(i)}><span>{i + 1}. {pair.section}</span><strong>{answers[pair.id] === 'A' ? pair.a.title : answers[pair.id] === 'B' ? pair.b.title : answers[pair.id] === 'tie' ? '两个差不多' : answers[pair.id] === 'skip' ? '已跳过' : '还没选'}</strong><span aria-hidden>→</span></button>)}</div>
      <button className="preference-primary" disabled={saving || count !== pairs.length || !onSave} onClick={async () => {
        if (saving || !onSave) return;
        root.current?.querySelector<HTMLElement>('[data-fitting-heading]')?.focus({ preventScroll: true });
        setSaving(true); setError('');
        try {
          const saved = await onSave(known);
          try {
            const current = readDraft();
            if (current && JSON.stringify(cleaned(current.answers, pairs)) === JSON.stringify(known)) localStorage.removeItem(draftKey());
          } catch { /* no saved draft */ }
          if (alive.current) { setDraft(null); setResult(saved.fitting); setView('result'); }
        } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '暂时没能保存，请重试。'); }
        finally { if (alive.current) setSaving(false); }
      }}>{saving ? '正在保存并拟合…' : '保存问卷，生成喜好画像 →'}</button>
      {count !== pairs.length && <p className="preference-note">还有 {pairs.length - count} 组未选择，拿不准的可以跳过。</p>}
    </>}
    {view === 'result' && <><h3 tabIndex={-1} data-fitting-heading>喜好画像已保存</h3><FittingResult fit={result} /><div className="fitting-actions"><button className="preference-primary" onClick={() => start(false)}>回看并调整答案</button><button className="preference-secondary" onClick={() => start(true)}>从头重新拟合</button></div></>}
    {error && <p className="preference-error" role="alert">{error}</p>}
    {storageError && <p className="preference-error" role="status">浏览器暂时无法保存本机进度；请在当前页面完成，或稍后重试。</p>}
  </div>;
}
