import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { QuestThreadStore } from '../server/quest-threads';
import { buildThreadRoutes, explorationPrompt } from '../src/thread-map';
import type { QuestRecord } from '../src/types';
import type { Goal } from '../server/goals-types';

test('主题归属隔离、记录验证、去重与重启后保存；移除主题保留记录', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'xian-threads-'));
  const filename = path.join(dir, 'threads.sqlite');
  let store = new QuestThreadStore(filename);
  const records = new Set(['a', 'b']);
  try {
    const created = store.save('alice', { title: ' 街区观察 ', description: '声音与散步', questIds: ['a', 'b', 'a'] }, records);
    assert.equal(created.title, '街区观察');
    assert.deepEqual(created.questIds, ['a', 'b']);
    assert.deepEqual(store.list('bob'), []);
    assert.throws(() => store.get('bob', created.id));
    assert.throws(() => store.save('bob', { title: '误改', questIds: ['a'] }, records, created.id));
    assert.throws(() => store.remove('bob', created.id));
    assert.throws(() => store.save('alice', { title: '他人经历', questIds: ['not-owned'] }, records));
    assert.throws(() => store.save('alice', { title: '', questIds: ['a'] }, records));
    assert.throws(() => store.save('alice', { title: '空主题', questIds: [] }, records));
    assert.throws(() => store.save('alice', { title: '很'.repeat(61), questIds: ['a'] }, records));
    const edited = store.save('alice', { title: '认识我的街区', description: '', questIds: ['b'] }, records, created.id);
    assert.equal(edited.createdAt, created.createdAt);
    store.close(); store = new QuestThreadStore(filename);
    assert.deepEqual(store.get('alice', created.id), edited);
    store.remove('alice', created.id);
    assert.deepEqual(store.list('alice'), []);
    assert.deepEqual([...records], ['a', 'b']);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

const quests: QuestRecord[] = [
  { id: 'late', title: '同名体验', category: 'create', date: '2026-11-20', steps: 1, tags: [], evidence: '晚一点的真实作品' },
  { id: 'early', title: '同名体验', category: 'sense', date: '2026-11-01', steps: 1, tags: [], evidence: '早一点的真实作品' },
];
test('跨分类的主题按真实时间连接，不凭标题合并，不修改原数组', () => {
  const thread = { id: 't', title: '我的街区', description: '记录声音', questIds: ['late', 'early', 'late', 'missing'], createdAt: '', updatedAt: '' };
  const routes = buildThreadRoutes(quests, [thread], []);
  assert.equal(routes.filter(r => r.kind === 'category').length, 5);
  const custom = routes[0];
  assert.deepEqual(custom.stops.map(s => s.id), ['early', 'late']);
  assert.equal(custom.stops[0].record?.evidence, '早一点的真实作品');
  assert.equal(routes.find(r => r.category === 'sense')?.stops.length, 1);
  assert.deepEqual(quests.map(q => q.id), ['late', 'early']);
  assert.match(explorationPrompt(custom), /我的街区/);
  assert.match(explorationPrompt(custom), /记录声音/);
  assert.match(explorationPrompt(custom), /相关的新玩法/);
  assert.match(explorationPrompt(custom), /早一点的真实作品/);
  assert.equal(buildThreadRoutes([], [], []).every(r => !r.stops.length), true);
});

test('心愿只以真实章节记录标记完成，保留原始证物；草稿不冒充解锁', () => {
  const chapters = [1, 2, 3].map(n => ({ id: `c${n}`, title: `第${n}章`, purpose: '积累观察', connection: '用上次的发现继续', outcome: '一段记录', minutes: 10, scene: 'home' as const, category: 'sense' as const, steps: [] }));
  const evidence = { type: 'text' as const, text: '窗外鸟鸣和树叶声', at: '2026-11-01' };
  const goal: Goal = { id: 'g', status: 'active', createdAt: '', input: { wish: '', motivation: '', preferences: '', avoid: '', minutes: 15, scene: 'home' },
    plan: { title: '声音小册', outcome: '一本册子', chapters }, rewards: [], records: [{ chapterId: 'c1', sessionId: 's', at: '2026-11-01', steps: [{ instruction: '听一听', submissionType: 'text', completionCriteria: '', submittedEvidence: evidence }] }] };
  const route = buildThreadRoutes([], [], [goal])[0];
  assert.deepEqual(route.stops.map(s => s.status), ['done', 'next', 'locked']);
  assert.deepEqual(route.stops[0].record?.stepDetails?.[0].evidence, evidence);
  assert.equal(route.stops[1].record, undefined);
  goal.inProgress = { chapterId: 'c2', sessionId: 's' };
  assert.equal(buildThreadRoutes([], [], [goal])[0].stops[1].status, 'active');
  goal.status = 'draft'; goal.records = []; delete goal.inProgress;
  assert.equal(buildThreadRoutes([], [], [goal])[0].stops.every(s => s.status === 'planned'), true);
});
