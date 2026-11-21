import type { ActivityStep, QuestCategory } from './agent/memory/types.js';

export type GoalScene = 'any' | 'home' | 'outdoors' | 'work';
export interface GoalInput {
  wish: string;
  motivation: string;
  preferences: string;
  avoid: string;
  minutes: number;
  scene: GoalScene;
}
export const exampleInput: GoalInput = {
  wish: '做一本自己的日常声音小册', motivation: '在熟悉的生活里，重新找回观察力',
  preferences: '安静、文字、小小的发现', avoid: '不录下他人的私密谈话', minutes: 10, scene: 'any',
};
export interface GoalChapter {
  id: string;
  title: string;
  purpose: string;
  connection: string;
  outcome: string;
  minutes: number;
  scene: GoalScene;
  category: QuestCategory;
  steps: ActivityStep[];
}
export interface GoalPlan {
  title: string;
  outcome: string;
  chapters: GoalChapter[];
}
export interface Journey {
  goalId: string;
  chapterId: string;
  title: string;
  ordinal: number;
  total: number;
  purpose: string;
  previous: string;
}
export interface GoalRecord {
  chapterId: string;
  sessionId: string;
  at: string;
  steps: ActivityStep[];
}
export interface GoalReward {
  id: string;
  name: string;
  description: string;
  at: string;
}
export interface Goal {
  id: string;
  input: GoalInput;
  plan: GoalPlan;
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: string;
  records: GoalRecord[];
  rewards: GoalReward[];
  offeredAt?: number;
  inProgress?: { chapterId: string; sessionId: string };
}
