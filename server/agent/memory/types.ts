export type FSMState = 'S0' | 'S1' | 'S2' | 'S3';

/** 支线五大类：探索 / 整理 / 创造 / 连接 / 感官（用于手账集印分类） */
export type QuestCategory = 'explore' | 'organize' | 'create' | 'connect' | 'sense';

export interface ActivityStep {
  instruction: string;
  hint?: string;
  submissionType: 'text' | 'photo';
  completionCriteria: string;
  proofPrompt?: string;
  /**
   * 这一步的建议节奏（秒），由 design_activity_steps 时按玩家空闲时长校正后写入。
   * undefined 视作不计时。
   * 这是给玩家的宽松参考，不是截止时间——超时绝不影响验收。
   */
  suggestedSeconds?: number;
  /**
   * 玩家为这一步提交的证物（验收通过后写入）。用于记录页持久化展示。
   * text 步：type='text', text=提交的文字；photo 步：type='photo', text=图说答案, photoUrl=可访问 URL。
   */
  submittedEvidence?: {
    type: 'text' | 'photo';
    text?: string;
    photoUrl?: string;
    at: string;
  };
}

export interface ActivityPlan {
  inspiration?: import('../../inspiration-types.js').InspirationTask & { sourceUrl?: string };
  journey?: import('../../goals-types.js').Journey;
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
  requestedGoalId?: string;
  fsmState: FSMState;
  collectedInfo: CollectedInfo;
  proposedActivities: ActivityPlan[];
  selectedActivity: ActivityPlan | null;
  currentStepIndex: number;
  currentTime: string;
  transcript: TranscriptEntry[];
}
