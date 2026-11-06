import type {
  FSMState,
  ActivityPlan,
  CollectedInfo,
  TranscriptEntry,
  WorkingMemorySnapshot,
} from './types.js';

const TRANSCRIPT_WINDOW = 24;
const TRANSCRIPT_ENTRY_MAX = 300;

export class WorkingMemory {
  requestedGoalId?: string;
  private fsmState: FSMState;
  private collectedInfo: CollectedInfo;
  private proposedActivities: ActivityPlan[];
  private selectedActivity: ActivityPlan | null;
  private currentStepIndex: number;
  private currentTime: string;
  private transcript: TranscriptEntry[];

  constructor(snapshot?: WorkingMemorySnapshot) {
    this.requestedGoalId = snapshot?.requestedGoalId;
    this.fsmState = snapshot?.fsmState ?? 'S0';
    this.collectedInfo = structuredClone(snapshot?.collectedInfo ?? {});
    this.proposedActivities = structuredClone(snapshot?.proposedActivities ?? []);
    this.selectedActivity = structuredClone(snapshot?.selectedActivity ?? null);
    this.currentStepIndex = snapshot?.currentStepIndex ?? 0;
    this.currentTime = new Date().toISOString();
    this.transcript = structuredClone(snapshot?.transcript ?? []);
  }

  get state(): FSMState {
    return this.fsmState;
  }

  setState(state: FSMState) {
    this.fsmState = state;
  }

  get collected(): CollectedInfo {
    return { ...this.collectedInfo };
  }

  updateCollectedInfo(patch: Partial<CollectedInfo>): CollectedInfo {
    this.collectedInfo = { ...this.collectedInfo, ...patch };
    return { ...this.collectedInfo };
  }

  get proposedActivitiesList(): ActivityPlan[] {
    return this.proposedActivities.map(a => ({ ...a, steps: (a.steps || []).map(s => ({ ...s })) }));
  }

  setProposedActivities(activities: ActivityPlan[]) {
    // S1 卡片不带步骤（延迟到 S2 设计），统一归一化为空数组
    this.proposedActivities = activities.map(a => ({ ...a, steps: a.steps || [] }));
  }

  /**
   * S2 延迟设计：为选中的支线挂上完整步骤。同时写回候选列表里的同 id 活动，
   * 保证 snapshot / 手账结算读到的步数一致。
   */
  attachStepsToSelected(steps: NonNullable<ActivityPlan['steps']>): boolean {
    const target = this.selectedActivity;
    if (!target) return false;
    const cloned = steps.map(s => ({ ...s }));
    this.selectedActivity = { ...target, steps: cloned };
    const idx = this.proposedActivities.findIndex(a => a.id === target.id);
    if (idx >= 0) {
      this.proposedActivities[idx] = { ...this.proposedActivities[idx], steps: cloned };
    }
    return true;
  }

  findActivity(id: string): ActivityPlan | undefined {
    return this.proposedActivities.find(a => a.id === id);
  }

  get selected(): ActivityPlan | null {
    return this.selectedActivity ? { ...this.selectedActivity, steps: (this.selectedActivity.steps || []).map(s => ({ ...s })) } : null;
  }

  setSelectedActivity(activity: ActivityPlan | null) {
    this.selectedActivity = activity
      ? { ...activity, steps: (activity.steps || []).map(s => ({ ...s })) }
      : null;
  }

  get stepIndex(): number {
    return this.currentStepIndex;
  }

  setStepIndex(index: number) {
    this.currentStepIndex = index;
  }

  /**
   * 验收通过后，把玩家为当前步骤提交的证物写入选中支线的对应步骤，
   * 供 S3 归档时收集进手账记录页。直接修改内部对象（不触发 clone 循环）。
   */
  recordStepEvidence(evidence: { type: 'text' | 'photo'; text?: string; photoUrl?: string }) {
    const target = this.selectedActivity;
    if (!target || !target.steps) return false;
    const step = target.steps[this.currentStepIndex];
    if (!step) return false;
    if (target.journey && (
      evidence.type !== step.submissionType || !evidence.text?.trim()
      || (step.submissionType === 'photo' && !evidence.photoUrl?.startsWith('/evidence/'))
    )) return false;
    step.submittedEvidence = { ...evidence, at: new Date().toISOString() };
    return true;
  }

  get time(): string {
    this.currentTime = new Date().toISOString();
    return this.currentTime;
  }

  appendTranscript(role: 'user' | 'assistant', content: string) {
    const trimmed = (content || '').trim();
    if (!trimmed) return;
    this.transcript.push({
      role,
      content: trimmed.length > TRANSCRIPT_ENTRY_MAX ? trimmed.slice(0, TRANSCRIPT_ENTRY_MAX) + '…' : trimmed,
      at: new Date().toISOString(),
    });
    if (this.transcript.length > TRANSCRIPT_WINDOW) {
      this.transcript.splice(0, this.transcript.length - TRANSCRIPT_WINDOW);
    }
  }

  recentTranscript(limit = TRANSCRIPT_WINDOW): TranscriptEntry[] {
    return this.transcript.slice(-limit).map((e) => ({ ...e }));
  }

  resetActivityScope() {
    this.proposedActivities = [];
    this.selectedActivity = null;
  }

  resetExecutionScope() {
    this.currentStepIndex = 0;
  }

  snapshot(): WorkingMemorySnapshot {
    return {
      requestedGoalId: this.requestedGoalId,
      fsmState: this.fsmState,
      collectedInfo: { ...this.collectedInfo },
      proposedActivities: this.proposedActivitiesList,
      selectedActivity: this.selected,
      currentStepIndex: this.currentStepIndex,
      currentTime: this.time,
      transcript: this.recentTranscript(),
    };
  }
}
