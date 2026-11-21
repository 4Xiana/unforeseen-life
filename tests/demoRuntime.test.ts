import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoFetch, DEMO_STATE_KEY } from '../src/demo/transport';
import { restoreSessionView } from '../src/session-restore';
import { createDemoActivities, demoStepSample } from '../src/demo/fixtures';
import { OUTCOME_ORDER, recordOutcomes } from '../src/outcome-meta';

function runtime() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let fetchDemo = createDemoFetch({ storage, latencyMs: 0 });
  const request = (path: string, method = 'GET', body?: unknown, requestId?: string) => fetchDemo(`https://demo.local/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(requestId ? { 'X-Request-Id': requestId } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = async (path: string, method = 'GET', body?: unknown) => {
    const response = await request(path, method, body);
    assert.equal(response.ok, true, await response.clone().text());
    return response.json();
  };
  const turn = async (session: string, body: unknown, requestId?: string) => {
    const response = await request(`/session/${session}/message`, 'POST', body, requestId);
    assert.equal(response.ok, true, await response.clone().text());
    return (await response.text()).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
  };
  const photo = async (session: string) => {
    const body = new FormData();
    body.set('photo', new Blob(['sample'], { type: 'image/svg+xml' }), 'sample.svg');
    body.set('description', '这次作品收好了。');
    const response = await fetchDemo(`https://demo.local/api/session/${session}/photo`, { method: 'POST', body });
    assert.equal(response.ok, true);
    return response.text();
  };
  return { storage, values, request, json, turn, photo, reload: () => { fetchDemo = createDemoFetch({ storage, latencyMs: 0 }); } };
}

test('预置五个方向、完整画像、主题、心愿与灵感；换一批提供不同内容', async () => {
  const r = runtime();
  const handbook = await r.json('/handbook');
  assert.equal(handbook.quests.length, 15);
  assert.deepEqual([...new Set(handbook.quests.flatMap(recordOutcomes))].sort(), [...OUTCOME_ORDER].sort());
  const profile = await r.json('/profile');
  assert.equal(profile.mbti, 'INFP');
  assert.equal(Object.keys(profile.pairVotes).length, 30);
  assert.equal(profile.fitting.reviewed, 30);
  assert.equal((await r.json('/quest-threads')).length, 2);
  assert.deepEqual((await r.json('/goals')).map((goal: { status: string }) => goal.status), ['active', 'draft', 'completed']);
  assert.equal((await r.json('/inspirations')).length, 3);
  assert.equal(createDemoActivities(0).some(a => createDemoActivities(1).some(b => b.id === a.id)), false);
  assert.match(demoStepSample('把魔术表演给朋友').text, /硬币/);
});

test('推荐、辅助聊天、文本与照片提交、奖励、刷新恢复及重试幂等', async () => {
  const r = runtime();
  const { sessionId } = await r.json('/session', 'POST', {});
  const proposed = await r.turn(sessionId, { type: 'text', text: '帮我找支线' });
  const activities = proposed.find(e => e.type === 'activities_proposed').activities;
  await r.turn(sessionId, { type: 'select_activity', activityId: activities[0].id });
  const help = await r.turn(sessionId, { type: 'text', text: '为什么要做这一步？' });
  assert.equal(help.some(e => e.type === 'step_published' || e.type === 'task_completed'), false);
  assert.equal((await r.json(`/session/${sessionId}`)).snapshot.currentStepIndex, 0);
  const first = await r.turn(sessionId, { type: 'submit_text', text: '鸟鸣、水声和脚步' }, 'first-submit');
  assert.equal(first.find(e => e.type === 'step_published').step.index, 1);
  r.reload();
  const retry = await r.turn(sessionId, { type: 'submit_text', text: '鸟鸣、水声和脚步' }, 'first-submit');
  assert.deepEqual(retry, first);
  assert.equal((await r.json(`/session/${sessionId}`)).snapshot.currentStepIndex, 1);
  const rejected = await r.turn(sessionId, { type: 'submit_text', text: '不能代替照片' });
  assert.equal(rejected.find(e => e.type === 'evidence_reviewed').review.verdict, 'reject');
  await r.photo(sessionId);
  const done = await r.turn(sessionId, { type: 'submit_text', text: '窗边的慢时光' }, 'complete-submit');
  assert.ok(done.some(e => e.type === 'task_completed'));
  await r.turn(sessionId, { type: 'submit_text', text: '窗边的慢时光' }, 'complete-submit');
  assert.equal((await r.json('/handbook')).quests.length, 16);
  r.reload();
  const saved = await r.json('/session/active');
  assert.equal(saved.snapshot.fsmState, 'S3');
  const restored = restoreSessionView(saved);
  assert.equal(restored.quest?.steps.length, 3);
  assert.equal(restored.questHistory.filter(q => q.status === 'done').length, 1);
});

test('心愿草稿确认、继续章节、放下和完成均能持久恢复', async () => {
  const r = runtime();
  const draft = await r.json('/goals', 'POST', { example: true });
  const active = await r.json(`/goals/${draft.id}/status`, 'POST', { action: 'confirm' });
  assert.equal(active.status, 'active');
  let { sessionId } = await r.json('/session', 'POST', {});
  await r.turn(sessionId, { type: 'text', goalId: draft.id, text: '继续心愿' });
  assert.equal((await r.json(`/goals/${draft.id}`)).inProgress.sessionId, sessionId);
  await r.turn(sessionId, { type: 'abandon' });
  assert.equal((await r.json(`/goals/${draft.id}`)).inProgress, undefined);
  ({ sessionId } = await r.json('/session', 'POST', {}));
  await r.turn(sessionId, { type: 'text', goalId: draft.id, text: '继续心愿' });
  await r.json('/session', 'POST', {});
  assert.equal((await r.json(`/goals/${draft.id}`)).inProgress, undefined, 'Presenter switching releases the previous sample chapter');
  assert.equal((await r.json(`/session/${sessionId}`)).snapshot.fsmState, 'S0');
  for (let index = 0; index < 3; index++) {
    ({ sessionId } = await r.json('/session', 'POST', {}));
    await r.turn(sessionId, { type: 'text', goalId: draft.id, text: '继续心愿' });
    await r.turn(sessionId, { type: 'submit_text', text: '今天的发现' });
    await r.photo(sessionId);
    r.reload();
    assert.equal((await r.json(`/goals/${draft.id}`)).records.length, index + 1);
  }
  const completed = await r.json(`/goals/${draft.id}`);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.inProgress, undefined);
  assert.equal(completed.rewards.length, 3);
});

test('主题、灵感和喜好变更只写演示存储，未知接口拒绝并支持中止', async () => {
  const r = runtime();
  const input = { title: '我的主题', description: '声音与朋友', questIds: ['demo-quest-1', 'demo-quest-1', 'unknown'] };
  const thread = await r.json('/quest-threads', 'POST', input);
  assert.deepEqual(thread.questIds, ['demo-quest-1']);
  await r.json(`/quest-threads/${thread.id}`, 'PUT', { ...input, title: '新的名字' });
  r.reload();
  assert.equal((await r.json('/quest-threads'))[0].title, '新的名字');
  await r.json(`/quest-threads/${thread.id}`, 'DELETE');
  const extracted = await r.json('/inspirations/extract', 'POST', { text: '用叶子做拼贴' });
  const inspiration = await r.json('/inspirations', 'POST', extracted);
  await r.json(`/inspirations/${inspiration.id}`, 'PATCH', { enabled: false });
  assert.equal((await r.json('/inspirations'))[0].enabled, false);
  assert.equal((await r.request(`/inspirations/${inspiration.id}`, 'DELETE')).status, 204);
  const profile = await r.json('/profile', 'PUT', { mbti: 'ENFP', pairVotes: { 'unknown': 'A' } });
  assert.equal(profile.mbti, 'ENFP');
  assert.deepEqual(profile.pairVotes, {});
  assert.deepEqual([...r.values.keys()], [DEMO_STATE_KEY]);
  assert.equal((await r.request('/not-a-real-route')).status, 501);
  const controller = new AbortController(); controller.abort();
  const fetchDemo = createDemoFetch({ storage: r.storage, latencyMs: 20 });
  await assert.rejects(fetchDemo('https://demo.local/api/handbook', { signal: controller.signal }), { name: 'AbortError' });
});
