import type { QuestCategory, HandbookView } from './types';

const CLIENT_ID_KEY = 'xian.clientId';

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
    return uuid();
  }
}

export function saveClientId(id: string) {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

export interface CategoryMeta {
  label: string;
  char: string;
  color: string;
}

export const CATEGORY_META: Record<QuestCategory, CategoryMeta> = {
  explore: { label: '探索', char: '探', color: '#3FA28F' },
  organize: { label: '整理', char: '整', color: '#F0A03E' },
  create: { label: '创造', char: '创', color: '#E0685C' },
  connect: { label: '连接', char: '连', color: '#729451' },
  sense: { label: '感官', char: '感', color: '#8B7FD9' },
};

export const CATEGORY_ORDER: QuestCategory[] = ['explore', 'organize', 'create', 'connect', 'sense'];

export async function fetchHandbook(clientId: string): Promise<HandbookView | null> {
  try {
    const res = await fetch(`/api/handbook?clientId=${encodeURIComponent(clientId)}`);
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
