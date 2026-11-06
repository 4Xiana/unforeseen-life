import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GoalStore } from '../server/goal-store.js';
import { exampleInput, examplePlan, validatePlan, generateGoalPlan } from '../server/goal-planner.js';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { getProfile } from '../server/agent/profile/profile.js';
import { restoreSessionView } from '../src/session-restore.js';
import type { ActivityPlan } from '../server/agent/memory/types.js';
import { WorkingMemory } from '../server/agent/memory/working-memory.js';
import { StateMachine } from '../server/agent/fsm/state-machine.js';
import { createAtomTools } from '../server/agent/tools/atom-tools.js';
import { RunContext } from '../server/node_modules/@openai/agents/dist/index.js';

const ordinary: ActivityPlan[] = [{ id: 'one', title: '普通任务', hook: '散散步', tags: [], category: 'explore' }];
const info = { freeTime: '15分钟', scene: '家里' };
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'xian-goals-'));
  const filename = path.join(dir, 'goals.sqlite');
  const store = new GoalStore(filename);
  const goal = store.create('alice', exampleInput, examplePlan());
  return { dir, filename, store, goal, cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
function pick(store: GoalStore, id: string) {
  return store.mix('alice', ordinary, info, id, () => 0).find(a => a.journey)!;
}
function passed(activity: ActivityPlan) {
  activity.steps!.forEach((s, i) => { s.submittedEvidence = { type: s.submissionType, text: `真实记录${i}：空调低鸣、窗边鸟叫和打字声。` + '原文'.repeat(400), at: new Date().toISOString(), ...(s.submissionType === 'photo' ? { photoUrl: '/evidence/retained.jpg' } : {}) }; });
  return activity;
}

test('草稿不参与推荐；确认幂等，用户不能读取或修改他人的长程', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.store.mix('alice', ordinary, info, undefined, () => 0), ordinary);
    assert.deepEqual(f.store.list('bob'), []);
    assert.throws(() => f.store.changeStatus('bob', f.goal.id, 'confirm'));
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    assert.equal(f.store.changeStatus('alice', f.goal.id, 'confirm').status, 'active');
    assert.equal(pick(f.store, f.goal.id).journey?.ordinal, 1);
  } finally { f.cleanup(); }
});

test('50%边界、冷却、每批上限、时间和场景筛选；主动推进仍尊重场景', () => {
  const f = fixture();
  try {
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    const now = 100_000;
    assert.equal(f.store.mix('alice', ordinary, info, undefined, () => .5, now).length, 1);
    const first = f.store.mix('alice', ordinary, info, undefined, () => 0, now);
    assert.equal(first.filter(a => a.journey).length, 1);
    assert.ok(first.some(a => a.id === 'one'));
    assert.throws(() => f.store.mix('alice', [], info, f.goal.id));
    assert.equal(f.store.mix('alice', ordinary, info, undefined, () => 0, now + 1).length, 1);
    assert.equal(f.store.mix('alice', ordinary, info, undefined, () => 0, now + 1_200_000).length, 2);
    assert.equal(f.store.mix('alice', ordinary, info, f.goal.id, () => .99, now).length, 2);
    assert.throws(() => f.store.mix('alice', ordinary, { freeTime: '5分钟' }, f.goal.id));
    const plan = examplePlan(); plan.chapters[0].scene = 'outdoors';
    const outside = f.store.create('alice', exampleInput, plan);
    f.store.changeStatus('alice', outside.id, 'confirm');
    assert.throws(() => f.store.mix('alice', ordinary, info, outside.id));
    assert.equal(f.store.mix('alice', ordinary, { ...info, scene: '街上' }, outside.id).length, 2);
  } finally { f.cleanup(); }
});

test('同一章节只有一个会话能接取；暂停保留已接任务；完成后旧卡不可接取', () => {
  const f = fixture();
  try {
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    const a = pick(f.store, f.goal.id);
    f.store.claim('alice', a, 's1');
    assert.throws(() => f.store.claim('alice', a, 's2'));
    f.store.changeStatus('alice', f.goal.id, 'pause');
    assert.equal(f.store.mix('alice', ordinary, info, undefined, () => 0).length, 1);
    const updated = f.store.complete('alice', passed(a), 's1')!;
    assert.equal(updated.status, 'paused');
    assert.equal(updated.records.length, 1);
    f.store.changeStatus('alice', f.goal.id, 'resume');
    assert.throws(() => f.store.claim('alice', a, 's2'));
    assert.equal(pick(f.store, f.goal.id).journey?.ordinal, 2);
  } finally { f.cleanup(); }
});

test('缺少证物、照片引用或篡改步骤都不能结算；完整原文、奖励持久化且不会重复发放', () => {
  const f = fixture();
  try {
    const photoPlan = examplePlan(); photoPlan.chapters[0].steps[0].submissionType = 'photo';
    const goal = f.store.create('alice', exampleInput, photoPlan);
    f.store.changeStatus('alice', goal.id, 'confirm');
    const a = pick(f.store, goal.id);
    f.store.claim('alice', a, 's1');
    assert.throws(() => f.store.complete('alice', a, 's1'));
    passed(a);
    delete a.steps![0].submittedEvidence!.photoUrl;
    assert.throws(() => f.store.complete('alice', a, 's1'));
    passed(a);
    const bad = structuredClone(a); bad.steps![0].instruction = '点击完成';
    assert.throws(() => f.store.complete('alice', bad, 's1'));
    f.store.complete('alice', a, 's1');
    assert.equal(f.store.complete('alice', a, 's1')!.rewards.length, 1);
    const reopened = new GoalStore(f.filename);
    try {
      const saved = reopened.get('alice', goal.id);
      assert.deepEqual(saved.records[0].steps, a.steps);
      assert.equal(saved.records[0].steps[0].submittedEvidence?.photoUrl, '/evidence/retained.jpg');
      const second = pick(reopened, goal.id);
      assert.match(second.journey!.previous, /空调低鸣/);
      assert.match(reopened.evidenceContext('alice', goal.id), /retained.jpg/);
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test('依次完成全部章节后形成成果册和三枚专属奖励；崩溃恢复补结算幂等', () => {
  const f = fixture();
  try {
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    for (let i = 0; i < 3; i++) {
      const a = passed(pick(f.store, f.goal.id));
      f.store.claim('alice', a, `s${i}`);
      const memory = new WorkingMemory();
      memory.setSelectedActivity(a); memory.setState('S3');
      f.store.reconcile('alice', `s${i}`, memory.snapshot());
      f.store.reconcile('alice', `s${i}`, memory.snapshot());
    }
    const goal = f.store.get('alice', f.goal.id);
    assert.equal(goal.status, 'completed');
    assert.equal(goal.records.length, 3);
    assert.deepEqual(goal.rewards.map(r => r.id), ['first', 'half', 'complete']);
    assert.equal(f.store.mix('alice', ordinary, info, undefined, () => 0).length, 1);
  } finally { f.cleanup(); }
});

test('放下任务后可以重新接取；定向推荐意图可随会话恢复', () => {
  const f = fixture();
  try {
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    const a = pick(f.store, f.goal.id);
    f.store.claim('alice', a, 'old'); f.store.release('alice', 'old');
    f.store.claim('alice', a, 'new');
    assert.equal(f.store.get('alice', f.goal.id).inProgress?.sessionId, 'new');
    const memory = new WorkingMemory(); memory.requestedGoalId = f.goal.id;
    assert.equal(new WorkingMemory(memory.snapshot()).requestedGoalId, f.goal.id);
  } finally { f.cleanup(); }
});

test('模型工具不能改写长程步骤、跳步或无证物毕业；普通任务仍可生成步骤', async () => {
  const f = fixture();
  try {
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    const a = pick(f.store, f.goal.id); f.store.claim('alice', a, 's1');
    const memory = new WorkingMemory(); memory.setSelectedActivity(a); memory.setState('S2');
    const events: Record<string, unknown>[] = [];
    const tools = createAtomTools({ memory, fsm: new StateMachine(memory), emit: e => events.push(e), hasSpoken: () => true, isGraduationReady: () => true, validateCompletion: act => f.store.validateCompletion('alice', act, 's1') });
    const invoke = async (name: string, args: unknown) => JSON.parse(await tools.find(t => t.name === name)!.invoke(new RunContext(), JSON.stringify(args)) as string);
    const publish = { step_index: 0, instruction: '假的步骤', submission_type: 'text', proof_prompt: '点击就好' };
    assert.equal((await invoke('publish_step', { ...publish, step_index: 1 })).success, false);
    assert.equal((await invoke('publish_step', publish)).success, true);
    assert.equal((events.at(-1)!.step as { instruction: string }).instruction, a.steps![0].instruction);
    assert.equal((await invoke('request_state_change', { target_state: 'S3', reason: '完成了' })).success, false);
    assert.equal(memory.recordStepEvidence({ type: 'photo', text: '错误类型的证物', photoUrl: '/evidence/test.jpg' }), false);
    assert.equal(memory.recordStepEvidence({ type: 'text', text: '  ' }), false);
    memory.recordStepEvidence({ type: 'text', text: '空调、鸟叫和键盘声' });
    assert.equal((await invoke('publish_step', { ...publish, step_index: 1 })).success, true);
    memory.recordStepEvidence({ type: 'text', text: '鸟叫像清亮的短笛，名字叫窗边来客' });
    assert.equal((await invoke('request_state_change', { target_state: 'S3', reason: '全部完成' })).success, true);
    memory.setState('S2'); memory.setSelectedActivity(ordinary[0]);
    const planned = await invoke('design_activity_steps', { steps: examplePlan().chapters[0].steps });
    assert.equal(planned.success, true);
    assert.equal(memory.selected!.steps!.length, 2);
  } finally { f.cleanup(); }
});

test('自定义计划必须有完整章节、证物要求并满足用户时长场景', () => {
  assert.throws(() => validatePlan({ title: '随便做做', chapters: [] }, exampleInput));
  const tooLong = examplePlan(); tooLong.chapters[1].minutes = 60;
  assert.throws(() => validatePlan(tooLong, exampleInput));
  const otherScene = examplePlan(); otherScene.chapters[1].scene = 'outdoors';
  assert.throws(() => validatePlan(otherScene, { ...exampleInput, scene: 'home' }));
  const valid = validatePlan(examplePlan(), exampleInput);
  assert.equal(valid.chapters[0].steps[0].completionCriteria, valid.chapters[0].steps[0].proofPrompt);
  const multiDay = examplePlan();
  multiDay.chapters[1].steps[0].instruction = '在接下来三个可用的日子里，每次记录一处变化。';
  assert.throws(() => validatePlan(multiDay, exampleInput), /一次空闲/);
  const photo = examplePlan(); photo.chapters[0].steps[0].submissionType = 'photo';
  assert.throws(() => validatePlan(photo, { ...exampleInput, avoid: '不拍照' }), /不能要求照片/);
  const confirmation = examplePlan(); confirmation.chapters[0].steps[0].proofPrompt = '请提交一句确认：已经整理好了所有材料。';
  assert.throws(() => validatePlan(confirmation, exampleInput), /实际内容/);
});

test('草稿修改原位保存；确认后或跨用户修改被拒绝，不覆盖已经开启的计划', () => {
  const f = fixture();
  try {
    const input = { ...exampleInput, motivation: '想留下三页具体的观察' };
    const plan = examplePlan(); plan.title = '我的安静三页';
    const updated = f.store.reviseDraft('alice', f.goal.id, input, plan);
    assert.equal(updated.id, f.goal.id);
    assert.equal(f.store.list('alice').length, 1);
    assert.equal(updated.input.motivation, input.motivation);
    assert.throws(() => f.store.reviseDraft('bob', f.goal.id, input, plan));
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    // 模拟生成过程中另一个标签页确认：迟到的生成结果不得覆盖定稿。
    assert.throws(() => f.store.reviseDraft('alice', f.goal.id, exampleInput, examplePlan()));
    assert.equal(f.store.get('alice', f.goal.id).plan.title, plan.title);
  } finally { f.cleanup(); }
});

test('自定义生成读取长期档案和目标补充，默认零花费且不传送身份标识', async () => {
  let received: { messages: { content: string }[] } | undefined;
  let calls = 0;
  let alwaysInvalid = false;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    calls++;
    const plan = examplePlan();
    if (calls === 1 || alwaysInvalid) plan.chapters[1].steps[0].instruction = '连续三天，每天记下一种声音。';
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const prior = { key: process.env.OPENAI_API_KEY, url: process.env.OPENAI_BASE_URL };
  try {
    const port = (server.address() as { port: number }).port;
    process.env.OPENAI_API_KEY = 'fixture';
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
    const profile = { ...await getProfile('planner-fixture'), onboarded: true, interests: '纸笔记录', avoids: '不参与多人活动', social: 'solo' as const };
    const plan = await generateGoalPlan(exampleInput, profile);
    assert.equal(plan.chapters.length, 3);
    const user = received!.messages[1].content;
    assert.match(user, /纸笔记录/);
    assert.match(user, /不参与多人活动/);
    assert.match(user, /安静、文字、小小的发现/);
    assert.match(user, /默认零额外花费/);
    assert.ok(!user.includes('planner-fixture'));
    assert.equal(profile.avoids, '不参与多人活动');
    assert.equal(calls, 2);
    assert.match(received!.messages.at(-1)!.content, /跨日观察/);
    alwaysInvalid = true;
    await assert.rejects(generateGoalPlan(exampleInput, profile), /未保存为目标/);
    assert.equal(calls, 4, '结构修正最多一次，不能无限重试');
  } finally {
    for (const [key, value] of [['OPENAI_API_KEY', prior.key], ['OPENAI_BASE_URL', prior.url]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('升级前的执行中会话刷新后仍能找到长程前序成果', () => {
  const f = fixture();
  try {
    f.store.changeStatus('alice', f.goal.id, 'confirm');
    const activity = pick(f.store, f.goal.id);
    const step = { ...activity.steps![0], index: 0 };
    const view = restoreSessionView({
      sessionId: 'legacy-session', clientId: 'alice', status: 'idle',
      snapshot: { fsmState: 'S2', proposedActivities: [activity], selectedActivity: activity, currentStepIndex: 0 },
      events: [{ id: 1, at: 1, event: { type: 'step_published', step, total: 2, activityTitle: activity.title } }],
    });
    assert.equal(view.quest?.steps[0].journey?.goalId, f.goal.id);
    const restored = view.timeline.find(item => item.kind === 'step');
    assert.ok(restored?.kind === 'step' && restored.step.journey?.goalId === f.goal.id);
  } finally { f.cleanup(); }
});

test('模型不调用选卡工具时，确定性兜底仍接取章节且不能绕过暂停', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'xian-fallback-'));
  try {
    execFileSync(process.execPath, ['--import', './server/node_modules/tsx/dist/loader.mjs', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { Coordinator } from './server/agent/coordinator/coordinator.ts';
      import { LLMRunnerProvider } from './server/agent/llm/runner-provider.ts';
      import { WorkingMemory } from './server/agent/memory/working-memory.ts';
      import { getGoalStore } from './server/goal-store.ts';
      import { exampleInput, examplePlan } from './server/goal-planner.ts';
      LLMRunnerProvider.prototype.invoke = async () => ({ success: true, visibleOutput: '', toolCalls: [] });
      const store = getGoalStore();
      for (const paused of [false, true]) {
        const goal = store.create('alice', exampleInput, examplePlan());
        store.changeStatus('alice', goal.id, 'confirm');
        const info = { freeTime: '15分钟', scene: '家里' };
        const activities = store.mix('alice', [{id:'ordinary', title:'普通任务',hook:'休息',tags:[],category:'sense'}], info, goal.id);
        const chosen = activities.find(a => a.journey);
        if (paused) store.changeStatus('alice', goal.id, 'pause');
        const memory = new WorkingMemory();
        memory.updateCollectedInfo(info); memory.setProposedActivities(activities); memory.setState('S1');
        const sessionId = paused ? 'paused' : 'active';
        const coordinator = new Coordinator(sessionId, 'alice', undefined, memory.snapshot());
        await coordinator.process({kind:'select_activity',activityId:chosen.id}, () => {});
        assert.equal(coordinator.snapshot().fsmState, paused ? 'S1' : 'S2');
        assert.equal(store.get('alice', goal.id).inProgress?.sessionId, paused ? undefined : sessionId);
      }
      store.close();
    `], { env: { ...process.env, XIAN_DATA_DIR: dir, OPENAI_API_KEY: 'fixture' }, timeout: 15_000, stdio: 'pipe' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
