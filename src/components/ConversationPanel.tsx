import { useEffect, useRef, type ReactNode } from 'react';
import type { FSMState, TimelineItem } from '../types';
import { ChatMessage } from './ChatMessage';
import { ActivityCards } from './ActivityCards';
import { DockSkeleton } from './DockSkeleton';
import { VoiceButton, VoiceStatus } from './VoiceButton';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { appUrl } from '../paths';

interface Props {
  timeline: TimelineItem[];
  fsmState: FSMState;
  streaming: boolean;
  thinking: boolean;
  stepping: string | null;
  skeleton: 'activities' | 'step' | null;
  disabled: boolean;
  connecting: boolean;
  error: string | null;
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onHome: () => void;
  onLibrary: () => void;
  onNew: () => void;
  onImmersive: () => void;
  taskTitle?: string;
  onReturnToTask?: () => void;
  locationLabel?: string | null;
}
const npcKind = (kind?: string) => kind === 'npc' || kind === 'step' || kind === 'activities';
function Envelope({ children, header }: { children: ReactNode; header: boolean }) {
  return <div className="conversation-cards npc-envelope"><div className="conversation-avatar">{header && <img src={appUrl('agent_avatar.png')} alt="吱呀" width={32} height={32} />}</div><div className="conversation-card-content">{header && <p className="font-hand text-fog mb-2">吱呀</p>}{children}</div></div>;
}

/** Before a selection this is the main surface; during a task it is an auxiliary conversation. */
export function ConversationPanel(props: Props) {
  const { timeline, fsmState, streaming, thinking, stepping, skeleton, disabled, connecting, error, value, onChange, onSend, onSelect, taskTitle, onReturnToTask } = props;
  const voice = useSpeechInput(value, onChange);
  const scroll = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const root = useRef<HTMLElement>(null);
  let lastActivities = -1;
  timeline.forEach((item, i) => { if (item.kind === 'activities') lastActivities = i; });
  useEffect(() => {
    if (stickToBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'auto' });
  }, [timeline, thinking, stepping, skeleton]);
  useEffect(() => {
    if (!onReturnToTask) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('.conversation-return')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [onReturnToTask]);
  function send(text = value) {
    if (disabled || !text.trim()) return;
    voice.reset(); stickToBottom.current = true; onSend(text.trim()); onChange('');
  }
  return <section ref={root} className={`conversation-panel ${onReturnToTask ? 'is-assistance' : ''}`} aria-label={onReturnToTask ? '和吱呀聊聊' : '与吱呀挑选支线'} role={onReturnToTask ? 'dialog' : undefined} aria-modal={onReturnToTask ? true : undefined} onKeyDown={e => {
    if (!onReturnToTask) return;
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); onReturnToTask(); }
    if (e.key !== 'Tab') return;
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]') || [])].filter(el => el.getClientRects().length && el.tabIndex >= 0);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <header className="conversation-header">
      {onReturnToTask ? <><div><p className="session-eyebrow">吱呀在这里</p><h2>和吱呀聊聊</h2></div><button className="conversation-return session-secondary" onClick={onReturnToTask}>回到任务</button></> : <>
        <button className="session-icon" aria-label="返回首页" onClick={() => { voice.cancel(); props.onHome(); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m3 11 9-8 9 8v10H4V11m5 10v-7h6v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></button>
        <div className="conversation-brand"><h1>支线任务</h1><p>{props.locationLabel || '和吱呀聊聊，找到想做的小事'}</p></div>
        <nav aria-label="支线工具"><button className="session-icon" aria-label="我的手册" title="我的手册" onClick={props.onLibrary}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5C9 3 5 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v16" stroke="currentColor" strokeWidth="1.5" /></svg></button><button className="session-icon" aria-label="新一轮" disabled={disabled} onClick={props.onNew}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button><button className="session-icon" aria-label="沉浸" title="沉浸通话模式：语音对话 + 字幕" onClick={() => { voice.cancel(); props.onImmersive(); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 13V9a8 8 0 0 1 16 0v4M4 11h3v9H3v-9Zm13 0h4v9h-4v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></button></nav>
      </>}
    </header>
    {onReturnToTask && <p className="conversation-context">正在做：{taskTitle || '当前支线'}<span>可以问做法、调整要求，任务和未提交的内容会保留。</span></p>}
    {error && <div className="session-error" role="alert"><p>{error}</p><button onClick={props.onRetry} disabled={streaming}>重新连接</button></div>}
    <div className="conversation-scroll" id="message-scroll-area" ref={scroll} onScroll={() => { const node = scroll.current; if (node) stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100; }}>
      <div className="conversation-messages">
        {connecting ? <p className="session-loading" role="status">吱呀正在赶来…</p> : timeline.map((item, idx) => {
          const header = idx === 0 || !npcKind(timeline[idx - 1]?.kind);
          if (item.kind === 'activities') {
            const active = idx === lastActivities && fsmState === 'S1' && !onReturnToTask;
            return <Envelope key={item.id} header={header}><ActivityCards activities={item.activities} onSelect={onSelect} disabled={active && disabled} locked={!active} />{active && !streaming && <button className="conversation-refresh session-secondary" onClick={() => send('换一批')}>换一批</button>}</Envelope>;
          }
          if (item.kind === 'step') return <div className="conversation-step-receipt" key={item.id}><span>支线步骤 · {item.step.index + 1}/{item.total}</span><p>{item.step.instruction}</p>{onReturnToTask && <button onClick={onReturnToTask}>在任务页继续 →</button>}</div>;
          const live = idx === timeline.length - 1 && item.kind === 'npc' && !skeleton;
          if (!item.content.trim() && !live) return null;
          return <ChatMessage key={item.id} message={{ ...item, role: item.kind }} showHeader={header} isStreaming={streaming && live} isThinking={thinking && live} steppingText={live ? stepping : null} />;
        })}
        {skeleton && !onReturnToTask && <Envelope header={!npcKind(timeline[timeline.length - 1]?.kind)}><DockSkeleton type={skeleton} /></Envelope>}
        {streaming && timeline[timeline.length - 1]?.kind !== 'npc' && !skeleton && <p role="status" className="session-loading">吱呀正在想…</p>}
      </div>
    </div>
    <form className="conversation-composer" onSubmit={e => { e.preventDefault(); send(); }}>
      {fsmState === 'S0' && !streaming && !onReturnToTask && <button type="button" className="conversation-quick-start session-secondary" onClick={() => send('想探索点有趣的事，先推荐一条15分钟能做的支线吧')}>没想好？先发现一条支线</button>}
      <div className="conversation-input"><input aria-label="和吱呀说说你的想法" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }} disabled={disabled} placeholder={voice.listening ? '正在聆听…' : onReturnToTask ? '遇到什么问题，和吱呀说说…' : fsmState === 'S1' ? '选一个，或者说说你的想法…' : '聊聊想探索什么，也可以说说你在哪儿…'} />{voice.supported && <VoiceButton listening={voice.listening} phase={voice.phase} error={voice.error} onToggle={voice.toggle} disabled={disabled} />}<button type="submit" className="conversation-send" disabled={disabled || !value.trim()} aria-label="发送消息"><svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden><path d="m3 10 14-7-5 14-3-6-6-1Zm6 1 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></button></div>
      <VoiceStatus phase={voice.phase} error={voice.error} />
      <p className="conversation-caption">{onReturnToTask ? '这里聊想法，作品请回任务页提交。' : '先聊聊，再选一件想做的小事。'}</p>
    </form>
  </section>;
}
