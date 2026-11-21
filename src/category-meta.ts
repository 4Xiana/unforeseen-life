import type { QuestCategory } from './types';

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

