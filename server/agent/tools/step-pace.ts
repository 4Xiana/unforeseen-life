import type { ActivityStep } from '../memory/types.js';

// ── 步骤建议节奏（pacing）──────────────────────────────────────────────────
// 计时器是"建议的呼吸节奏"，不是截止时间：每步一个由动作性质估出、再被玩家
// 空闲时长硬性收口的建议秒数。超时不判负，前端只做软提示（见 StepTimer 组件）。

/** 模型在 design_activity_steps 里对每步给出的估时（分钟），仅入参用，不落 memory */
export interface StepDurationDraft {
  submissionType: ActivityStep['submissionType'];
  suggestedMinutes?: number;
}

/** 模型漏估时的兜底：text 清单/记录 3 分钟，photo 到场/拍照 4 分钟 */
const DEFAULT_SECONDS: Record<'text' | 'photo', number> = {
  text: 3 * 60,
  photo: 4 * 60,
};

const MIN_STEP_SECONDS = 60;
const ROUND_UNIT = 30;
/** 支线总节奏占空闲时长的比例（与 quest-library / 设计规范的 80% 硬约束一致） */
const FREE_TIME_RATIO = 0.8;
/** 解析不出空闲时长时的兜底预算（12 分钟），保证 2-3 个内容步有合理节奏 */
const FALLBACK_BUDGET_SECONDS = 12 * 60;

const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/** 0-99 的中文/阿拉伯数字混写解析："十五"→15、"二十三"→23、"30"→30；无法解析返回 null */
function parseSmallNumber(raw: string): number | null {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === '半') return 0.5;
  let num: number | null = null;
  if (s.includes('十')) {
    const [tensPart, onesPart] = s.split('十');
    const tens = tensPart === '' ? 1 : (CN_DIGITS[tensPart] ?? (tensPart && /^\d+$/.test(tensPart) ? Number(tensPart) : null));
    const ones = onesPart === '' || onesPart === undefined ? 0 : (CN_DIGITS[onesPart] ?? (/^\d+$/.test(onesPart) ? Number(onesPart) : null));
    if (tens === null || ones === null) return null;
    num = tens * 10 + ones;
  } else if (s in CN_DIGITS) {
    num = CN_DIGITS[s];
  }
  return num;
}

/**
 * 解析 collectedInfo.freeTime 为分钟数。
 * 兼容 chip 文案（"15分钟"/"半个小时"/"一个小时"）与模型存的自由文本（"大概40分钟左右"）。
 * "一下午""一会儿"这类无精确时长的说法返回 null。
 */
export function parseFreeTimeMinutes(freeTime?: string): number | null {
  if (!freeTime) return null;
  const s = freeTime.replace(/\s+/g, '');

  const halfHour = /半\s*(个)?\s*(小时|钟头)/.test(s) || /半个小时?/.test(s);
  if (halfHour) return 30;

  const hourMatch = s.match(/([0-9零一二两三四五六七八九]+(?:\.[0-9]+)?)\s*(?:个)?\s*(?:小时|钟头|h\b|hr\b)/);
  if (hourMatch) {
    const n = parseSmallNumber(hourMatch[1]);
    if (n !== null) return Math.round(n * 60);
  }

  const minuteMatch = s.match(/([0-9零一二两三四五六七八九十]+)\s*(?:分钟|分|min\b|m\b)/);
  if (minuteMatch) {
    const n = parseSmallNumber(minuteMatch[1]);
    if (n !== null) return n;
  }

  return null;
}

function roundToUnit(seconds: number): number {
  return Math.max(MIN_STEP_SECONDS, Math.round(seconds / ROUND_UNIT) * ROUND_UNIT);
}

/**
 * 为每步校正建议节奏，写回 suggestedSeconds：
 * - text/photo：取模型估值（1-10 分钟），缺失走类型默认值；
 * - 所有步总和超过"空闲 80%"预算时按比例压缩（30 秒取整、每步保底 60 秒）；
 * - 解析不出空闲时长时，仅在超过兜底预算时压缩。
 * 返回带 suggestedSeconds 的新步骤数组，不改原对象。
 */
export function reconcileStepDurations<T extends ActivityStep>(
  steps: T[],
  drafts: StepDurationDraft[],
  freeTime?: string,
): T[] {
  const freeMinutes = parseFreeTimeMinutes(freeTime);
  const budgetSeconds = freeMinutes !== null
    ? Math.max(MIN_STEP_SECONDS, Math.round(freeMinutes * FREE_TIME_RATIO) * 60)
    : FALLBACK_BUDGET_SECONDS;

  const rawSeconds = steps.map((step, i) => {
    const draft = drafts[i];
    const m = draft?.suggestedMinutes;
    if (typeof m === 'number' && Number.isFinite(m) && m >= 1 && m <= 10) return Math.round(m) * 60;
    return DEFAULT_SECONDS[step.submissionType] ?? DEFAULT_SECONDS.text;
  });

  const totalSeconds = rawSeconds.reduce((a, b) => a + b, 0);
  const finalSeconds = rawSeconds.map((sec) => {
    if (totalSeconds <= budgetSeconds) return sec;
    return roundToUnit(sec * (budgetSeconds / totalSeconds));
  });

  return steps.map((step, i) => ({ ...step, suggestedSeconds: finalSeconds[i] }));
}

/** 把秒数格式化成"X 分 Y 秒"（工具结果 / 上下文用） */
export function formatPaceDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest} 秒`;
  if (rest === 0) return `${m} 分钟`;
  return `${m} 分 ${rest} 秒`;
}
