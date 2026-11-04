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

/**
 * 步骤节奏旁白：玩家交证物时，前端把实际耗时带上来。
 * 只陈述事实、并明确"超时不影响验收"，防止模型把慢当问题；模型可自然带半句，禁止报时催促。
 */
export function buildStepPaceNote(elapsedSeconds?: number, suggestedSeconds?: number): string {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return '';
  if (!suggestedSeconds || suggestedSeconds <= 0) return '';
  const m = Math.round(elapsedSeconds / 60);
  const within = elapsedSeconds <= suggestedSeconds;
  return within
    ? `（系统附注：玩家这一步实际用了约 ${m} 分钟，卡片给的建议节奏约 ${Math.round(suggestedSeconds / 60)} 分钟，在节奏内。这只是节奏参考、不是考核，验收只看证物本身；你可以自然带半句，不要刻意报时。）`
    : `（系统附注：玩家这一步实际用了约 ${m} 分钟，比卡片给的建议节奏（约 ${Math.round(suggestedSeconds / 60)} 分钟）慢一些——慢做完全允许，绝不是问题，不要催促或评价快慢，验收只看证物本身。）`;
}

export function buildS2SubmitTextMessage(text: string, paceNote = ''): string {
  return `这一步我的记录：${text}${paceNote}`;
}
export function buildS2SubmitPhotoMessage(description: string, paceNote = ''): string {
  return `我拍了张照片，你看看：${description}${paceNote}`;
}

export const S2_ABANDON_MESSAGE = `这个任务我不太想继续了，先放弃吧。`;
export const S2_SWITCH_ACTIVITY_MESSAGE = `这个活动我不太想做了，能不能换一个？`;
