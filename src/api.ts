import type { SSEEvent } from './types';

const API_BASE = '/api';

type EventCallback = (event: SSEEvent) => void;

export async function createSession(clientId: string, signal?: AbortSignal): Promise<{ sessionId: string; clientId: string }> {
  const res = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();
  return { sessionId: data.sessionId, clientId: data.clientId || clientId };
}

export interface GeoPoint {
  lat: number;
  lon: number;
  accuracy?: number;
}

export interface SendMessageOptions {
  sessionId: string;
  type: 'text' | 'select_activity' | 'submit_check' | 'submit_text' | 'abandon';
  text?: string;
  activityId?: string;
  /** 玩家定位坐标（授权后才有），随每条消息上行，后端解析城市/天气并默认注入上下文 */
  geo?: GeoPoint;
  onEvent: EventCallback;
  signal?: AbortSignal;
}

async function consumeSSE(res: Response, onEvent: EventCallback, signal?: AbortSignal): Promise<void> {
  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const abortHandler = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abortHandler);

  const processBuffer = () => {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(trimmed.slice(6));
        onEvent(event);
      } catch {
        // ignore parse errors
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
      if (done) {
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(trimmed.slice(6));
              onEvent(event);
            } catch {
              // ignore
            }
          }
        }
        break;
      }
      if (signal?.aborted) break;
    }
  } finally {
    signal?.removeEventListener('abort', abortHandler);
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

export async function sendMessage(opts: SendMessageOptions): Promise<void> {
  const { sessionId, type, text, activityId, geo, onEvent, signal } = opts;

  const body: Record<string, unknown> = { type };
  if (text !== undefined) body.text = text;
  if (activityId !== undefined) body.activityId = activityId;
  if (geo) body.geo = geo;

  const res = await fetch(`${API_BASE}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  await consumeSSE(res, onEvent, signal);
}

export async function sendPhoto(
  sessionId: string,
  file: File,
  description: string,
  onEvent: EventCallback,
  signal?: AbortSignal,
  geo?: GeoPoint,
): Promise<void> {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('description', description);
  if (geo) formData.append('geo', JSON.stringify(geo));

  const res = await fetch(`${API_BASE}/session/${sessionId}/photo`, {
    method: 'POST',
    body: formData,
    signal,
  });

  await consumeSSE(res, onEvent, signal);
}
