import { useCallback, useEffect, useRef, useState } from 'react';

// ── 步骤软节奏计时器 ────────────────────────────────────────────────────────
// 一个支线里"当前正在做的那一步"的建议节奏：step_published 开表，提交即定格。
// 设计取向是"陪伴式的节奏"而非截止时间——
//   · 超时不判负、不阻断提交：圆环走完自动转成正计时（elapsed 继续走）；
//   · 玩家可暂停 / +2 分钟 / 收起；
//   · 聊天任务卡与侧边抽屉挂的是同一个 hook 实例（App 层创建后下传），单一 interval，
//     两处看到的状态严格一致，不存在两个时钟各走各的。
// 切步 / 换支线以 `${questId}#${stepIndex}` 为键自动重置；历史步的"踩点"结果留在 results 里，
// 供抽屉已完成步骤盖小章。

const TICK_MS = 1000;
const ADD_GRANT_SECONDS = 120;

interface LiveTimer {
  elapsed: number;
  extraSeconds: number;
  paused: boolean;
  /** 收起后只显示一枚小按钮，但计时不中断（收起 ≠ 暂停） */
  dismissed: boolean;
  /** 已提交（等验收）：定格，不再走字；被驳回后玩家可重交，值随重交覆盖 */
  submitted: boolean;
}

export interface StepSubmitOutcome {
  elapsedSeconds: number;
  /** 是否在建议节奏（含玩家主动 +2）内交的，用于盖"踩点"章和模型的中性旁白 */
  onTime: boolean;
}

export interface StepTimerApi {
  /** 当前键对应步骤是否计时（无活动/非执行步时为 false） */
  active: boolean;
  elapsed: number;
  extraSeconds: number;
  suggestedSeconds: number;
  /** 剩余秒（含加时），≤0 即超时，UI 转正计时 */
  remaining: number;
  overtime: boolean;
  paused: boolean;
  dismissed: boolean;
  pause: () => void;
  resume: () => void;
  addTime: () => void;
  dismiss: () => void;
  restore: () => void;
  /** 提交瞬间调用：定格计时并登记该步结果，返回要上行的实际耗时；当前步不计时时返回 null */
  markSubmitted: () => StepSubmitOutcome | null;
  /** 查某一步（任意键）的提交结果，抽屉给已完成步骤盖"踩点"章 */
  getResult: (key: string) => StepSubmitOutcome | undefined;
}

function freshTimer(): LiveTimer {
  return { elapsed: 0, extraSeconds: 0, paused: false, dismissed: false, submitted: false };
}

/**
 * @param stepKey 当前步骤键 `${questId}#${index}`；不计时的步骤/无活动传 null
 * @param suggestedSeconds 该步建议节奏（秒）；切键时随事件下发的值一起重置
 */
export function useStepTimer(stepKey: string | null, suggestedSeconds: number): StepTimerApi {
  const [timer, setTimer] = useState<LiveTimer>(freshTimer);
  const [results, setResults] = useState<Record<string, StepSubmitOutcome>>({});

  const keyRef = useRef<string | null>(stepKey);
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const suggestedRef = useRef(suggestedSeconds);
  suggestedRef.current = suggestedSeconds;

  // 切到新步骤/新支线：整表归零。同键下 suggested 变化（不应发生）不打断计时
  useEffect(() => {
    if (stepKey !== keyRef.current) {
      keyRef.current = stepKey;
      setTimer(freshTimer());
    }
  }, [stepKey]);

  // 全应用唯一的 1s 心跳；当前步未暂停/未提交时走字
  useEffect(() => {
    const id = window.setInterval(() => {
      if (keyRef.current === null) return;
      const t = timerRef.current;
      if (t.paused || t.submitted) return;
      setTimer(prev => (prev.paused || prev.submitted) ? prev : { ...prev, elapsed: prev.elapsed + 1 });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const pause = useCallback(() => setTimer(t => t.submitted ? t : { ...t, paused: true }), []);
  // resume 也用于"提交被驳回、继续做这一步"：解冻定格状态接着走（markSubmitted 的结果会在重交时覆盖）
  const resume = useCallback(() => setTimer(t => ({ ...t, paused: false, submitted: false })), []);
  const addTime = useCallback(() => setTimer(t => t.submitted ? t : { ...t, extraSeconds: t.extraSeconds + ADD_GRANT_SECONDS }), []);
  const dismiss = useCallback(() => setTimer(t => ({ ...t, dismissed: true })), []);
  const restore = useCallback(() => setTimer(t => ({ ...t, dismissed: false })), []);

  const markSubmitted = useCallback((): StepSubmitOutcome | null => {
    const key = keyRef.current;
    if (key === null) return null;
    const t = timerRef.current;
    const allowance = suggestedRef.current + t.extraSeconds;
    const outcome: StepSubmitOutcome = {
      elapsedSeconds: Math.max(1, t.elapsed),
      onTime: t.elapsed <= allowance,
    };
    setTimer(prev => ({ ...prev, submitted: true, paused: false }));
    setResults(prev => ({ ...prev, [key]: outcome }));
    return outcome;
  }, []);

  const getResult = useCallback(
    (key: string) => results[key],
    [results],
  );

  const total = suggestedSeconds + timer.extraSeconds;

  return {
    active: stepKey !== null,
    elapsed: timer.elapsed,
    extraSeconds: timer.extraSeconds,
    suggestedSeconds,
    remaining: total - timer.elapsed,
    overtime: timer.elapsed > total,
    paused: timer.paused,
    dismissed: timer.dismissed,
    pause,
    resume,
    addTime,
    dismiss,
    restore,
    markSubmitted,
    getResult,
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}
