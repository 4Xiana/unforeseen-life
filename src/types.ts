export type FSMState = 'S0' | 'S1' | 'S2' | 'S3';

export type SubmissionType = 'text' | 'photo';

export type QuestCategory = 'explore' | 'organize' | 'create' | 'connect' | 'sense';

export interface ActivityStep {
  instruction: string;
  hint?: string;
  submissionType: SubmissionType;
  completionCriteria: string;
  proofPrompt?: string;
  // 这一步的建议节奏（秒）：缺省=不计时。软参考，不是限时
  suggestedSeconds?: number;
}

export interface ActivityPlan {
  journey?: import('../server/goals-types').Journey;
  id: string;
  title: string;
  hook: string;
  tags: string[];
  category: QuestCategory;
  // S1 卡片不带步骤；玩家选中后在 S2 由 design_activity_steps 延迟设计
  steps?: ActivityStep[];
}

export interface PublishedStep {
  journey?: import('../server/goals-types').Journey;
  index: number;
  instruction: string;
  hint?: string;
  submissionType: SubmissionType;
  submissionPrompt?: string;
  proofPrompt?: string;
  // 建议节奏（秒），后端按玩家空闲时长校正后下发；0/缺省=这一步不计时
  suggestedSeconds?: number;
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

export interface StepEvidence {
  type: 'text' | 'photo';
  text?: string;
  photoUrl?: string;
  at: string;
}

export interface StepDetail {
  instruction: string;
  submissionType: SubmissionType;
  proofPrompt?: string;
  evidence?: StepEvidence;
}

export interface QuestRecord {
  id: string;
  title: string;
  category: QuestCategory;
  tags: string[];
  steps: number;
  evidence?: string;
  date: string;
  stepDetails?: StepDetail[];
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

// ── 玩家喜好档案（长期记忆），与服务端 UserProfile 对应 ─────────────────────
// 问题轴与种子库标签对齐：体力 / 新奇度 / 人群 / 预算 / 玩法机制

export type EnergyPref = '坐' | '慢' | '动' | 'any';
export type SocialPref = 'solo' | 'pair' | 'group' | 'any';
export type BudgetPref = 'free' | 'low' | 'any';
/** 0 = 都行；1 稳妥；2 新鲜；3 脑洞 */
export type NoveltyPref = 0 | 1 | 2 | 3;
export type MechanismPref =
  | '收集图鉴' | '随机委托' | '视角重赋' | '规则限制' | '定点观察'
  | '触感心流' | '盲盒猜谜' | '角色扮演' | '连接动作' | '留痕收尾';

export interface UserProfile {
  clientId: string;
  createdAt?: string;
  updatedAt?: string;
  onboarded: boolean;
  energy: EnergyPref;
  novelty: NoveltyPref;
  social: SocialPref;
  budget: BudgetPref;
  mechs: MechanismPref[];
  interests: string;
  avoids: string;
  /** Pair-wise 快速对比选择：pairId -> 选中 A/B */
  pairVotes: Record<string, 'A' | 'B'>;
}

export interface SaveProfileInput {
  energy: EnergyPref;
  novelty: NoveltyPref;
  social: SocialPref;
  budget: BudgetPref;
  mechs: MechanismPref[];
  interests: string;
  avoids: string;
  pairVotes: Record<string, 'A' | 'B'>;
}

// ── Pair-wise 真实任务对比（GET /api/quest-pairs）──────────────────────────

export interface PairSeed {
  id: string;
  title: string;
  text: string;
  min: number;
  scenes: string[];
  energy: string;
  budget: '0' | '低';
}

export interface QuestPair {
  id: string;
  /** 问题用时长从句：如 "只有 10 分钟" */
  when: string;
  /** 短档名：如 "10 分钟" */
  timeShort: string;
  a: PairSeed;
  b: PairSeed;
}
