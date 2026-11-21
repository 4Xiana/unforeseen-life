import type { FSMState, WorkingMemorySnapshot } from '../memory/types.js';
import type { WorkingMemory } from '../memory/working-memory.js';

export interface TransitionResult {
  success: boolean;
  previousState?: FSMState;
  newState?: FSMState;
  error?: string;
  allowedTransitions?: string[];
  reason?: string;
}

export interface LifecycleHooks {
  onTransition?: (from: FSMState, to: FSMState, reason: string, memory: WorkingMemory) => void | Promise<void>;
}

function validateTransition(
  from: FSMState,
  to: FSMState,
  snapshot: WorkingMemorySnapshot
): TransitionResult {
  switch (from) {
    case 'S0': {
      if (to === 'S0') {
        return { success: true, previousState: from, newState: to };
      }
      if (to === 'S1') {
        if (snapshot.collectedInfo.freeTime) {
          return { success: true, previousState: from, newState: to };
        }
        return {
          success: false,
          error: `从S0(收集信息)跳转到S1(推荐活动)的条件未满足：需要先收集到用户的空闲时长(freeTime)。当前已收集信息：${formatCollected(snapshot)}。请继续通过对话收集用户空闲时间，或调用 save_user_info 保存后重试。`,
          allowedTransitions: ['S0', 'S1'],
        };
      }
      if (to === 'S2') {
        return {
          success: false,
          error: '不能从S0(收集信息)直接跳转到S2(执行任务)。流程必须是：S0收集信息→S1推荐活动→S2执行任务。请先收集空闲时间后转到S1。',
          allowedTransitions: ['S0', 'S1'],
        };
      }
      break;
    }

    case 'S1': {
      if (to === 'S0') {
        return { success: true, previousState: from, newState: to };
      }
      if (to === 'S1') {
        return { success: true, previousState: from, newState: to };
      }
      if (to === 'S2') {
        if (snapshot.selectedActivity) {
          return { success: true, previousState: from, newState: to };
        }
        const activityInfo = snapshot.proposedActivities.length > 0
          ? `当前有${snapshot.proposedActivities.length}个候选活动(${snapshot.proposedActivities.map(a => a.title).join('、')})，但用户尚未选择`
          : '当前还没有推荐任何活动';
        return {
          success: false,
          error: `从S1(推荐活动)跳转到S2(执行任务)的条件未满足：用户还没有选择活动。${activityInfo}。请先调用 propose_activities 推荐活动，或等待/引导用户选择活动后再跳转。`,
          allowedTransitions: ['S0', 'S1', 'S2'],
        };
      }
      break;
    }

    case 'S2': {
      if (to === 'S0' || to === 'S1' || to === 'S2') {
        return { success: true, previousState: from, newState: to };
      }
      if (to === 'S3') {
        const selected = snapshot.selectedActivity;
        if (!selected) {
          return {
            success: false,
            error: '从S2(执行任务)跳转到S3(完成祝贺)失败：当前没有选中的活动。',
            allowedTransitions: ['S0', 'S1', 'S2'],
          };
        }
        const stepCount = (selected.steps || []).length;
        if (stepCount === 0) {
          return {
            success: false,
            error: '从S2(执行任务)跳转到S3(完成祝贺)失败：这条支线的步骤还没设计好。请先调用 design_activity_steps 设计 2-4 步，再通过 publish_step 逐步发卡。',
            allowedTransitions: ['S0', 'S1', 'S2'],
          };
        }
        const isLastStep = snapshot.currentStepIndex >= stepCount - 1;
        if (!isLastStep) {
          return {
            success: false,
            error: `从S2跳转到S3(完成祝贺)失败：活动「${selected.title}」共${stepCount}步，当前在第${snapshot.currentStepIndex + 1}步，尚未到最后一步。请继续通过 publish_step 推进剩余步骤，不要提前收官。`,
            allowedTransitions: ['S0', 'S1', 'S2'],
          };
        }
        return { success: true, previousState: from, newState: to };
      }
      break;
    }

    case 'S3': {
      if (to === 'S0' || to === 'S1' || to === 'S3') {
        return { success: true, previousState: from, newState: to };
      }
      break;
    }
  }

  return {
    success: false,
    error: `不合法的状态跳转：${from} → ${to}。当前状态${from}允许的跳转目标见 allowedTransitions。`,
    allowedTransitions: getDefaultAllowed(from),
  };
}

export class StateMachine {
  private memory: WorkingMemory;
  private hooks: LifecycleHooks;

  constructor(memory: WorkingMemory, hooks: LifecycleHooks = {}) {
    this.memory = memory;
    this.hooks = hooks;
  }

  get current(): FSMState {
    return this.memory.state;
  }

  async requestTransition(targetState: FSMState, reason: string): Promise<TransitionResult> {
    const snapshot = this.memory.snapshot();
    const result = validateTransition(this.current, targetState, snapshot);

    if (!result.success) {
      return result;
    }

    const from = this.current;
    const to = targetState;

    this.applyStateSideEffects(from, to);
    this.memory.setState(to);

    if (this.hooks.onTransition) {
      await Promise.resolve(this.hooks.onTransition(from, to, reason, this.memory));
    }

    return {
      success: true,
      previousState: from,
      newState: to,
      reason,
    };
  }

  private applyStateSideEffects(from: FSMState, to: FSMState) {
    if (to === 'S0') {
      this.memory.resetActivityScope();
      this.memory.resetExecutionScope();
    }
    if (to === 'S1') {
      this.memory.resetActivityScope();
    }
    if (to === 'S2') {
      this.memory.resetExecutionScope();
    }
    if (to === 'S3') {
      this.memory.resetExecutionScope();
    }
  }
}

function formatCollected(snapshot: WorkingMemorySnapshot): string {
  const info = snapshot.collectedInfo;
  const parts: string[] = [];
  if (info.freeTime) parts.push(`空闲时长=${info.freeTime}`);
  if (info.scene) parts.push(`场景=${info.scene}`);
  if (info.companion) parts.push(`陪伴=${info.companion}`);
  if (info.mood) parts.push(`情绪=${info.mood}`);
  if (info.energyLevel) parts.push(`状态=${info.energyLevel}`);
  if (info.budget) parts.push(`预算=${info.budget}`);
  return parts.length > 0 ? parts.join('，') : '无';
}

function getDefaultAllowed(from: FSMState): FSMState[] {
  switch (from) {
    case 'S0': return ['S0', 'S1'];
    case 'S1': return ['S0', 'S1', 'S2'];
    case 'S2': return ['S0', 'S1', 'S2', 'S3'];
    case 'S3': return ['S0', 'S1', 'S3'];
  }
}
