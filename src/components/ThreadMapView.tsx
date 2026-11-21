import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Goal } from '../../server/goals-types';
import type { HandbookView } from '../types';
import { CATEGORY_META, formatDate } from '../handbook';
import { listGoals } from '../goals-api';
import { listThreads, saveThread, removeThread, type QuestThread, type ThreadInput } from '../threads-api';
import { buildThreadRoutes, explorationPrompt, type ThreadRoute } from '../thread-map';
import { QuestRecordCard } from './RecordsView';
import './thread-map.css';

interface Props {
  view: HandbookView | null;
  active: boolean;
  busy: boolean;
  executing: boolean;
  onExplore: (text: string) => void;
  onGoals: () => void;
  onRecords: () => void;
  onRetryRecords: () => void;
}
type Editor = ThreadInput & { id?: string };
const sourceNames = { custom: '我的主题', goal: '心愿章节', category: '探索方向' };
const stopNames = { done: '已完成', next: '下一站', active: '进行中', locked: '待解锁', planned: '待确认' };
const goalNames = { draft: '待确认计划', active: '正在探索', paused: '暂时歇歇', completed: '已完成计划' };

function RouteBranch({ route, selected, onSelect }: { route: ThreadRoute; selected: boolean; onSelect: () => void }) {
  const done = route.stops.filter(stop => stop.status === 'done');
  const preview = route.kind === 'goal' ? route.stops.slice(0, 3) : route.stops.slice(-3);
  return <li className="thread-branch" style={{ '--route-color': route.color } as CSSProperties}>
    <button type="button" className="thread-route" aria-pressed={selected} onClick={onSelect} aria-label={`查看支线：${route.title}`}>
      <span className="thread-route-heading"><strong>{route.title}</strong><span aria-hidden>↗</span></span>
      <span className="thread-route-meta">{route.goal ? `${goalNames[route.goal.status]} · ${done.length}/${route.stops.length} 章` : `${done.length} 段经历${route.category ? ` · ${CATEGORY_META[route.category].label}` : ''}`}</span>
      <span className="thread-mini-track" aria-hidden="true">
        {preview.length ? preview.map(stop => <span key={stop.id} data-done={stop.status === 'done'}><i /><span>{stop.title}</span></span>) : <span className="thread-unexplored"><i />还没走过，留一点好奇给这里</span>}
        {route.stops.length > 3 && <b>共 {route.stops.length} {route.kind === 'goal' ? '章' : '段'}</b>}
      </span>
    </button>
  </li>;
}

export function ThreadMapView({ view, active, busy, executing, onExplore, onGoals, onRecords, onRetryRecords }: Props) {
  const [threads, setThreads] = useState<QuestThread[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const routes = useMemo(() => buildThreadRoutes(view?.quests || [], threads, goals), [view, threads, goals]);
  const selected = routes.find(route => route.id === selectedId);
  const hasDetail = !!selected || !!editor;
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setLoadError('');
    const [custom, wishes] = await Promise.allSettled([listThreads(), listGoals()]);
    if (id !== requestId.current) return;
    if (custom.status === 'fulfilled') setThreads(custom.value);
    if (wishes.status === 'fulfilled') setGoals(wishes.value);
    if (custom.status === 'rejected' || wishes.status === 'rejected') setLoadError('部分脉络暂时没能打开，已有的探索记录仍可查看。');
    setLoading(false);
  }, []);
  useEffect(() => {
    if (!active) return;
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('xian-goals-changed', refresh);
    return () => { requestId.current++; window.removeEventListener('xian-goals-changed', refresh); };
  }, [active, load, view?.quests.length]);
  useEffect(() => {
    if (!active) return;
    setConfirmRemove(false); setSaveError('');
    root.current?.scrollTo({ top: 0 });
    root.current?.querySelector<HTMLElement>(selectedId || editor ? '[data-thread-heading]' : '[data-thread-overview-heading]')?.focus({ preventScroll: true });
  }, [selectedId, !!editor]); // Selection changes the reading surface, not each draft keystroke.

  function edit(route?: ThreadRoute) {
    setSaveError(''); setNotice(''); setSearch('');
    setEditor(route?.thread ? { id: route.thread.id, title: route.thread.title, description: route.thread.description, questIds: route.thread.questIds.filter(id => view?.quests.some(q => q.id === id)) }
      : { title: route?.title || '', description: '', questIds: route?.stops.flatMap(s => s.record ? [s.record.id] : []).slice(-500) || [] });
  }
  async function save() {
    if (!editor || pending) return;
    setPending(true); setSaveError('');
    try {
      const thread = await saveThread({ title: editor.title.trim(), description: editor.description.trim(), questIds: editor.questIds }, editor.id);
      setThreads(prev => [thread, ...prev.filter(item => item.id !== thread.id)]);
      setEditor(null); setSelectedId(`custom:${thread.id}`); setNotice('支线已收好，以后可以继续把经历串进来。');
    } catch (error) { setSaveError(error instanceof Error ? error.message : '保存失败，请重试'); }
    finally { setPending(false); }
  }
  async function remove() {
    if (!selected?.thread || pending) return;
    setPending(true); setSaveError('');
    try {
      await removeThread(selected.thread.id);
      setThreads(prev => prev.filter(item => item.id !== selected.thread!.id));
      setSelectedId(null); setNotice('已移除这条主题，原来的经历和作品都还在。'); setConfirmRemove(false);
    } catch (error) { setSaveError(error instanceof Error ? error.message : '移除失败，请重试'); }
    finally { setPending(false); }
  }
  function explore(route: ThreadRoute) {
    if (busy || executing) return;
    onExplore(explorationPrompt(route));
  }
  const available = (view?.quests || []).filter(q => !search.trim() || `${q.title} ${q.tags.join(' ')} ${CATEGORY_META[q.category].label}`.includes(search.trim()));

  return <div ref={root} className={`thread-map ${hasDetail ? 'thread-has-detail' : ''}`}>
    <header className="thread-page-heading">
      <div><p className="thread-eyebrow">我的探索，慢慢有了形状</p><h2 tabIndex={-1} data-thread-overview-heading>支线脉络</h2></div>
      <button type="button" className="thread-action" disabled={!view?.quests.length || loading || !!loadError || pending} onClick={() => edit()}>串成一条支线 <span aria-hidden>＋</span></button>
    </header>
    <p className="thread-intro">把试过的小事连起来，看见值得继续的方向。</p>
    {notice && <p className="thread-notice" role="status">{notice}</p>}
    {loading && <p className="thread-status" role="status">正在翻开你的探索地图…</p>}
    {loadError && <div className="thread-error" role="alert"><p>{loadError}</p><button type="button" disabled={loading} onClick={() => void load()}>重新加载脉络</button></div>}
    {!view && <div className="thread-error" role="alert"><p>还没能打开探索记录。</p><button type="button" onClick={onRetryRecords}>重新加载记录</button></div>}
    <div className="thread-map-layout">
      <div className="thread-overview">
        <div className="thread-origin"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21V11M12 15C3 15 3 4 3 4S12 3 12 12M12 11C12 3 21 3 21 3S22 12 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span>从一次尝试出发</span><small>{view ? `${view.quests.length} 段已完成的经历` : '等待记录'}</small></div>
        {!view?.quests.length && view && <p className="thread-empty-intro">地图还在等你的第一段经历。可以先选个方向试试，也可以去心愿里种下一个计划。</p>}
        {(['custom', 'goal', 'category'] as const).map(kind => {
          const group = routes.filter(route => route.kind === kind);
          if (!group.length) return null;
          return <section className="thread-route-group" key={kind} aria-label={sourceNames[kind]}>
            <h3>{sourceNames[kind]}<small>{kind === 'custom' ? '由你串起' : kind === 'goal' ? '沿着章节前进' : '按体验类型整理'}</small></h3>
            <ul>{group.map(route => <RouteBranch key={route.id} route={route} selected={route.id === selectedId} onSelect={() => { setEditor(null); setSelectedId(route.id); setNotice(''); }} />)}</ul>
          </section>;
        })}
        {!goals.length && !loading && !loadError && <button type="button" className="thread-wish-link" onClick={onGoals}>想围绕一个心愿走得更远？去安排心愿章节 →</button>}
        <p className="thread-map-note">实心圆是已完成的经历，空心圆是尚未走过的地方。同一段经历可以连接不同主题。</p>
        <button type="button" className="thread-text-button" onClick={onRecords}>翻看全部日常记录 →</button>
      </div>
      {hasDetail && <section className="thread-detail" aria-label={editor ? '编辑支线主题' : '支线详情'}>
        <button type="button" className="thread-back" disabled={pending} onClick={() => { setEditor(null); setSelectedId(null); setSaveError(''); }}>← 返回地图</button>
        {editor ? <form className="thread-editor" onSubmit={e => { e.preventDefault(); void save(); }}>
          <h3 tabIndex={-1} data-thread-heading>{editor.id ? '整理这条支线' : '把经历串成自己的支线'}</h3>
          <p>名字由你来定，经历可以跨越不同类型。</p>
          <label>支线名称<input autoComplete="off" maxLength={60} required value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} placeholder="比如：认识我住的街区" disabled={pending} /></label>
          <label>想沿着它探索什么？<span>选填</span><textarea maxLength={240} rows={2} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} placeholder="把散步、声音和小店的故事放在一起" disabled={pending} /></label>
          <fieldset disabled={pending}><legend>串入经历 · 已选 {editor.questIds.length} 段</legend>
            {(view?.quests.length || 0) > 500 && <p>每条主题最多串入 500 段经历。</p>}
            {(view?.quests.length || 0) > 6 && <label className="thread-search">查找经历<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>}
            <div className="thread-pick-list">{available.map(q => <label key={q.id}><input type="checkbox" checked={editor.questIds.includes(q.id)} disabled={!editor.questIds.includes(q.id) && editor.questIds.length >= 500} onChange={e => setEditor({ ...editor, questIds: e.target.checked ? [...editor.questIds, q.id] : editor.questIds.filter(id => id !== q.id) })} /><span><strong>{q.title}</strong><small>{formatDate(q.date)} · {CATEGORY_META[q.category].label}</small></span></label>)}</div>
            {!available.length && <p>没有找到这段经历，试试换个词。</p>}
          </fieldset>
          {saveError && <p className="thread-error" role="alert">{saveError}</p>}
          <div className="thread-editor-actions"><button className="thread-primary" type="submit" disabled={pending || !editor.title.trim() || !editor.questIds.length}>{pending ? '正在保存…' : '保存这条支线'}</button><button type="button" disabled={pending} onClick={() => setEditor(null)}>取消</button></div>
        </form> : selected && <>
          <div className="thread-detail-heading" style={{ '--route-color': selected.color } as CSSProperties}>
            <p className="thread-eyebrow">{sourceNames[selected.kind]}{selected.goal ? ` · ${goalNames[selected.goal.status]}` : ''}</p>
            <h3 tabIndex={-1} data-thread-heading>{selected.title}</h3>
            <p>{selected.description}</p>
            {selected.kind !== 'goal' && <small>按探索时间串起；你可以从任何一次经历继续。</small>}
          </div>
          {!!selected.stops.length && <ol className="thread-timeline" style={{ '--route-color': selected.color } as CSSProperties}>
            {selected.stops.map((stop, index) => <li key={stop.id} data-status={stop.status}>
              <span className="thread-stop-dot" aria-hidden>{stop.status === 'done' ? '✓' : index + 1}</span>
              <p className="thread-stop-caption">{stopNames[stop.status]}{stop.record ? ` · ${formatDate(stop.record.date)}` : ''}</p>
              {stop.record ? <QuestRecordCard record={stop.record} /> : <h4>{stop.title}</h4>}
              {stop.purpose && <p className="thread-stop-purpose">{stop.purpose}</p>}
              {stop.connection && <p className="thread-connection">{stop.connection}</p>}
            </li>)}
          </ol>}
          {!selected.stops.length && <div className="thread-empty-detail"><p>这个方向还没有留下经历。</p><p>先试一次，地图就会多一个属于你的节点。</p></div>}
          <div className="thread-next-stop">
            <span className="thread-next-dot" aria-hidden /><div><h4>{selected.goal ? selected.goal.status === 'completed' ? '这段心愿已经走完' : '沿心愿继续下一章' : '下一次探索，留给你来选'}</h4>
              <p>{selected.goal ? '在心愿计划里查看章节、调整状态，再选择合适的条件出发。' : '带上这条线里的经历，和吱呀一起找一个相关的新玩法。'}</p>
              {selected.goal ? <button type="button" className="thread-primary" onClick={onGoals}>查看心愿计划 →</button> : <button type="button" className="thread-primary" disabled={busy || executing} onClick={() => explore(selected)}>沿这条线继续探索 →</button>}
              {executing && selected.kind !== 'goal' && <small>先回到正在进行的任务，完成或放下后再探索。</small>}
            </div>
          </div>
          {selected.kind !== 'goal' && <div className="thread-detail-tools"><button type="button" disabled={pending || !!loadError || loading || !selected.stops.length} onClick={() => edit(selected)}>{selected.thread ? '编辑名称与经历' : '把这些经历串成我的主题'}</button>{selected.thread && <button type="button" disabled={pending} onClick={() => setConfirmRemove(true)}>移除主题</button>}</div>}
          {confirmRemove && <div className="thread-remove-confirm"><p>只移除主题，经历和作品都会保留。</p><button type="button" disabled={pending} onClick={() => void remove()}>{pending ? '正在移除…' : '确认移除主题'}</button><button type="button" disabled={pending} onClick={() => setConfirmRemove(false)}>保留主题</button></div>}
          {saveError && <p className="thread-error" role="alert">{saveError}</p>}
        </>}
      </section>}
    </div>
  </div>;
}
