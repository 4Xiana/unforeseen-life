import { API_BASE } from './paths';
import { getClientId } from './handbook';
import type { QuestThread, ThreadInput } from '../server/quest-thread-types';
export type { QuestThread, ThreadInput } from '../server/quest-thread-types';

async function request<T>(path: string, method = 'GET', body?: ThreadInput): Promise<T> {
  const response = await fetch(`${API_BASE}/quest-threads${path}`, {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '暂时无法保存，请重试');
  return data;
}
export const listThreads = () => request<QuestThread[]>('');
export const saveThread = (input: ThreadInput, id?: string) => request<QuestThread>(id ? `/${encodeURIComponent(id)}` : '', id ? 'PUT' : 'POST', input);
export const removeThread = (id: string) => request<{ ok: true }>(`/${encodeURIComponent(id)}`, 'DELETE');
