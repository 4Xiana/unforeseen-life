export { CORE_INSTRUCTIONS } from './core.js';
export {
  TOOL_DESCRIPTIONS,
  TOOL_HINTS,
  TOOL_STEPPING_TEXT,
  SUBMISSION_PROMPTS,
} from './tool-meta.js';

export const COLLECTED_INFO_LABELS: Record<string, string> = {
  freeTime: '空闲时长',
  scene: '所在场景',
  peopleCount: '人数',
  budget: '预算',
  energyLevel: '体力/心情状态',
  preferences: '偏好/禁忌',
  companion: '陪伴状态',
  mood: '情绪状态',
};

// ── UI 交互 → 自然语言包装（仅陈述用户做了什么，不含指令/决策）─────────────

export function buildS1SelectActivityMessage(title: string): string {
  return `我选「${title}」，就这个吧。`;
}

export const S1_ABANDON_MESSAGE = `算了，我先不玩了，下次吧。`;

export const S2_SUBMIT_CHECK_MESSAGE = `这一步我做完啦，你看看。`;

export function buildS2SubmitTextMessage(text: string): string {
  return `这一步我的反馈是：${text}`;
}
export function buildS2SubmitPhotoMessage(description: string): string {
  return `我拍了张照片，你看看：${description}`;
}

export const S2_ABANDON_MESSAGE = `这个任务我不太想继续了，先放弃吧。`;
export const S2_SWITCH_ACTIVITY_MESSAGE = `这个活动我不太想做了，能不能换一个？`;
