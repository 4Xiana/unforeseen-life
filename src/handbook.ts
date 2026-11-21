import type { HandbookView } from './types';
import { API_BASE } from './paths';

const CLIENT_ID_KEY = 'xian.clientId';
let volatileClientId: string | undefined;

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 稳定的设备/玩家 id：首次访问生成，存 localStorage，之后复用 */
export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return volatileClientId ??= uuid();
  }
}

export function saveClientId(id: string) {
  volatileClientId = id;
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

export { CATEGORY_META, CATEGORY_ORDER } from './category-meta';
export type { CategoryMeta } from './category-meta';

export async function fetchHandbook(clientId: string): Promise<HandbookView | null> {
  try {
    const res = await fetch(`${API_BASE}/handbook?clientId=${encodeURIComponent(clientId)}`);
    if (!res.ok) return null;
    return (await res.json()) as HandbookView;
  } catch {
    return null;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  return `${mo}月${da}日`;
}
