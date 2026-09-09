export type FSMState = 'S0' | 'S1' | 'S2' | 'S3';

/** 支线五大类：探索 / 整理 / 创造 / 连接 / 感官（用于手账集印分类） */
export type QuestCategory = 'explore' | 'organize' | 'create' | 'connect' | 'sense';

export interface ActivityStep {
  instruction: string;
  hint?: string;
  submissionType: 'check' | 'text' | 'photo';
  completionCriteria: string;
  proofPrompt?: string;
}

export interface ActivityPlan {
  id: string;
  title: string;
  hook: string;
  tags: string[];
  category: QuestCategory;
  /**
   * 活动步骤。S1 出卡时不需要（卡片只展示标题/悬念/标签），
   * 玩家选中后、S2 首次发步前由 design_activity_steps 为"被选中的那一条"延迟设计，
   * 避免为永远不会被选中的候选活动浪费生成。
   */
  steps?: ActivityStep[];
}

export interface CollectedInfo {
  freeTime?: string;
  scene?: string;
  peopleCount?: number;
  budget?: string;
  energyLevel?: string;
  preferences?: string;
  companion?: string;
  mood?: string;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface WorkingMemorySnapshot {
  fsmState: FSMState;
  collectedInfo: CollectedInfo;
  proposedActivities: ActivityPlan[];
  selectedActivity: ActivityPlan | null;
  currentStepIndex: number;
  currentTime: string;
  transcript: TranscriptEntry[];
}
