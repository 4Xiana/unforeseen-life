import type { ActivityPlan, ArchivedQuest, EnvInfo, FSMState, PublishedStep, QuestProgress, SSEEvent, TimelineItem } from './types';

export interface RestoredSession {
  sessionId: string;
  clientId: string;
  status: 'idle' | 'processing' | 'interrupted';
  snapshot: {
    fsmState: FSMState;
    proposedActivities: ActivityPlan[];
    selectedActivity: ActivityPlan | null;
    currentStepIndex: number;
  };
  events: { id: number; at: number; event: SSEEvent }[];
}

/** 回放可见事件，不调用 Agent、不重交证物、不触发完成动画。 */
export function restoreSessionView(saved: RestoredSession) {
  const timeline: TimelineItem[] = [];
  const questHistory: ArchivedQuest[] = [];
  let quest: QuestProgress | null = null;
  let proposedActivities: ActivityPlan[] = [];
  let envInfo: EnvInfo | null = null;
  let npc: Extract<TimelineItem, { kind: 'user' | 'npc' }> | null = null;
  let freshQuest = false;
  const archive = (status: 'done' | 'abandoned', at: number) => {
    if (!quest?.id || questHistory.some(q => q.id === quest!.id)) return;
    questHistory.push({ ...quest, id: quest.id, status, at });
  };
  for (const { id, at, event: e } of saved.events) {
    const key = `saved-${id}`;
    switch (e.type) {
      case 'user_message':
        if (!e.hidden) timeline.push({ id: key, kind: 'user', content: String(e.content || ''), timestamp: at, imageUrl: e.imageUrl as string | undefined });
        break;
      case 'turn_start':
        npc = { id: key, kind: 'npc', content: '', timestamp: at };
        timeline.push(npc);
        break;
      case 'text_delta':
        if (npc) npc.content += String(e.text || '');
        break;
      case 'activities_proposed':
        proposedActivities = e.activities as ActivityPlan[];
        timeline.push({ id: key, kind: 'activities', activities: proposedActivities, timestamp: at });
        break;
      case 'state_changed':
        if (e.to === 'S3') archive('done', at);
        if (e.to === 'S0' || e.to === 'S1') {
          archive('abandoned', at);
          quest = null;
        }
        if (e.to === 'S2') freshQuest = true;
        break;
      case 'step_published': {
        const step = e.step as PublishedStep;
        timeline.push({ id: key, kind: 'step', step, total: Number(e.total), timestamp: at });
        if (!quest || freshQuest) {
          quest = { id: `quest-${id}`, title: String(e.activityTitle || '当前支线'), total: Number(e.total), steps: [] };
          freshQuest = false;
        }
        quest.steps = [...quest.steps.filter(s => s.index !== step.index), step].sort((a, b) => a.index - b.index);
        break;
      }
      case 'env_resolved':
        envInfo = e.env as EnvInfo;
        break;
    }
  }
  const snapshot = saved.snapshot;
  // 进程在推进后、发布卡片前中断时，用已落盘的当前步骤补齐入口。
  const current = snapshot.selectedActivity?.steps?.[snapshot.currentStepIndex];
  if (snapshot.fsmState === 'S2' && current && snapshot.selectedActivity) {
    const step: PublishedStep = { ...current, journey: snapshot.selectedActivity.journey, index: snapshot.currentStepIndex };
    if (!quest) quest = { id: `quest-${saved.sessionId}`, title: snapshot.selectedActivity.title, total: snapshot.selectedActivity.steps!.length, steps: [] };
    if (!quest.steps.some(s => s.index === step.index)) {
      quest.steps.push(step);
      timeline.push({ id: `current-${saved.sessionId}-${step.index}`, kind: 'step', step, total: quest.total, timestamp: saved.events[saved.events.length - 1]?.at || Date.now() });
    }
    // 兼容升级前发布的步骤事件：从持久化活动补回长程归属。
    for (const published of quest.steps) published.journey ??= snapshot.selectedActivity.journey;
  }
  return {
    timeline: timeline.filter(it => it.kind !== 'npc' || it.content.length > 0),
    quest, questHistory, proposedActivities: snapshot.proposedActivities || proposedActivities,
    envInfo, fsmState: snapshot.fsmState,
  };
}
