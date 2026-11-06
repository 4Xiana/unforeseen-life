import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { SessionStore } from '../server/session-store.js';
import { WorkingMemory } from '../server/agent/memory/working-memory.js';
import { restoreSessionView } from '../src/session-restore.js';

function snapshot() {
  const memory = new WorkingMemory();
  memory.setState('S2');
  memory.updateCollectedInfo({ freeTime: '30分钟', scene: '家' });
  memory.setSelectedActivity({
    id: 'sounds', title: '声音收藏', hook: '听见房间里的细节', category: 'sense', tags: ['室内'],
    steps: [
      { instruction: '列出三种声音', submissionType: 'text', completionCriteria: '三种声音', proofPrompt: '列出三种声音', submittedEvidence: { type: 'text', text: '键盘、空调、车声', at: '2026-11-05T00:00:00Z' } },
      { instruction: '拍下声音来源', submissionType: 'photo', completionCriteria: '现场照与来源', proofPrompt: '拍现场照并写出声音来源' },
    ],
  });
  memory.setStepIndex(1);
  memory.appendTranscript('user', '听到了键盘和空调');
  return memory.snapshot();
}

test('重开 SQLite 后，任务步骤、已验收证物、完整原文和照片仍可恢复', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'xian-save-'));
  const filename = path.join(dir, 'sessions.sqlite');
  let store = new SessionStore(filename);
  try {
    const state = snapshot();
    store.create('s1', 'u1', state);
    const original = '原始证物'.repeat(1000);
    assert.equal(store.begin('s1', 'r1', { text: original }, { type: 'user_message', content: original, imageUrl: '/evidence/test.jpg' }, state), 'started');
    store.append('s1', state, { type: 'turn_start' });
    store.append('s1', state, { type: 'text_delta', text: '键盘和空调都找到了。' });
    store.append('s1', state, { type: 'step_published', step: { ...state.selectedActivity!.steps![1], index: 1 }, total: 2, activityTitle: '声音收藏' });
    store.finish('s1', 'r1', state);
    store.close();
    store = new SessionStore(filename);
    const saved = store.get('s1', 'u1')!;
    assert.equal(saved.status, 'idle');
    assert.deepEqual(new WorkingMemory(saved.snapshot).snapshot().selectedActivity, state.selectedActivity);
    assert.equal(saved.snapshot.currentStepIndex, 1);
    const view = restoreSessionView(saved);
    assert.equal(view.timeline[0].kind, 'user');
    assert.equal((view.timeline[0] as { content: string }).content, original);
    assert.equal((view.timeline[0] as { imageUrl: string }).imageUrl, '/evidence/test.jpg');
    assert.equal(view.quest?.steps[0].index, 1);
    assert.equal((view.timeline[1] as { content: string }).content, '键盘和空调都找到了。');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('用户隔离、最新会话定位与重复/并发请求门控', () => {
  const store = new SessionStore(':memory:');
  try {
    const state = snapshot();
    store.create('s1', 'u1', state);
    store.create('s2', 'u2', state);
    assert.equal(store.get('s1', 'u2'), null);
    assert.equal(store.latest('u2')?.sessionId, 's2');
    assert.equal(store.latest('new-user'), null);
    assert.equal(store.begin('s1', 'r1', {}, { type: 'user_message' }, state), 'started');
    assert.equal(store.begin('s1', 'r1', {}, { type: 'user_message' }, state), 'duplicate');
    assert.equal(store.begin('s1', 'r2', {}, { type: 'user_message' }, state), 'busy');
    store.finish('s1', 'r1', state);
    assert.equal(store.begin('s1', 'r1', {}, { type: 'user_message' }, state), 'duplicate');
    assert.equal(store.get('s1', 'u1')?.events.length, 1);
  } finally { store.close(); }
});

test('处理中重启标记中断，保留已经提交的原始输入且不自动重跑', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'xian-interrupt-'));
  const filename = path.join(dir, 'sessions.sqlite');
  let store = new SessionStore(filename);
  try {
    const state = snapshot();
    store.create('s1', 'u1', state);
    store.begin('s1', 'r1', { text: '保留我' }, { type: 'user_message', content: '保留我' }, state);
    store.close();
    store = new SessionStore(filename);
    assert.equal(store.get('s1', 'u1')?.status, 'interrupted');
    assert.equal(store.get('s1', 'u1')?.events.length, 1);
    assert.equal(store.begin('s1', 'r1', {}, {}, state), 'duplicate');
    assert.equal(store.begin('s1', 'r2', {}, {}, state), 'started');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('重发第 1 步不会产生新任务；完成归档与多回合文字不会串联', () => {
  const state = snapshot();
  const step = { index: 0, instruction: '听声音', submissionType: 'text' as const };
  const events = [
    { type: 'state_changed', to: 'S2' },
    { type: 'step_published', step, total: 2, activityTitle: '声音收藏' },
    { type: 'turn_start' }, { type: 'text_delta', text: '还差一种。' },
    { type: 'step_published', step, total: 2, activityTitle: '声音收藏' },
    { type: 'turn_start' }, { type: 'text_delta', text: '现在齐了。' },
    { type: 'state_changed', to: 'S3' }, { type: 'state_changed', to: 'S3' },
  ].map((event, id) => ({ id, at: id, event }));
  const view = restoreSessionView({ sessionId: 's1', clientId: 'u1', status: 'idle', snapshot: { ...state, fsmState: 'S3' }, events });
  assert.equal(view.questHistory.length, 1);
  assert.equal(view.questHistory[0].status, 'done');
  assert.equal(view.quest?.steps.length, 1);
  assert.deepEqual(view.timeline.filter(it => it.kind === 'npc').map(it => (it as { content: string }).content), ['还差一种。', '现在齐了。']);
});

test('推进后尚未发布卡片时中断，可恢复当前步骤入口', () => {
  const view = restoreSessionView({ sessionId: 's1', clientId: 'u1', status: 'interrupted', snapshot: snapshot(), events: [] });
  assert.equal(view.quest?.steps[0].index, 1);
  assert.equal(view.timeline[0].kind, 'step');
});

test('实际 HTTP 服务重启后仍返回会话，读写接口拒绝其他用户', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'xian-http-'));
  const store = new SessionStore(path.join(dir, 'sessions.sqlite'));
  store.create('persisted', 'owner', snapshot());
  store.close();
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { LLMRunnerProvider } from './dist/agent/llm/runner-provider.js';
    LLMRunnerProvider.prototype.invoke = async function (params) {
      params.streamTextCallback?.('慢慢来。');
      return { success: true, visibleOutput: '慢慢来。', toolCalls: [] };
    };
    await import('./dist/index.js');
  `], {
    cwd: path.resolve('server'), env: { ...process.env, XIAN_DATA_DIR: dir, PORT: '5198', OPENAI_API_KEY: 'test-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server startup timeout')), 10000);
      child.stdout.on('data', data => {
        if (String(data).includes('server running')) { clearTimeout(timeout); resolve(); }
      });
      child.once('error', err => { clearTimeout(timeout); reject(err); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`server exit ${code}`)); });
    });
    const base = 'http://localhost:5198/api/session';
    const res = await fetch(`${base}/persisted`, { headers: { 'X-Client-Id': 'owner' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).snapshot.currentStepIndex, 1);
    assert.equal((await fetch(`${base}/persisted`, { headers: { 'X-Client-Id': 'other' } })).status, 404);
    assert.equal((await fetch(`${base}/persisted/message`, { method: 'POST', headers: { 'X-Client-Id': 'other', 'Content-Type': 'application/json' }, body: '{"type":"text","text":"不会发送到模型"}' })).status, 404);
    const active = await fetch(`${base}/active`, { headers: { 'X-Client-Id': 'owner' } });
    assert.equal((await active.json()).sessionId, 'persisted');
    const empty = await fetch(`${base}/active`, { headers: { 'X-Client-Id': 'new-user' } });
    assert.equal(await empty.json(), null);
    const message = '我想慢一点，原始文字完整保留。'.repeat(40);
    const options = {
      method: 'POST',
      headers: { 'X-Client-Id': 'owner', 'X-Request-Id': 'resume-message', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', text: message }),
    };
    const resumed = await fetch(`${base}/persisted/message`, options);
    assert.equal(resumed.status, 200);
    assert.match(await resumed.text(), /turn_complete/);
    const updated = await (await fetch(`${base}/persisted`, { headers: { 'X-Client-Id': 'owner' } })).json();
    assert.equal(updated.snapshot.currentStepIndex, 1);
    assert.equal(updated.status, 'idle');
    assert.equal(updated.events.find((e: { event: { type: string } }) => e.event.type === 'user_message').event.content, message);
    assert.equal((await fetch(`${base}/persisted/message`, options)).status, 409);
    const unchanged = await (await fetch(`${base}/persisted`, { headers: { 'X-Client-Id': 'owner' } })).json();
    assert.equal(unchanged.events.length, updated.events.length);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    rmSync(dir, { recursive: true, force: true });
  }
});
