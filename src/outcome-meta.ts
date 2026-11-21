import type { DesiredOutcome, QuestCategory, QuestRecord } from './types';

/** Why a person explores, kept separate from the activity's internal play category. */
export const OUTCOME_ORDER: DesiredOutcome[] = ['relax', 'surprise', 'express', 'connect', 'grow'];
export const OUTCOME_META: Record<DesiredOutcome, { label: string; color: string; description: string }> = {
  relax: { label: '放松', color: '#729451', description: '让节奏慢一点，给自己留一小段松弛。' },
  surprise: { label: '惊喜', color: '#D28A28', description: '试试没做过的事，遇见日常里的新鲜感。' },
  express: { label: '表达', color: '#D46659', description: '把心里的想法，变成自己的小作品。' },
  connect: { label: '连接', color: '#3F9989', description: '和身边的人、值得珍惜的记忆靠近一点。' },
  grow: { label: '成长', color: '#8173BE', description: '练会一个小本领，朝想成为的自己走近一点。' },
};
const fallback: Record<QuestCategory, DesiredOutcome> = {
  organize: 'relax', explore: 'surprise', create: 'express', connect: 'connect', sense: 'relax',
};
const tagOutcomes: Record<string, DesiredOutcome> = {
  放松: 'relax', 惊喜: 'surprise', 表达: 'express', 连接: 'connect', 成长: 'grow',
  学习: 'grow', 练习: 'grow', 技能: 'grow', 学会: 'grow',
};

/** Explicit outcomes win. Legacy records fall back to exact tags, then play category.
 * These are display groupings, never conclusions about a person's motivation. */
export function recordOutcomes(record: QuestRecord & { desiredOutcomes?: unknown }): DesiredOutcome[] {
  const explicit = Array.isArray(record.desiredOutcomes) ? record.desiredOutcomes : [];
  const outcomes = [...new Set(explicit.filter((value): value is DesiredOutcome => OUTCOME_ORDER.includes(value as DesiredOutcome)))];
  if (outcomes.length) return outcomes;
  const tagged = [...new Set(record.tags.flatMap(tag => tagOutcomes[tag] ? [tagOutcomes[tag]] : []))];
  return tagged.length ? tagged : [fallback[record.category]];
}
export const primaryOutcome = (record: QuestRecord & { desiredOutcomes?: unknown }) => recordOutcomes(record)[0];
