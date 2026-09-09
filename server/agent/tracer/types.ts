export type TraceEventType =
  | 'session_created'
  | 'user_input'
  | 'state_transition'
  | 'llm_call_start'
  | 'llm_call_end'
  | 'tool_call'
  | 'sse_emit'
  | 'error'
  | 'info';

export interface TraceEvent {
  id: string;
  sessionId: string;
  type: TraceEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface SessionSummary {
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

export interface SessionTrace {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  events: TraceEvent[];
  finalState: string;
  hasError: boolean;
}
