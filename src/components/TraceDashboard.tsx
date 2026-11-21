import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../paths';

type TraceEventType =
  | 'session_created'
  | 'user_input'
  | 'state_transition'
  | 'llm_call_start'
  | 'llm_call_end'
  | 'tool_call'
  | 'sse_emit'
  | 'error'
  | 'info';

interface TraceEvent {
  id: string;
  sessionId: string;
  type: TraceEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

interface SessionSummary {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  eventCount: number;
  finalState: string;
  durationMs: number;
  hasError: boolean;
  userInputs: number;
  llmCalls: number;
  toolCalls: number;
}

interface SessionTrace {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  events: TraceEvent[];
  finalState: string;
  hasError: boolean;
}

const EVENT_META: Record<TraceEventType, { label: string; color: string; icon: string }> = {
  session_created: { label: '会话创建', color: 'blue', icon: '◉' },
  user_input: { label: '用户输入', color: 'blue', icon: '▸' },
  state_transition: { label: '状态流转', color: 'orange', icon: '⇢' },
  llm_call_start: { label: 'LLM 调用', color: 'blue', icon: '⚡' },
  llm_call_end: { label: 'LLM 完成', color: 'blue', icon: '✓' },
  tool_call: { label: '工具调用', color: 'coral', icon: '🔧' },
  sse_emit: { label: 'SSE 推送', color: 'fog', icon: '◌' },
  error: { label: '错误', color: 'coral', icon: '✕' },
  info: { label: '信息', color: 'fog', icon: '·' },
};

const colorToClass: Record<string, string> = {
  blue: 'text-blue border-blue/30 bg-blue/10',
  orange: 'text-orange border-orange/30 bg-orange/10',
  moss: 'text-moss border-moss/30 bg-moss/10',
  coral: 'text-coral border-coral/30 bg-coral/10',
  fog: 'text-fog border-fog-light/50 bg-fog-light/20',
};

const colorToDot: Record<string, string> = {
  blue: 'bg-blue',
  orange: 'bg-orange',
  moss: 'bg-moss',
  coral: 'bg-coral',
  fog: 'bg-fog',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function truncateId(id: string): string {
  return id.slice(0, 8);
}

function DataBlock({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(data);
  const preview = entries.slice(0, 3).map(([k, v]) => {
    const sv = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : JSON.stringify(v);
    return `${k}: ${sv}`;
  }).join(', ');

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[11px] font-mono text-fog hover:text-ink transition-colors flex items-center gap-1"
      >
        <span className="inline-block w-3 text-center">{expanded ? '▾' : '▸'}</span>
        <span className="min-w-0 truncate max-w-[280px]">{preview || '(empty)'}</span>
      </button>
      {expanded && (
        <pre className="mt-1 ml-4 p-2 bg-paper-3/50 border border-paper-edge rounded-sm text-[10px] font-mono text-ink-2 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function CodeBlock({ label, text, accent }: { label: string; text: string; accent?: string }) {
  const [copied, setCopied] = useState(false);
  const trimmed = (text || '').trim();
  const borderColor = accent === 'blue' ? 'border-blue/40' : accent === 'moss' ? 'border-moss/40' : 'border-paper-edge';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return (
    <div className={`mt-1.5 border ${borderColor} rounded-sm bg-paper-3/40`}>
      <div className="flex items-center justify-between px-2 py-1 border-b border-paper-edge/60">
        <span className="text-[10px] font-mono font-bold text-fog tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-fog/60">{trimmed.length} 字</span>
          <button
            onClick={copy}
            className="text-[10px] font-mono text-fog hover:text-ink transition-colors"
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
        </div>
      </div>
      <pre className="p-2 text-[10.5px] font-mono text-ink-2 overflow-auto max-h-[420px] whitespace-pre-wrap break-words leading-relaxed">
        {trimmed || '(空)'}
      </pre>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 border border-paper-edge rounded-sm bg-paper-3/50 text-fog">
      <span className="text-fog/60">{label}</span>
      <span className="text-ink font-bold">{value}</span>
    </span>
  );
}

interface TraceMessage {
  role: string;
  chars: number;
  content: string;
  truncated?: boolean;
}

interface TraceLayer {
  name: string;
  chars: number;
  state?: string;
}

function MessagesBlock({ messages }: { messages: TraceMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalChars = messages.reduce((s, m) => s + (m.chars || 0), 0);
  return (
    <div className="mt-1.5 border border-paper-edge rounded-sm bg-paper-3/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1 border-b border-paper-edge/60"
      >
        <span className="text-[10px] font-mono font-bold text-fog tracking-wide">
          MESSAGES（对话历史 · runner.run 输入消息数组 · {messages.length} 条 · {totalChars} 字）
        </span>
        <span className="text-[10px] font-mono text-fog">{expanded ? '收起 ▾' : '展开 ▸'}</span>
      </button>
      {expanded && (
        <div className="p-2 space-y-2 max-h-[460px] overflow-y-auto">
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={i}
                className={`border-l-2 pl-2 py-0.5 ${isUser ? 'border-blue/50' : 'border-moss/50'}`}
              >
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className={isUser ? 'text-blue font-bold' : 'text-moss font-bold'}>
                    {isUser ? 'USER' : 'ASSISTANT'}
                  </span>
                  <span className="text-fog/50">
                    #{i} · {m.chars}字{m.truncated ? ' · 已截断' : ''}
                  </span>
                </div>
                <pre className="mt-0.5 text-[10.5px] font-mono text-ink-2 whitespace-pre-wrap break-words leading-relaxed">
                  {m.content || '(空)'}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContextLayersBlock({ layers }: { layers: Record<string, TraceLayer> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-mono text-fog/60">context 分层装载:</span>
      {Object.entries(layers).map(([key, l]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 border rounded-sm border-paper-edge bg-paper-3/50 text-fog"
          title={l.name}
        >
          {key}
          {l.state ? `[${l.state}]` : ''}
          <span className="font-bold">{l.chars}字</span>
        </span>
      ))}
    </div>
  );
}

function LLMStartBlock({ data }: { data: Record<string, unknown> }) {
  const label = String(data.label || 'llm');
  const toolNames = (data.toolNames as string[]) || [];
  const layers = data.contextLayers as Record<string, TraceLayer> | null;
  const messages = (data.messages as TraceMessage[] | undefined) || [];
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetricChip label="调用" value={label} />
        <MetricChip label="maxTurns" value={String(data.maxTurns ?? '-')} />
        <MetricChip label="tools" value={String(toolNames.length)} />
        <MetricChip label="prompt" value={`${data.instructionsLen ?? 0}字`} />
        <MetricChip label="messages" value={`${data.messageCount ?? 0}条/${data.messagesChars ?? 0}字`} />
      </div>
      {layers && <ContextLayersBlock layers={layers} />}
      {toolNames.length > 0 && (
        <div className="text-[10px] font-mono text-fog/70">tools: {toolNames.join(', ')}</div>
      )}
      {Array.isArray(data.stopAtToolNames) && (data.stopAtToolNames as string[]).length > 0 && (
        <div className="text-[10px] font-mono text-orange/80">stopAfter: {(data.stopAtToolNames as string[]).join(', ')}</div>
      )}
      {messages.length > 0 && <MessagesBlock messages={messages} />}
      <CodeBlock label="USER MESSAGE（本轮用户消息）" text={String(data.userMessage || '')} />
      <CodeBlock label="SYSTEM INSTRUCTIONS（固定装载 = core + snapshot；阶段行动手册 playbook-sN 与专业技能均由 get_skill 工具按需返回，见 MESSAGES 中的工具结果）" text={String(data.instructions || '')} accent="blue" />
    </div>
  );
}

function LLMEndBlock({ data }: { data: Record<string, unknown> }) {
  const label = String(data.label || 'llm');
  const success = data.success !== false;
  const finalOutput = String(data.finalOutput || '');
  const visibleOutput = String(data.visibleOutput || '');
  const showVisible = !success || (visibleOutput.trim() && visibleOutput.trim() !== finalOutput.trim());
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetricChip label="调用" value={label} />
        <MetricChip label="结果" value={success ? '✓ 成功' : '✕ 失败'} />
        {data.totalMs !== undefined && <MetricChip label="耗时" value={`${data.totalMs}ms`} />}
        {data.ttfbMs ? <MetricChip label="TTFB" value={`${data.ttfbMs}ms`} /> : null}
        {data.firstVisibleTextMs ? <MetricChip label="首字" value={`${data.firstVisibleTextMs}ms`} /> : null}
        {data.thinkChars ? <MetricChip label="think" value={`${data.thinkChars}字`} /> : null}
        {data.toolCalls !== undefined && data.toolCalls !== 0 ? <MetricChip label="工具" value={String(data.toolCalls)} /> : null}
        {data.turns !== undefined && data.turns !== 0 ? <MetricChip label="turns" value={String(data.turns)} /> : null}
      </div>
      {!success && data.errorMessage ? (
        <div className="text-[10.5px] font-mono text-coral border border-coral/40 bg-coral/10 rounded-lg p-2 whitespace-pre-wrap break-words">
          {String(data.errorMessage)}
        </div>
      ) : null}
      {(data.toolCallNames as string[])?.length > 0 && (
        <div className="text-[10px] font-mono text-fog/70">called: {(data.toolCallNames as string[]).join(' → ')}</div>
      )}
      {success ? (
        <CodeBlock label="RESPONSE（完整 finalOutput）" text={finalOutput} accent="moss" />
      ) : null}
      {showVisible && (
        <CodeBlock label="STREAMED VISIBLE TEXT（中途/流式文本）" text={visibleOutput} />
      )}
    </div>
  );
}

function EventCard({ event, prevTs }: { event: TraceEvent; prevTs: number | null }) {
  const meta = EVENT_META[event.type] || EVENT_META.info;
  const delta = prevTs ? event.timestamp - prevTs : 0;
  const colorClass = colorToClass[meta.color] || colorToClass.fog;
  const dotClass = colorToDot[meta.color] || colorToDot.fog;

  const title = (() => {
    const d = event.data;
    switch (event.type) {
      case 'state_transition': return `${d.from} → ${d.to}（${d.reason}）`;
      case 'user_input': return `${d.inputKind}: ${String(d.text || '').slice(0, 40)}`;
      case 'llm_call_start': return `[调用 ${d.label}] tools=[${(d.toolNames as string[])?.join(',') || 'none'}] maxTurns=${d.maxTurns}`;
      case 'llm_call_end': {
        const dd = d as Record<string, unknown>;
        return `[调用 ${d.label}] ${dd.success ? '✓' : '✕'} 总耗时 ${dd.totalMs}ms` +
          (dd.ttfbMs ? ` | TTFB ${dd.ttfbMs}ms` : '') +
          (dd.firstVisibleTextMs ? ` | 首字 ${dd.firstVisibleTextMs}ms` : '') +
          (dd.thinkChars ? ` | think ${dd.thinkChars}字` : '');
      }
      case 'tool_call': return `${d.toolName}`;
      case 'sse_emit': return `${d.eventType}`;
      case 'error': return `${d.phase}: ${String(d.error || '').slice(0, 80)}`;
      case 'info': {
        const phase = d.phase as string;
        if (phase === 'guard_nudge') return `护栏轻推 #${d.attempt}${d.progressed ? '（状态已推进）' : ''}`;
        if (phase === 'turn_complete') return `回合完成，耗时 ${d.durationMs}ms，最终状态 ${d.finalState}`;
        return phase || '';
      }
      default: return event.type;
    }
  })();

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${dotClass} ring-2 ring-paper z-10 shrink-0 mt-1.5`} />
        <div className="w-px flex-1 bg-fog-light/60 min-h-[8px]" />
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 border rounded-sm ${colorClass}`}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
          <span className="text-[10px] font-mono text-fog">{formatTime(event.timestamp)}</span>
          {delta > 10 && (
            <span className="text-[10px] font-mono text-fog/60">+{delta}ms</span>
          )}
        </div>
        <p className="text-[12px] text-ink font-medium mt-0.5 leading-relaxed break-words">{title}</p>
        {event.type === 'llm_call_start' && <LLMStartBlock data={event.data} />}
        {event.type === 'llm_call_end' && <LLMEndBlock data={event.data} />}
        {event.type !== 'llm_call_start' && event.type !== 'llm_call_end' && Object.keys(event.data).length > 0 && <DataBlock data={event.data} />}
      </div>
    </div>
  );
}

function SessionListItem({
  session,
  isActive,
  isLive,
  onClick,
}: {
  session: SessionSummary;
  isActive: boolean;
  isLive: boolean;
  onClick: () => void;
}) {
  const stateColors: Record<string, string> = {
    S0: 'tag-fog',
    S1: 'tag-orange',
    S2: 'tag-coral',
  };
  const tagClass = stateColors[session.finalState] || 'tag-fog';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-b border-fog-light/40 transition-colors ${
        isActive ? 'bg-paper-3/60 border-l-2 border-l-ink' : 'hover:bg-paper-2/60 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-mono text-[10px] text-fog truncate">{truncateId(session.sessionId)}</span>
        <div className="flex items-center gap-1 shrink-0">
          {isLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse" title="实时"/>
          )}
          {session.hasError && (
            <span className="text-coral text-[10px]">✕</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className={`tag ${tagClass}`}>{session.finalState}</span>
        <span className="text-[10px] font-mono text-fog">{formatDuration(session.durationMs)}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-mono text-fog/70">
        <span>{session.eventCount}事件</span>
        <span>·</span>
        <span>{session.llmCalls}LLM</span>
        <span>·</span>
        <span>{session.toolCalls}工具</span>
      </div>
      <div className="text-[10px] text-fog/50 mt-1 font-mono">
        {new Date(session.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}
      </div>
    </button>
  );
}

export function TraceDashboard({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<SessionTrace | null>(null);
  const [liveEvents, setLiveEvents] = useState<Map<string, TraceEvent[]>>(new Map());
  const [connected, setConnected] = useState(false);
  const liveUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    connectLive();
    return () => {
      liveUnsubscribeRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchTrace(selectedId);
    } else {
      setSelectedTrace(null);
    }
  }, [selectedId]);

  async function fetchSessions() {
    try {
      const res = await fetch(`${API_BASE}/trace/sessions`);
      const data = await res.json();
      setSessions(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].sessionId);
      }
    } catch {
      // ignore
    }
  }

  async function fetchTrace(id: string) {
    try {
      const res = await fetch(`${API_BASE}/trace/session/${id}`);
      if (!res.ok) { setSelectedTrace(null); return; }
      const data = await res.json();
      setSelectedTrace(data);
    } catch {
      setSelectedTrace(null);
    }
  }

  function connectLive() {
    const es = new EventSource(`${API_BASE}/trace/live`);
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      setTimeout(connectLive, 3000);
    };
    es.onmessage = (e) => {
      try {
        const event: TraceEvent = JSON.parse(e.data);
        setLiveEvents(prev => {
          const next = new Map(prev);
          const arr = next.get(event.sessionId) || [];
          arr.push(event);
          if (arr.length > 500) arr.splice(0, arr.length - 500);
          next.set(event.sessionId, arr);
          return next;
        });
      } catch { /* ignore */ }
    };
    liveUnsubscribeRef.current = () => es.close();
  }

  const allEvents = (() => {
    if (!selectedId) return [];
    const base = selectedTrace?.events || [];
    const live = liveEvents.get(selectedId) || [];
    const seen = new Set(base.map(e => e.id));
    const merged = [...base];
    for (const e of live) {
      if (!seen.has(e.id)) merged.push(e);
    }
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  })();

  const llmCalls = allEvents.filter(e => e.type === 'llm_call_end').length;
  const toolCalls = allEvents.filter(e => e.type === 'tool_call').length;
  const errorCount = allEvents.filter(e => e.type === 'error').length;
  const totalDuration = allEvents.length > 0 ? allEvents[allEvents.length - 1].timestamp - allEvents[0].timestamp : 0;

  const isLiveSession = selectedId ? (liveEvents.get(selectedId)?.length ?? 0) > 0 : false;

  return (
    <div className="trace-dashboard h-[100dvh] flex flex-col bg-paper notebook-page overflow-hidden">
      <header className="shrink-0 z-10 border-b border-paper-edge bg-paper-2/80">
        <div className="trace-header px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-coral text-card flex items-center justify-center shadow-paper" style={{ transform: 'rotate(2deg)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 3H14M2 8H14M2 13H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h1 className="font-display text-ink text-lg leading-none">Agent 轨迹追踪</h1>
              <p className="text-[10px] font-mono text-fog tracking-wider mt-0.5">TRACE DASHBOARD</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-moss' : 'bg-coral'}`}/>
              <span className="text-fog">{connected ? 'LIVE' : 'DISCONNECTED'}</span>
            </div>
            <button
              onClick={onClose}
              className="text-[11px] font-medium text-fog hover:text-ink bg-card border border-fog-light/60 hover:border-fog px-3 py-1.5 rounded-full transition-colors"
            >
              返回应用 ↩
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
        <aside className="trace-sessions w-full sm:w-64 shrink-0 border-b sm:border-b-0 sm:border-r border-fog-light/50 bg-paper-2/40 overflow-y-auto">
          <div className="px-3 py-2 border-b border-fog-light/40 sticky top-0 bg-paper-2/90 backdrop-blur z-10">
            <p className="section-label !text-[10px] !mb-0">Sessions ({sessions.length})</p>
          </div>
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-fog text-[12px]">暂无会话记录</div>
          ) : (
            sessions.map(s => (
              <SessionListItem
                key={s.sessionId}
                session={s}
                isActive={s.sessionId === selectedId}
                isLive={(liveEvents.get(s.sessionId)?.length ?? 0) > 0 && s.durationMs < 60000}
                onClick={() => setSelectedId(s.sessionId)}
              />
            ))
          )}
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0 min-h-0">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center text-fog text-[13px]">
              选择一个会话查看轨迹
            </div>
          ) : (
            <div className="p-3 sm:p-5 max-w-3xl mx-auto">
              <div className="index-card mb-5">
                <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] text-fog tracking-wider">SESSION</p>
                    <p className="font-mono text-sm text-ink font-bold mt-0.5 break-all">{selectedId}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isLiveSession && (
                      <span className="stamp-badge text-moss border-moss/60" style={{ transform: 'rotate(0deg)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-moss mr-1 animate-pulse"/>
                        LIVE
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="stamp-badge text-coral border-coral/60" style={{ transform: 'rotate(0deg)' }}>
                        {errorCount} ERRORS
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-[11px] font-mono">
                  <div>
                    <span className="text-fog">事件 </span>
                    <span className="text-ink font-bold">{allEvents.length}</span>
                  </div>
                  <div>
                    <span className="text-fog">LLM调用 </span>
                    <span className="text-blue font-bold">{llmCalls}</span>
                  </div>
                  <div>
                    <span className="text-fog">工具调用 </span>
                    <span className="text-coral font-bold">{toolCalls}</span>
                  </div>
                  <div>
                    <span className="text-fog">总耗时 </span>
                    <span className="text-ink font-bold">{formatDuration(totalDuration)}</span>
                  </div>
                  {allEvents.length > 0 && (
                    <div>
                      <span className="text-fog">开始 </span>
                      <span className="text-ink-2">{formatTime(allEvents[0].timestamp)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="section-label mb-3">
                <span>EVENT TIMELINE</span>
              </div>

              <div className="pl-1">
                {allEvents.length === 0 ? (
                  <div className="text-fog text-[12px] py-8 text-center">等待事件...</div>
                ) : (
                  allEvents.map((event, idx) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      prevTs={idx > 0 ? allEvents[idx - 1].timestamp : null}
                    />
                  ))
                )}
                {isLiveSession && (
                  <div className="flex items-center gap-2 py-3 text-fog text-[11px] font-mono">
                    <span className="typing-dot"/>
                    <span className="typing-dot"/>
                    <span className="typing-dot"/>
                    <span className="ml-1">监听中...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
