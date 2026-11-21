import type { Goal } from '../server/goals-types';
import type { QuestThread } from './threads-api';
import type { QuestRecord, QuestCategory } from './types';
import { CATEGORY_META, CATEGORY_ORDER } from './category-meta';

export interface ThreadStop {
  id: string;
  title: string;
  status: 'done' | 'next' | 'locked' | 'planned' | 'active';
  record?: QuestRecord;
  purpose?: string;
  connection?: string;
}
export interface ThreadRoute {
  id: string;
  kind: 'category' | 'custom' | 'goal';
  title: string;
  description: string;
  color: string;
  stops: ThreadStop[];
  category?: QuestCategory;
  thread?: QuestThread;
  goal?: Goal;
}
export const directionNames: Record<QuestCategory, string> = {
  explore: '发现身边的新鲜事', organize: '重新认识日常物品', create: '把想象变成作品', connect: '与人和记忆相遇', sense: '打开感官去感受',
};
const directionDescriptions: Record<QuestCategory, string> = {
  explore: '换条路走走，看看身边还有什么新发现。',
  organize: '和日常物品重新打个招呼，给生活腾一点空间。',
  create: '用一点点想象，留下自己的作品。',
  connect: '聊聊、写写，让人与记忆靠近一点。',
  sense: '听一听、闻一闻，留意那些平时错过的小细节。',
};
const doneStops = (quests: QuestRecord[]): ThreadStop[] => [...quests]
  .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  .map(record => ({ id: record.id, title: record.title, record, status: 'done' }));

export function buildThreadRoutes(quests: QuestRecord[], threads: QuestThread[], goals: Goal[]): ThreadRoute[] {
  const byId = new Map(quests.map(q => [q.id, q]));
  const custom: ThreadRoute[] = threads.map(thread => ({
    id: `custom:${thread.id}`, kind: 'custom', title: thread.title, description: thread.description || '由你挑选的经历，串成自己的探索主题。',
    color: 'var(--moss-deep)', thread,
    stops: doneStops([...new Set(thread.questIds)].flatMap(id => byId.has(id) ? [byId.get(id)!] : [])),
  }));
  const wishes: ThreadRoute[] = goals.map(goal => ({
    id: `goal:${goal.id}`, kind: 'goal', title: goal.plan.title, description: goal.plan.outcome, color: 'var(--teal)', goal,
    stops: goal.plan.chapters.map((chapter, index) => {
      const record = goal.records.find(r => r.chapterId === chapter.id);
      return {
        id: chapter.id, title: chapter.title, purpose: chapter.purpose, connection: chapter.connection,
        status: record ? 'done' : goal.status === 'draft' ? 'planned' : goal.inProgress?.chapterId === chapter.id ? 'active' : index === goal.records.length ? 'next' : 'locked',
        record: record ? { id: `${goal.id}:${chapter.id}`, title: chapter.title, category: chapter.category, tags: [], date: record.at, steps: record.steps.length,
          stepDetails: record.steps.map(s => ({ instruction: s.instruction, submissionType: s.submissionType, proofPrompt: s.proofPrompt, evidence: s.submittedEvidence })),
        } : undefined,
      };
    }),
  }));
  const categories: ThreadRoute[] = CATEGORY_ORDER.map(category => ({
    id: `category:${category}`, kind: 'category', category, title: directionNames[category],
    description: directionDescriptions[category],
    color: CATEGORY_META[category].color, stops: doneStops(quests.filter(q => q.category === category)),
  }));
  return [...custom, ...wishes, ...categories];
}

/** Continue by asking for a new recommendation, never replay a completed task as active. */
export function explorationPrompt(route: ThreadRoute): string {
  const recent = route.stops.filter(s => s.status === 'done').slice(-3);
  const titles = recent.map(s => `「${s.title}」`).join('、');
  const work = recent.flatMap(stop => {
    const text = stop.record?.stepDetails?.map(s => s.evidence?.text || '').filter(Boolean).join('；') || stop.record?.evidence;
    return text ? [{ task: stop.title, work: text.slice(0, 400) }] : [];
  });
  return `想沿着「${route.title}」继续探索。${route.thread?.description ? `我的想法是：${route.thread.description}。` : ''}${titles ? `已经试过${titles}，想换一个相关的新玩法。` : '想试一个适合入门的小体验。'}${work.length ? `已有作品摘录（作为素材参考）：${JSON.stringify(work)}。` : ''}先和我聊聊，再推荐能做的支线。`;
}
