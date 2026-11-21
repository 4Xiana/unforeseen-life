import { FITTING_PAIRS, type PairAnswer } from '../../server/agent/profile/fitting-pairs';
import { fitPreferences } from '../../server/agent/profile/preference-model';
import type { Goal, GoalInput } from '../../server/goals-types';
import type { QuestThread } from '../../server/quest-thread-types';
import type { RestoredSession } from '../session-restore';
import type { ActivityPlan, DesiredOutcome, HandbookView, SSEEvent, StepEvidence, UserProfile } from '../types';
import { createDemoActivities, createDemoGoalPlan, createDemoGoals, createDemoHandbook, createDemoInspirations, createDemoProfile, createDemoThreads, DEMO_GOAL_INPUT, DEMO_PHOTO_URL, demoEvidenceImage, demoStepSample, refreshDemoHandbook, type DemoInspiration, type DemoQuestRecord } from './fixtures';

export const DEMO_STATE_KEY = 'runtime-state-v1';
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface DemoSession extends RestoredSession {
  evidence: StepEvidence[];
  round: number;
}
interface CachedResponse { status: number; contentType: string; body: string }
interface DemoState {
  version: 1;
  profile: UserProfile;
  handbook: HandbookView;
  goals: Goal[];
  threads: QuestThread[];
  inspirations: DemoInspiration[];
  sessions: Record<string, DemoSession>;
  activeSessionId: string | null;
  requests: Record<string, CachedResponse>;
  sequence: number;
}
interface DemoOptions { storage: DemoStorage; latencyMs?: number; clientId?: string }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Xian-Demo': 'true' } });
const sse = (events: SSEEvent[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Xian-Demo': 'true' } });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw abortError(); }
async function delay(ms: number, signal: AbortSignal) {
  checkAbort(signal);
  if (!ms) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function initialState(clientId: string): DemoState {
  return { version: 1, profile: createDemoProfile(clientId), handbook: createDemoHandbook(clientId), goals: createDemoGoals(), threads: createDemoThreads(), inspirations: createDemoInspirations(), sessions: {}, activeSessionId: null, requests: {}, sequence: 0 };
}
function validState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<DemoState>;
  return state.version === 1 && !!state.profile?.clientId && Array.isArray(state.handbook?.quests) && Array.isArray(state.handbook?.badges)
    && Array.isArray(state.goals) && Array.isArray(state.threads) && Array.isArray(state.inspirations)
    && !!state.sessions && typeof state.sessions === 'object' && !!state.requests && typeof state.requests === 'object' && typeof state.sequence === 'number';
}
function readState(storage: DemoStorage, clientId: string): DemoState {
  try {
    const value: unknown = JSON.parse(storage.getItem(DEMO_STATE_KEY) || 'null');
    if (validState(value)) return value;
  } catch { /* A bad or unavailable demo cache starts a fresh demonstration. */ }
  return initialState(clientId);
}
const outcomesFor = (activity: ActivityPlan): DesiredOutcome[] => /魔术|练习/.test(activity.title) ? ['grow', 'connect'] : activity.category === 'connect' ? ['connect', 'express'] : activity.category === 'explore' ? ['surprise', 'grow'] : activity.category === 'create' ? ['express', 'grow'] : ['relax', 'grow'];

/** Complete local /api transport. An unrecognised route fails closed; it never calls window.fetch. */
export function createDemoFetch({ storage, latencyMs = 160, clientId = 'xian-demo-viewer' }: DemoOptions): typeof fetch {
  const state = readState(storage, clientId);
  const persist = () => { try { storage.setItem(DEMO_STATE_KEY, JSON.stringify(state)); } catch { /* In-memory demo remains usable when storage is full. */ } };
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++state.sequence}`;
  const getSession = (sessionId: string) => state.sessions[sessionId];
  persist();

  function recordEvents(session: DemoSession, events: SSEEvent[]) {
    for (const event of events) session.events.push({ id: session.events.length + 1, at: Date.now(), event: copy(event) });
  }
  function publishStep(session: DemoSession): SSEEvent {
    const activity = session.snapshot.selectedActivity!;
    const index = session.snapshot.currentStepIndex;
    return { type: 'step_published', step: { ...activity.steps![index], journey: activity.journey, index }, total: activity.steps!.length, activityTitle: activity.title };
  }
  function select(session: DemoSession, activity: ActivityPlan, events: SSEEvent[]) {
    const from = session.snapshot.fsmState;
    session.snapshot.fsmState = 'S2';
    session.snapshot.selectedActivity = copy(activity);
    session.snapshot.currentStepIndex = 0;
    session.evidence = [];
    events.push({ type: 'state_changed', from, to: 'S2' }, { type: 'text_delta', text: `好，就从「${activity.title}」开始。一次只做眼前这一小步。` }, publishStep(session));
  }
  function finish(session: DemoSession, events: SSEEvent[]) {
    const activity = session.snapshot.selectedActivity!;
    const now = new Date().toISOString();
    const quest: DemoQuestRecord = {
      id: id('demo-quest'), title: activity.title, category: activity.category, desiredOutcomes: outcomesFor(activity),
      tags: activity.tags.filter(tag => !/分钟|花费|在家|工位/.test(tag)), steps: activity.steps!.length, date: now,
      evidence: session.evidence.map(evidence => evidence.text).filter(Boolean).join('；'),
      stepDetails: activity.steps!.map((step, index) => ({ instruction: step.instruction, submissionType: step.submissionType, proofPrompt: step.proofPrompt, evidence: session.evidence[index] })),
    };
    state.handbook.quests.unshift(quest);
    const newBadges = state.handbook.badges.filter(badge => !badge.earned && state.handbook.quests.length >= badge.target);
    for (const badge of state.handbook.badges) {
      if (!badge.earned) badge.progress = Math.min(badge.target, state.handbook.quests.length);
      if (newBadges.includes(badge)) { badge.earned = true; badge.unlockedAt = now; }
    }
    refreshDemoHandbook(state.handbook);
    const journey = activity.journey;
    if (journey) {
      const goal = state.goals.find(candidate => candidate.id === journey.goalId);
      if (goal && !goal.records.some(record => record.chapterId === journey.chapterId)) {
        goal.records.push({ chapterId: journey.chapterId, sessionId: session.sessionId, at: now, steps: activity.steps!.map((step, index) => ({ ...step, submittedEvidence: session.evidence[index] })) });
        delete goal.inProgress;
        if (goal.records.length === goal.plan.chapters.length) goal.status = 'completed';
        const count = goal.records.length, total = goal.plan.chapters.length;
        const milestones = [
          { n: 1, id: 'first', name: '第一片拼图' },
          { n: Math.ceil(total / 2), id: 'half', name: '渐渐成形' },
          { n: total, id: 'complete', name: '愿望成册' },
        ];
        for (const milestone of milestones) if (count === milestone.n && !goal.rewards.some(reward => reward.id === milestone.id)) {
          goal.rewards.push({ id: milestone.id, name: milestone.name, description: '这份小收获，已经成为下一步的起点。', at: now });
        }
        events.push({ type: 'goal_updated', goal: copy(goal) });
      }
    }
    session.snapshot.fsmState = 'S3';
    events.push({ type: 'text_delta', text: '这条支线完成啦！你的作品已经收进手册，也成为了支线脉络中的一个新节点。' }, { type: 'handbook_updated', view: copy(state.handbook), questTitle: activity.title, category: activity.category, newBadges: copy(newBadges) }, { type: 'state_changed', from: 'S2', to: 'S3' }, { type: 'task_completed' });
  }
  function submit(session: DemoSession, evidence: StepEvidence, events: SSEEvent[]) {
    if (session.snapshot.fsmState !== 'S2' || !session.snapshot.selectedActivity?.steps) {
      events.push({ type: 'text_delta', text: '这条支线已经收好了。可以再选一件想做的小事。' });
      return;
    }
    const index = session.snapshot.currentStepIndex;
    const expected = session.snapshot.selectedActivity.steps[index].submissionType;
    if (expected === 'photo' && evidence.type !== 'photo') {
      events.push({ type: 'text_delta', text: '这一小步需要留一张作品照片。可以使用示例照片，看看作品怎样收进手册。' }, { type: 'evidence_reviewed', stepIndex: index, review: { available: true, verdict: 'reject', reason: '还差一张照片。', whatNeeded: '上传作品照片或使用演示示例。' } });
      return;
    }
    session.evidence[index] = evidence;
    events.push({ type: 'evidence_reviewed', stepIndex: index, review: { available: true, verdict: 'pass', reason: '这份小发现收好啦。', whatNeeded: '' } });
    if (index + 1 < session.snapshot.selectedActivity.steps.length) {
      session.snapshot.currentStepIndex++;
      events.push({ type: 'text_delta', text: '收到了，很喜欢你留意到的这个细节。接下来，把它变成自己的小作品吧。' }, publishStep(session));
    } else finish(session, events);
  }
  function turn(session: DemoSession, body: Record<string, unknown>, photo?: StepEvidence): Response {
    const text = String(body.text || '');
    const activityId = String(body.activityId || '');
    const userContent = photo ? `📷 ${photo.text || '留下了一张作品照片'}` : body.type === 'select_activity' ? `我选「${session.snapshot.proposedActivities.find(a => a.id === activityId)?.title || '这条支线'}」` : body.type === 'abandon' ? '先放下这条支线' : text;
    const userEvent: SSEEvent = { type: 'user_message', content: userContent, ...(photo ? { imageUrl: photo.photoUrl } : {}) };
    recordEvents(session, [userEvent]);
    const events: SSEEvent[] = [{ type: 'turn_start' }];
    if (body.type === 'abandon') {
      const from = session.snapshot.fsmState;
      const journey = session.snapshot.selectedActivity?.journey;
      const goal = state.goals.find(g => g.id === journey?.goalId);
      if (goal?.inProgress?.sessionId === session.sessionId) delete goal.inProgress;
      session.snapshot = { fsmState: 'S0', selectedActivity: null, proposedActivities: [], currentStepIndex: 0 };
      session.evidence = [];
      events.push({ type: 'state_changed', from, to: 'S0' }, { type: 'text_delta', text: '好，先放一放。想换个方向时，吱呀随时陪你出发。' });
    } else if (body.type === 'submit_text' || photo) {
      if (photo) events.push({ type: 'photo_saved', photoUrl: photo.photoUrl });
      submit(session, photo || { type: 'text', text: text.trim() || '窗边的慢时光：原来安静也可以这么热闹。', at: new Date().toISOString() }, events);
    } else if (body.type === 'select_activity') {
      const activity = session.snapshot.proposedActivities.find(candidate => candidate.id === activityId);
      if (!activity) return json({ error: '请从当前推荐中选择一条支线。' }, 400);
      if (session.snapshot.fsmState === 'S2') return json({ error: '先完成或放下当前支线，再开启下一条。' }, 409);
      select(session, activity, events);
    } else if (typeof body.goalId === 'string' && body.goalId) {
      const goal = state.goals.find(candidate => candidate.id === body.goalId);
      if (!goal || !['active', 'paused'].includes(goal.status)) return json({ error: '这份心愿还不能继续，请先开启计划。' }, 409);
      if (goal.inProgress && goal.inProgress.sessionId !== session.sessionId) return json({ error: '这段旅程已经在进行中，请恢复原来的记录。' }, 409);
      const chapter = goal.plan.chapters.find(candidate => !goal.records.some(record => record.chapterId === candidate.id));
      if (!chapter) return json({ error: '这个心愿已经完成。' }, 409);
      const index = goal.plan.chapters.indexOf(chapter);
      goal.status = 'active';
      goal.inProgress = { chapterId: chapter.id, sessionId: session.sessionId };
      select(session, { id: `demo-activity-${goal.id}-${chapter.id}`, title: chapter.title, hook: chapter.purpose, category: chapter.category, tags: ['心愿旅程', `${chapter.minutes} 分钟`], steps: copy(chapter.steps), journey: { goalId: goal.id, chapterId: chapter.id, title: goal.plan.title, ordinal: index + 1, total: goal.plan.chapters.length, purpose: chapter.purpose, previous: index ? goal.plan.chapters[index - 1].outcome : '' } }, events);
    } else if (session.snapshot.fsmState === 'S2') {
      const step = session.snapshot.selectedActivity!.steps![session.snapshot.currentStepIndex];
      events.push({ type: 'text_delta', text: /为什么|关联|意义/.test(text) ? '这一步是在帮你把一闪而过的体验，变成能回头看见的经历。之后它会和你之前的作品串在一起，慢慢长出自己的探索方向。' : `可以慢慢来。${step.hint || '不需要做得完美，留下此刻真实的一点发现就很好。'} 你准备好后，再提交这一小步的作品。` });
    } else {
      const from = session.snapshot.fsmState;
      session.snapshot.fsmState = 'S1';
      session.snapshot.selectedActivity = null;
      session.snapshot.currentStepIndex = 0;
      session.snapshot.proposedActivities = createDemoActivities(session.round++);
      events.push({ type: 'state_changed', from, to: 'S1' }, { type: 'text_delta', text: /继续探索|沿着|声音|脉络/.test(text) ? '沿着你留下的发现，还可以试试这些新玩法。挑一件现在最让你心动的吧。' : '今天想给生活添一点什么？我挑了三件现在就能开始的小事，点一张卡片就能出发。' }, { type: 'activities_proposed', activities: copy(session.snapshot.proposedActivities) });
    }
    events.push({ type: 'turn_complete', fsmState: session.snapshot.fsmState });
    recordEvents(session, events);
    state.activeSessionId = session.sessionId;
    return sse(events);
  }

  async function route(request: Request, path: string): Promise<Response> {
    const method = request.method;
    const body = async () => {
      const result: unknown = await request.json().catch(() => ({}));
      checkAbort(request.signal);
      return result && typeof result === 'object' ? result as Record<string, unknown> : {};
    };
    if (path === '/api/health') return json({ ok: true, demo: true });
    if (path === '/api/profile' && method === 'GET') return json(state.profile);
    if ((path === '/api/profile' || path === '/api/profile/fitting') && method === 'PUT') {
      const input = await body();
      const previousVotes = state.profile.pairVotes;
      const nextVotes: Record<string, PairAnswer> = {};
      const votes = input.pairVotes && typeof input.pairVotes === 'object' ? input.pairVotes as Record<string, unknown> : previousVotes;
      for (const pair of FITTING_PAIRS) if (['A', 'B', 'tie', 'skip'].includes(String(votes[pair.id]))) nextVotes[pair.id] = votes[pair.id] as PairAnswer;
      state.profile = { ...state.profile, ...(path === '/api/profile' ? input : {}), clientId: state.profile.clientId, onboarded: true, pairVotes: nextVotes, fitting: fitPreferences(nextVotes), fittingUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as UserProfile;
      return json(state.profile);
    }
    if (path === '/api/quest-pairs' && method === 'GET') return json(FITTING_PAIRS);
    if (path === '/api/handbook' && method === 'GET') return json(refreshDemoHandbook(state.handbook));
    if (path === '/api/session' && method === 'POST') {
      const sessionId = id('demo-session');
      state.sessions[sessionId] = { sessionId, clientId: state.profile.clientId, status: 'idle', snapshot: { fsmState: 'S0', proposedActivities: [], selectedActivity: null, currentStepIndex: 0 }, events: [], evidence: [], round: 0 };
      state.activeSessionId = sessionId;
      return json({ sessionId, clientId: state.profile.clientId });
    }
    if (path === '/api/session/active' && method === 'GET') return state.activeSessionId && state.sessions[state.activeSessionId] ? json(state.sessions[state.activeSessionId]) : json(null);
    const sessionMatch = path.match(/^\/api\/session\/([^/]+)(?:\/(message|photo))?$/);
    if (sessionMatch) {
      const session = getSession(decodeURIComponent(sessionMatch[1]));
      if (!session) return json({ error: '找不到这次演示记录。' }, 404);
      if (method === 'GET' && !sessionMatch[2]) return json(session);
      if (method === 'POST' && sessionMatch[2] === 'message') return turn(session, await body());
      if (method === 'POST' && sessionMatch[2] === 'photo') {
        const data = await request.formData();
        checkAbort(request.signal);
        const photo = data.get('photo');
        if (!(photo instanceof Blob) || photo.size === 0) return json({ error: '请先选择一张照片。' }, 400);
        // Demo uploads intentionally remain local samples, so no file can reach the real server.
        const step = session.snapshot.selectedActivity?.steps?.[session.snapshot.currentStepIndex];
        const sample = demoStepSample(step?.instruction || '');
        return turn(session, {}, { type: 'photo', photoUrl: sample.photoUrl, text: String(data.get('description') || sample.text), at: new Date().toISOString() });
      }
    }
    if (path === '/api/quest-threads' && method === 'GET') return json(state.threads);
    const threadMatch = path.match(/^\/api\/quest-threads(?:\/([^/]+))?$/);
    if (threadMatch) {
      const threadId = threadMatch[1] ? decodeURIComponent(threadMatch[1]) : undefined;
      const index = state.threads.findIndex(thread => thread.id === threadId);
      if (method === 'DELETE' && threadId) {
        if (index < 0) return json({ error: '这个主题已被移除。' }, 404);
        state.threads.splice(index, 1);
        return json({ ok: true });
      }
      if (method === 'POST' || (method === 'PUT' && threadId)) {
        if (threadId && index < 0) return json({ error: '找不到这个主题。' }, 404);
        const input = await body();
        const questIds = Array.isArray(input.questIds) ? [...new Set(input.questIds.filter((value): value is string => typeof value === 'string' && state.handbook.quests.some(quest => quest.id === value)))] : [];
        const title = String(input.title || '').trim().slice(0, 40);
        if (!title || !questIds.length) return json({ error: '给主题起个名字，再选至少一段经历。' }, 400);
        const now = new Date().toISOString();
        const thread: QuestThread = { id: threadId || id('demo-thread'), title, description: String(input.description || '').slice(0, 240), questIds, createdAt: index < 0 ? now : state.threads[index].createdAt, updatedAt: now };
        if (index < 0) state.threads.unshift(thread); else state.threads[index] = thread;
        return json(thread);
      }
    }
    if (path === '/api/goals' && method === 'GET') return json(state.goals);
    const goalMatch = path.match(/^\/api\/goals(?:\/([^/]+)(?:\/(draft|status))?)?$/);
    if (goalMatch) {
      const goal = state.goals.find(candidate => candidate.id === decodeURIComponent(goalMatch[1] || ''));
      if (method === 'GET' && goalMatch[1]) return goal ? json(goal) : json({ error: '找不到这份心愿。' }, 404);
      if (method === 'POST' && goalMatch[2] === 'status') {
        if (!goal) return json({ error: '找不到这份心愿。' }, 404);
        const input = await body();
        const next = input.action === 'confirm' && goal.status === 'draft' ? 'active' : input.action === 'pause' && goal.status === 'active' ? 'paused' : input.action === 'resume' && goal.status === 'paused' ? 'active' : null;
        if (!next) return json({ error: '这份心愿当前不能进行这个操作。' }, 409);
        goal.status = next;
        return json(goal);
      }
      if (method === 'POST' && (!goalMatch[1] || goalMatch[2] === 'draft')) {
        if (goalMatch[1] && !goal) return json({ error: '找不到这份心愿。' }, 404);
        if (goal && goal.status !== 'draft') return json({ error: '已经开启的心愿不能覆盖。' }, 409);
        const input = await body();
        const goalInput: GoalInput = input.example === true ? copy(DEMO_GOAL_INPUT) : { wish: String(input.wish || DEMO_GOAL_INPUT.wish), motivation: String(input.motivation || DEMO_GOAL_INPUT.motivation), preferences: String(input.preferences || DEMO_GOAL_INPUT.preferences), avoid: String(input.avoid || ''), minutes: Number(input.minutes) || 10, scene: ['home', 'outdoors', 'work'].includes(String(input.scene)) ? input.scene as GoalInput['scene'] : 'any' };
        const next: Goal = { id: goal?.id || id('demo-goal'), input: goalInput, plan: createDemoGoalPlan(goalInput), status: 'draft', createdAt: goal?.createdAt || new Date().toISOString(), records: [], rewards: [] };
        if (goal) state.goals[state.goals.indexOf(goal)] = next; else state.goals.unshift(next);
        return json(next);
      }
    }
    if (path === '/api/inspirations' && method === 'GET') return json(state.inspirations);
    if (path === '/api/inspirations/extract' && method === 'POST') {
      const input = await body();
      const text = String(input.text || '用散步时找到的三片叶子，做一张秋日拼贴。');
      const sample = copy(createDemoInspirations()[0]);
      return json({ rawInput: text, sourceText: text, ...(text.match(/https?:\/\/\S+/) ? { sourceUrl: text.match(/https?:\/\/\S+/)![0], sourceNotice: '演示中使用本地示例整理灵感。' } : {}), task: { ...sample.task, title: /声音/.test(text) ? '做一份声音盲盒' : /叶|拼贴/.test(text) ? sample.task.title : '把心动的小事做成一次尝试', description: text.length > 20 ? text.slice(0, 600) : `${text}，从身边现有的材料开始，留下一份小作品。` } });
    }
    if (path === '/api/inspirations' && method === 'POST') {
      const input = await body();
      if (!input.task || typeof input.task !== 'object') return json({ error: '请先整理这份灵感。' }, 400);
      const saved = { ...copy(input), id: id('demo-inspiration'), createdAt: new Date().toISOString(), enabled: true } as unknown as DemoInspiration;
      state.inspirations.unshift(saved);
      return json(saved);
    }
    const inspirationMatch = path.match(/^\/api\/inspirations\/([^/]+)$/);
    if (inspirationMatch) {
      const index = state.inspirations.findIndex(item => item.id === decodeURIComponent(inspirationMatch[1]));
      if (index < 0) return json({ error: '找不到这条灵感。' }, 404);
      if (method === 'DELETE') { state.inspirations.splice(index, 1); return new Response(null, { status: 204 }); }
      if (method === 'PATCH') { const input = await body(); state.inspirations[index].enabled = input.enabled === true; return json(state.inspirations[index]); }
    }
    if (path === '/api/tts' && method === 'POST') return new Response(null, { status: 204, headers: { 'X-Xian-Demo': 'true' } });
    if (path === '/api/trace/sessions' && method === 'GET') return json([]);
    if (path === '/api/trace/live' && method === 'GET') return sse([]);
    if (path.startsWith('/api/trace/session/') && method === 'GET') return json({ error: '演示模式没有真实模型调用日志。' }, 404);
    return json({ error: '这项接口尚未加入演示模式。', demo: true, path }, 501);
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), 'https://demo.local'), init);
    await delay(latencyMs, request.signal);
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (!path.startsWith('/api/')) return json({ error: '演示 transport 只处理 /api 请求。', demo: true }, 501);
    const requestId = request.headers.get('X-Request-Id');
    const cacheKey = requestId && request.method !== 'GET' && path !== '/api/tts' ? `${request.method}:${path}:${requestId}` : '';
    const cached = cacheKey ? state.requests[cacheKey] : undefined;
    if (cached) return new Response(cached.body, { status: cached.status, headers: { 'Content-Type': cached.contentType, 'X-Xian-Demo': 'true' } });
    const response = await route(request, path);
    if (cacheKey && response.ok && response.status !== 204) {
      state.requests[cacheKey] = { status: response.status, contentType: response.headers.get('Content-Type') || 'application/json', body: await response.clone().text() };
      const keys = Object.keys(state.requests);
      for (const key of keys.slice(0, Math.max(0, keys.length - 80))) delete state.requests[key];
    }
    persist();
    return response;
  }) as typeof fetch;
}

export { DEMO_PHOTO_URL, demoEvidenceImage };
