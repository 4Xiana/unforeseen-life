export type FSMState = 'S0' | 'S1' | 'S2' | 'S3';

export type SubmissionType = 'check' | 'text' | 'photo';

export type QuestCategory = 'explore' | 'organize' | 'create' | 'connect' | 'sense';

export interface ActivityStep {
  instruction: string;
  hint?: string;
  submissionType: SubmissionType;
  completionCriteria: string;
  proofPrompt?: string;
}

export interface ActivityPlan {
  id: string;
  title: string;
  hook: string;
  tags: string[];
  category: QuestCategory;
  // S1 卡片不带步骤；玩家选中后在 S2 由 design_activity_steps 延迟设计
  steps?: ActivityStep[];
}

export interface PublishedStep {
  index: number;
  instruction: string;
  hint?: string;
  submissionType: SubmissionType;
  submissionPrompt?: string;
  proofPrompt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'npc' | 'user' | 'system';
  content: string;
  timestamp: number;
  /** 用户发送的现场照片（object URL），仅用户消息可能携带 */
  imageUrl?: string;
}

// 当前支线的任务进度（由 step_published 事件聚合，供任务进度抽屉使用）：
// steps 按发布顺序累积，total 是设计的总步数；新支线从 step.index=0 重新开始
export interface QuestProgress {
  // 支线实例 id（新支线 step0 时生成）：抽屉据此把"当前支线"与历史归档去重
  id?: string;
  title: string;
  total: number;
  steps: PublishedStep[];
}

// 已结束的支线（走完归档 / 中途放弃）：抽屉时间轴里作为历史节点累积保留
export interface ArchivedQuest {
  id: string;
  title: string;
  total: number;
  steps: PublishedStep[];
  status: 'done' | 'abandoned';
  at: number;
}

// 对话瀑布流条目：文字气泡 / 活动卡片 / 步骤卡片都累积在同一条时间线上
export type TimelineItem =
  | { id: string; kind: 'user' | 'npc'; content: string; timestamp: number; imageUrl?: string }
  | { id: string; kind: 'activities'; activities: ActivityPlan[]; timestamp: number }
  | { id: string; kind: 'step'; step: PublishedStep; total: number; timestamp: number };

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

// 后端 env_resolved 事件回传的玩家环境（由定位坐标解析出的城市/天气），供 header 定位徽章展示
export interface EnvInfo {
  city?: string | null;
  district?: string | null;
  province?: string | null;
  weather?: { text: string; tempC: number } | null;
}

// ── 支线手账（集印册 + 成就墙），与服务端 HandbookView 对应 ──────────────────

export interface QuestRecord {
  id: string;
  title: string;
  category: QuestCategory;
  tags: string[];
  steps: number;
  evidence?: string;
  date: string;
}

export interface BadgeState {
  id: string;
  name: string;
  desc: string;
  earned: boolean;
  progress: number;
  target: number;
  unlockedAt?: string;
}

export interface HandbookStats {
  total: number;
  weekCount: number;
  byCategory: Record<QuestCategory, number>;
  earnedCount: number;
}

export interface HandbookView {
  clientId: string;
  quests: QuestRecord[];
  badges: BadgeState[];
  stats: HandbookStats;
}
