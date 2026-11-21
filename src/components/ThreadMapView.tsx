import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Goal } from '../../server/goals-types';
import type { HandbookView } from '../types';
import { CATEGORY_META, formatDate } from '../handbook';
import { listGoals } from '../goals-api';
import { listThreads, saveThread, removeThread, type QuestThread, type ThreadInput } from '../threads-api';
import { buildThreadRoutes, explorationPrompt, type ThreadRoute } from '../thread-map';
import { QuestRecordCard } from './RecordsView';
import { ThreadGraph, RouteJourney } from './ThreadGraph';
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

function RouteBranch({ route, onSelect }: { route: ThreadRoute; onSelect: () => void }) {
  const done = route.stops.filter(stop => stop.status === 'done').length;
  return <li className="thread-branch" style={{ '--route-color': route.color } as CSSProperties}>
    <button type="button" className="thread-route" onClick={onSelect} aria-label={`查看支线：${route.title}`}>
      <span className="thread-route-heading"><strong>{route.title}</strong><small>{done}{route.goal ? `/${route.stops.length}` : ''}</small><span aria-hidden>↗</span></span>
      <span className="thread-mini-track" aria-hidden="true">{route.stops.slice(0, 8).map(stop => <i key={stop.id} data-status={stop.status} />)}</span>
    </button>
  </li>;
}

export function ThreadMapView({ view, active, busy, executing, onExplore, onGoals, onRecords, onRetryRecords }: Props) {
  const [threads, setThreads] = useState<QuestThread[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
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
  const record = view?.quests.find(item => item.id === recordId);
  const selectedStop = selected?.stops.find(stop => stop.id === stopId);
  function revealPanel(selector: string) {
    const panel = root.current?.querySelector<HTMLElement>(selector);
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  function selectRoute(route: ThreadRoute) {
    setEditor(null); setSelectedId(route.id); setRecordId(null); setStopId(null); setNotice('');
  }
  useEffect(() => {
    if (!recordId || !active) return;
    revealPanel('.thread-record-peek');
  }, [recordId, active]);
  useEffect(() => { setStopId(null); }, [selectedId]);
  useEffect(() => {
    if (!stopId || !active) return;
    revealPanel('.thread-stop-detail');
  }, [stopId, active]);
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
    setSaveError(''); setNotice(''); setSearch(''); setRecordId(null); setStopId(null);
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
      <div><h2 tabIndex={-1} data-thread-overview-heading>支线脉络</h2></div>
      <button type="button" className="thread-action" disabled={!view?.quests.length || loading || !!loadError || pending} aria-label="串成一条支线" onClick={() => edit()}>串起来 <span aria-hidden>＋</span></button>
    </header>

    {notice && <p className="thread-notice" role="status">{notice}</p>}
    {loading && <p className="thread-status" role="status">正在翻开你的探索地图…</p>}
    {loadError && <div className="thread-error" role="alert"><p>{loadError}</p><button type="button" disabled={loading} onClick={() => void load()}>重新加载脉络</button></div>}
    {!view && <div className="thread-error" role="alert"><p>还没能打开探索记录。</p><button type="button" onClick={onRetryRecords}>重新加载记录</button></div>}
    <div className="thread-map-layout">
      <div className="thread-overview">
        <div className="thread-map-stats"><span><strong>{view?.quests.length || 0}</strong> 次探索</span><span>{threads.length} 条主题 · {goals.length} 个心愿</span></div>
        <ThreadGraph records={view?.quests || []} routes={routes} selectedId={recordId} onRecord={id => {
          if (id === recordId) revealPanel('.thread-record-peek');
          else setRecordId(id);
        }} onRoute={selectRoute} />
        {record && <section className="thread-record-peek" tabIndex={-1} aria-label="任务记录详情">
          <div className="thread-peek-heading"><span>这次探索</span><button type="button" aria-label="收起任务记录" onClick={() => {
            setRecordId(null); root.current?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(record.id)}"]`)?.focus();
          }}>×</button></div>
          <QuestRecordCard key={record.id} record={record} />
          <div className="thread-record-routes">{routes.filter(route => route.kind === 'custom' && route.stops.some(stop => stop.record?.id === record.id)).map(route => <button type="button" key={route.id} aria-label={`查看支线：${route.title}`} onClick={() => selectRoute(route)}>{route.title} ↗</button>)}</div>
        </section>}
        {(['custom', 'goal'] as const).map(kind => {
          const group = routes.filter(route => route.kind === kind);
          if (!group.length) return null;
          return <section className="thread-route-group" key={kind} aria-label={sourceNames[kind]}>
            <h3>{sourceNames[kind]}</h3>
            <ul>{group.map(route => <RouteBranch key={route.id} route={route} onSelect={() => selectRoute(route)} />)}</ul>
          </section>;
        })}
        <div className="thread-overview-tools"><button type="button" className="thread-text-button" onClick={onRecords}>全部记录 ↗</button>{!goals.length && !loading && !loadError && <button type="button" className="thread-text-button" onClick={onGoals}>种下心愿 ＋</button>}</div>
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
            <p className="thread-eyebrow">{sourceNames[selected.kind]} · {selected.stops.filter(stop => stop.status === 'done').length}{selected.goal ? `/${selected.stops.length}` : ''} 已完成{selected.kind !== 'goal' ? ' · 按时间' : ''}</p>
            <h3 tabIndex={-1} data-thread-heading>{selected.title}</h3>
          </div>
          {!!selected.stops.length && <RouteJourney route={selected} selectedId={stopId} onSelect={stop => {
            if (stop.id === stopId) revealPanel('.thread-stop-detail');
            else setStopId(stop.id);
          }} />}
          {selectedStop && <section className="thread-stop-detail" tabIndex={-1} aria-label="任务与关联详情">
            <div className="thread-peek-heading"><span>{stopNames[selectedStop.status]}</span><button type="button" aria-label="收起任务详情" onClick={() => {
              setStopId(null); root.current?.querySelector<HTMLElement>(`[data-stop-id="${CSS.escape(selectedStop.id)}"]`)?.focus();
            }}>×</button></div>
            {selectedStop.record ? <QuestRecordCard key={selectedStop.id} record={selectedStop.record} /> : <h4>{selectedStop.title}</h4>}
            {(selectedStop.purpose || selectedStop.connection) && <div className="thread-stop-context">
              {selectedStop.purpose && <p>{selectedStop.purpose}</p>}
              {selectedStop.connection && <p className="thread-connection">{selectedStop.connection}</p>}
            </div>}
          </section>}
          {!selected.stops.length && <div className="thread-empty-detail"><p>这个方向还没有留下经历。</p></div>}
          {(selected.thread?.description || selected.goal) && <details className="thread-route-note"><summary>这条支线的想法</summary><p>{selected.description}</p></details>}
          <div className="thread-next-stop">
            {selected.goal ? <button type="button" className="thread-primary" onClick={onGoals}>查看心愿计划 →</button> : <button type="button" className="thread-primary" disabled={busy || executing} onClick={() => explore(selected)}>沿这条线继续探索 →</button>}
            {executing && selected.kind !== 'goal' && <small>先回到正在进行的任务，完成或放下后再探索。</small>}
          </div>
          {selected.kind !== 'goal' && <div className="thread-detail-tools"><button type="button" disabled={pending || !!loadError || loading || !selected.stops.length} onClick={() => edit(selected)}>{selected.thread ? '编辑名称与经历' : '把这些经历串成我的主题'}</button>{selected.thread && <button type="button" disabled={pending} onClick={() => setConfirmRemove(true)}>移除主题</button>}</div>}
          {confirmRemove && <div className="thread-remove-confirm"><p>只移除主题，经历和作品都会保留。</p><button type="button" disabled={pending} onClick={() => void remove()}>{pending ? '正在移除…' : '确认移除主题'}</button><button type="button" disabled={pending} onClick={() => setConfirmRemove(false)}>保留主题</button></div>}
          {saveError && <p className="thread-error" role="alert">{saveError}</p>}
        </>}
      </section>}
    </div>
  </div>;
}
