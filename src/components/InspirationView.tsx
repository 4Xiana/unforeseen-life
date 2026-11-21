import { useEffect, useState } from 'react';
import { API_BASE } from '../paths';
import { getClientId } from '../handbook';
import './inspiration.css';

interface InspirationTask {
  title: string; description: string; hook: string; tags: string[];
  category: string; minutes: number; scene: string; people: number; cost: number; energy: string; materials: string;
}
interface Draft { rawInput: string; sourceUrl?: string; sourceText: string; sourceNotice?: string; task: InspirationTask }
interface Saved extends Draft { id: string; createdAt: string; enabled: boolean }
const scenes: Record<string, string> = { any: '场景不限', home: '在家', work: '在工位', outdoors: '在户外' };
async function api<T>(route = '', method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/inspirations${route}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(75000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '还没连上，请重试。');
  }
  return response.status === 204 ? undefined as T : response.json();
}
function readDraft(key: string): { text: string; preview: Draft | null } {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || { text: '', preview: null }; }
  catch { return { text: '', preview: null }; }
}
export function InspirationView() {
  const key = `xian-inspiration-draft:${getClientId()}`;
  const [text, setText] = useState(() => readDraft(key).text);
  const [preview, setPreview] = useState<Draft | null>(() => readDraft(key).preview);
  const [items, setItems] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ text, preview })); } catch { /* form remains usable */ }
  }, [text, preview, key]);
  async function load() {
    setLoading(true);
    try { setItems(await api<Saved[]>()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取收藏'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function extract() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<Draft>('/extract', 'POST', { text });
      try { localStorage.setItem(key, JSON.stringify({ text, preview: result })); } catch { /* continue */ }
      setPreview(result);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '整理失败，你的输入已保留。'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const saved = await api<Saved>('', 'POST', preview);
      setItems(current => [saved, ...current.filter(i => i.id !== saved.id)]);
      setText(''); setPreview(null); setNotice('✅ 灵感收好了。下次有合适的空闲，吱呀会想起它。');
      try { localStorage.removeItem(key); } catch { /* continue */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '收藏失败，请重试。'); }
    finally { setBusy(false); }
  }
  async function change(item: Saved, remove = false) {
    setBusy(true); setError('');
    try {
      if (remove) {
        await api(`/${encodeURIComponent(item.id)}`, 'DELETE');
        setItems(current => current.filter(i => i.id !== item.id)); setRemoving(null);
      } else {
        const saved = await api<Saved>(`/${encodeURIComponent(item.id)}`, 'PATCH', { enabled: !item.enabled });
        setItems(current => current.map(i => i.id === item.id ? saved : i));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <div className="inspiration-view">
    <header className="inspiration-intro">
      <span className="inspiration-eyebrow">♡ 把心动的小事留住</span>
      <h2>看到喜欢的玩法，<br />先收进来。</h2>
      <p>写下自己想做的任务，或粘贴收藏的文章、视频文案和链接。吱呀帮你整理成支线，留到合适的时候再推荐。</p>
    </header>
    <form className="inspiration-form" onSubmit={e => { e.preventDefault(); void extract(); }}>
      <label htmlFor="inspiration-input">这次想留下什么灵感？</label>
      <textarea id="inspiration-input" value={text} maxLength={12000} rows={4} disabled={busy} placeholder="比如：用散步时找到的三片叶子，做一张秋日拼贴。也可以粘贴你在小红书、抖音上看到的文案或公开链接。" onChange={e => { setText(e.target.value); setPreview(null); setNotice(''); }} />
      <div className="inspiration-form-foot"><small>链接读不到时，粘贴正文也可以。</small><button className="inspiration-primary" disabled={busy || text.trim().length < 2}>{busy ? '正在整理…' : '让吱呀整理 →'}</button></div>
    </form>
    {error && <p className="inspiration-error" role="alert">{error}</p>}
    {notice && <p className="inspiration-notice" role="status">{notice}</p>}
    {preview && <section className="inspiration-preview" aria-label="灵感预览">
      <span className="inspiration-eyebrow">整理好了 · 看看是否合心意</span>
      {preview.sourceNotice && <p className="inspiration-materials">{preview.sourceNotice}</p>}
      <label htmlFor="inspiration-title">任务名称</label>
      <input id="inspiration-title" value={preview.task.title} maxLength={40} onChange={e => setPreview({ ...preview, task: { ...preview.task, title: e.target.value } })} />
      <label htmlFor="inspiration-description">核心玩法</label>
      <textarea id="inspiration-description" value={preview.task.description} maxLength={1200} rows={3} onChange={e => setPreview({ ...preview, task: { ...preview.task, description: e.target.value } })} />
      <p className="inspiration-meta">{preview.task.minutes} 分钟 · {scenes[preview.task.scene]} · {preview.task.people} 人 · {preview.task.cost ? `约 ${preview.task.cost} 元` : '零额外花费'}</p>
      <p className="inspiration-materials">{preview.task.materials}</p>
      <div className="inspiration-tags">{preview.task.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      <button className="inspiration-primary" disabled={busy || preview.task.title.trim().length < 2 || preview.task.description.trim().length < 5} onClick={() => void save()}>收藏这条灵感 ♡</button>
    </section>}
    <section className="inspiration-collection" aria-label="我的灵感收藏">
      <div className="inspiration-collection-heading"><h3>我的灵感</h3><span>{items.length} 条心动</span></div>
      {loading ? <p role="status">正在翻开收藏…</p> : !items.length && <p className="inspiration-empty">还没有收藏。把想尝试的小事留在这里，下次有空就不用从头想了。</p>}
      <button className="inspiration-refresh" onClick={() => void load()} disabled={loading}>刷新收藏</button>
      {items.map(item => <article className={`inspiration-saved ${item.enabled ? '' : 'is-paused'}`} key={item.id}>
        <div className="inspiration-saved-top"><span className="inspiration-eyebrow">{item.enabled ? '♡ 会在合适时推荐' : '◌ 暂不推荐'}</span><span>{item.task.minutes} 分钟</span></div>
        <h4>{item.task.title}</h4><p>{item.task.description}</p>
        <details><summary>看看原文与来源</summary>
          <p className="inspiration-original">{item.rawInput}</p>
          {item.sourceUrl && <a href={/^https?:\/\//i.test(item.sourceUrl) ? item.sourceUrl : undefined} target="_blank" rel="noreferrer">打开来源 ↗</a>}
          {item.sourceNotice && <p>{item.sourceNotice}</p>}
          {item.sourceUrl && <p className="inspiration-original">{item.sourceText}</p>}
        </details>
        <div className="inspiration-saved-actions">
          <button disabled={busy} aria-pressed={item.enabled} onClick={() => void change(item)}>{item.enabled ? '暂不推荐' : '恢复推荐'}</button>
          <button disabled={busy} onClick={() => setRemoving(item.id)}>移出收藏</button>
        </div>
        {removing === item.id && <div className="inspiration-remove" role="group" aria-label="确认移出收藏"><p>要移出这条灵感吗？</p><button disabled={busy} onClick={() => void change(item, true)}>确认移出</button><button onClick={() => setRemoving(null)}>留下它</button></div>}
      </article>)}
    </section>
  </div>;
}
