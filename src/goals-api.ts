import type { Goal, GoalInput } from '../server/goals-types';
import { API_BASE } from './paths';
import { getClientId } from './handbook';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/goals${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '暂时无法连接，请重试');
  if (body) window.dispatchEvent(new Event('xian-goals-changed'));
  return data;
}
export const listGoals = () => request<Goal[]>('');
export const getGoal = (id: string) => request<Goal>(`/${encodeURIComponent(id)}`);
export const createGoalDraft = (input: GoalInput | { example: true }, draftId?: string) => request<Goal>(draftId ? `/${encodeURIComponent(draftId)}/draft` : '', input);
export const changeGoalStatus = (id: string, action: 'confirm' | 'pause' | 'resume') => request<Goal>(`/${encodeURIComponent(id)}/status`, { action });
