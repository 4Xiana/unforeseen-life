import { randomUUID } from 'crypto';
import type { TraceEvent, TraceEventType, SessionTrace, SessionSummary } from './types.js';

const MAX_SESSIONS = 50;

type LiveListener = (event: TraceEvent) => void;

class TracerStore {
  private sessions: Map<string, SessionTrace> = new Map();
  private sessionOrder: string[] = [];
  private liveListeners: Set<LiveListener> = new Set();

  createSession(sessionId: string): void {
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessionOrder.shift();
      if (oldest) this.sessions.delete(oldest);
    }
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      createdAt: now,
      updatedAt: now,
      events: [],
      finalState: 'S0',
      hasError: false,
    });
    this.sessionOrder.push(sessionId);
  }

  record(sessionId: string, type: TraceEventType, data: Record<string, unknown> = {}): TraceEvent | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const event: TraceEvent = {
      id: randomUUID(),
      sessionId,
      type,
      timestamp: Date.now(),
      data,
    };
    session.events.push(event);
    session.updatedAt = event.timestamp;
    if (type === 'state_transition' && typeof data.to === 'string') {
      session.finalState = data.to;
    }
    if (type === 'error') {
      session.hasError = true;
    }
    this.broadcast(event);
    return event;
  }

  getSession(sessionId: string): SessionTrace | null {
    return this.sessions.get(sessionId) || null;
  }

  listSessions(): SessionSummary[] {
    return [...this.sessionOrder].reverse().map(id => {
      const s = this.sessions.get(id)!;
      const llmCalls = s.events.filter(e => e.type === 'llm_call_end').length;
      const toolCalls = s.events.filter(e => e.type === 'tool_call').length;
      const userInputs = s.events.filter(e => e.type === 'user_input').length;
      return {
        sessionId: s.sessionId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        eventCount: s.events.length,
        finalState: s.finalState,
        durationMs: s.updatedAt - s.createdAt,
        hasError: s.hasError,
        userInputs,
        llmCalls,
        toolCalls,
      };
    });
  }

  subscribe(listener: LiveListener): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  private broadcast(event: TraceEvent): void {
    for (const l of this.liveListeners) {
      try { l(event); } catch { /* ignore listener errors */ }
    }
  }
}

export const tracerStore = new TracerStore();

export class SessionTracer {
  readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    tracerStore.createSession(sessionId);
    this.log('session_created', {});
  }

  log(type: TraceEventType, data: Record<string, unknown> = {}): TraceEvent | null {
    return tracerStore.record(this.sessionId, type, data);
  }

  wrapEmit(emit: (event: Record<string, unknown>) => void): (event: Record<string, unknown>) => void {
    return (event: Record<string, unknown>) => {
      this.log('sse_emit', { eventType: event.type, payload: this.sanitize(event) });
      emit(event);
    };
  }

  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (typeof value === 'string' && value.length > 500) {
        return value.slice(0, 500) + `...[truncated ${value.length - 500} chars]`;
      }
      return value;
    }));
  }
}

export function getSessionTrace(sessionId: string): SessionTrace | null {
  return tracerStore.getSession(sessionId);
}

export function listSessionTraces(): SessionSummary[] {
  return tracerStore.listSessions();
}

export function subscribeTraces(listener: LiveListener): () => void {
  return tracerStore.subscribe(listener);
}
