import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadGraph } from '../src/thread-graph';
import { buildThreadRoutes, type ThreadRoute } from '../src/thread-map';
import { recordOutcomes } from '../src/outcome-meta';
import type { QuestRecord, QuestCategory, DesiredOutcome } from '../src/types';

function quest(id: string, category: QuestCategory, date: string): QuestRecord {
  return { id, category, date, title: `经历 ${id}`, tags: [], steps: 1, evidence: `作品 ${id}` };
}
function theme(id: string, ids: string[]) {
  return { id, title: id, description: '', questIds: ids, createdAt: '', updatedAt: '' };
}

test('一次经历只出现一个节点，跨方向主题准确连接，方向只连接同组经历', () => {
  const quests = [quest('late', 'create', '2026-11-03'), quest('early', 'explore', '2026-11-01'), quest('middle', 'explore', '2026-11-02')];
  const graph = buildThreadGraph(buildThreadRoutes(quests, [theme('街区', ['early', 'late'])], []), quests);
  assert.deepEqual(graph.nodes.map(node => node.id), ['early', 'middle', 'late']);
  assert.deepEqual(graph.nodes.map(node => node.y), [48, 112, 176]);
  assert.deepEqual(graph.nodes.map(node => node.x), [0.3, 0.3, 0.5]);
  assert.equal(graph.nodes[0].routeIds.includes('custom:街区'), true);
  const categoryEdge = graph.edges.find(edge => edge.from === 'early' && edge.to === 'middle')!;
  assert.deepEqual(categoryEdge.kinds, ['category']);
  const chosenEdge = graph.edges.find(edge => edge.from === 'early' && edge.to === 'late')!;
  assert.deepEqual(chosenEdge.kinds, ['custom']);
  assert.equal(graph.edges.some(edge => edge.from === 'middle' && edge.to === 'late'), false);
  assert.deepEqual(quests.map(q => q.id), ['late', 'early', 'middle'], 'layout must not reorder caller records');
  assert.equal(graph.nodes[0].record.evidence, '作品 early');
});

test('重合连线只绘制一次，同时保留方向及多个主题来源', () => {
  const quests = [quest('a', 'create', '2026-11-01'), quest('b', 'create', '2026-11-02')];
  const routes = buildThreadRoutes(quests, [theme('一', ['a', 'b', 'a']), theme('二', ['a', 'b'])], []);
  const graph = buildThreadGraph(routes, [...quests, { ...quests[0], evidence: '不要混入重复条目的证物' }]);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.edges[0].kinds, ['category', 'custom']);
  assert.deepEqual(new Set(graph.edges[0].sourceIds), new Set(['outcome:express', 'custom:一', 'custom:二']));
  assert.equal(graph.edges[0].sources.filter(source => source.kind === 'custom').length, 2);
  assert.equal(graph.nodes[0].record.evidence, '作品 a');
});

test('最近20次的边界可展开，隐藏端点不会泄漏到可见连线，路线归属仍保留全量', () => {
  const quests = Array.from({ length: 25 }, (_, index) => quest(`q${index}`, 'sense', `2026-11-${String(index + 1).padStart(2, '0')}`));
  const routes = buildThreadRoutes(quests, [theme('声音', quests.map(q => q.id))], []);
  const limited = buildThreadGraph(routes, quests);
  assert.equal(limited.totalCount, 25);
  assert.equal(limited.hiddenCount, 5);
  assert.equal(limited.nodes[0].id, 'q5');
  assert.equal(limited.nodes.at(-1)!.id, 'q24');
  assert.equal(limited.routeRecordIds['custom:声音'].length, 25);
  assert.equal(limited.visibleRouteRecordIds['custom:声音'].length, 20);
  assert.equal(limited.edges.length, 19);
  const visible = new Set(limited.nodes.map(node => node.id));
  assert.equal(limited.edges.every(edge => visible.has(edge.from) && visible.has(edge.to)), true);
  const expanded = buildThreadGraph(routes, quests, { limit: Infinity });
  assert.equal(expanded.nodes.length, 25);
  assert.equal(expanded.hiddenCount, 0);
  assert.equal(expanded.edges.length, 24);
  assert.equal(buildThreadGraph(routes, quests, { limit: 0 }).nodes.length, 0);
});

test('同名、同日记录保持独立，不凭名称匹配心愿，也不将未完成或丢失记录接入地图', () => {
  const quests = [quest('a', 'sense', '2026-11-01'), quest('b', 'sense', '2026-11-01')].map(q => ({ ...q, title: '同名体验' }));
  const goalRecord = { ...quests[0], id: 'wish:c1' };
  const routes: ThreadRoute[] = [
    { id: 'goal:wish', kind: 'goal', title: '声音小册', description: '', color: 'green', stops: [{ id: 'c1', title: '同名体验', status: 'done', record: goalRecord }] },
    { id: 'custom:subset', kind: 'custom', title: '部分经历', description: '', color: 'green', stops: [
      { id: 'a', title: '同名体验', status: 'done', record: quests[0] },
      { id: 'b', title: '同名体验', status: 'next', record: quests[1] },
      { id: 'unknown', title: '同名体验', status: 'done', record: { ...quests[1], id: 'unknown' } },
    ] },
  ];
  const graph = buildThreadGraph(routes, quests);
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.routeRecordIds['goal:wish'], []);
  assert.deepEqual(graph.routeRecordIds['custom:subset'], ['a']);
  assert.deepEqual(graph.edges, []);
});

test('使用实际时间排序、稳定处理同时间与无日期旧记录，空地图保留五条可点击方向', () => {
  const quests = [quest('b', 'explore', '2026-11-01T10:00:00+08:00'), quest('a', 'connect', '2026-11-01T01:00:00Z'), quest('legacy', 'organize', '')];
  const graph = buildThreadGraph([], quests);
  assert.deepEqual(graph.nodes.map(node => node.id), ['legacy', 'a', 'b']);
  const empty = buildThreadGraph(buildThreadRoutes([], [], []), []);
  assert.equal(empty.lanes.length, 5);
  assert.deepEqual(empty.lanes.map(lane => lane.label), ['放松', '惊喜', '表达', '连接', '成长']);
  assert.deepEqual(empty.lanes.map(lane => lane.outcome), ['relax', 'surprise', 'express', 'connect', 'grow']);
  assert.deepEqual(empty.lanes.map(lane => lane.x), [0.1, 0.3, 0.5, 0.7, 0.9]);
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.hiddenCount, 0);
  assert.equal(empty.height >= 96, true);
  assert.deepEqual(empty.nodes, []);
  // At a 288px drawing width, neighboring centers remain farther apart than 44px.
  assert.equal((empty.lanes[1].x - empty.lanes[0].x) * 288 >= 44, true);
});

test('明确的体验方向优先于玩法分类，多方向只画一个节点并保留全部归属', () => {
  const quests: (QuestRecord & { desiredOutcomes?: DesiredOutcome[] })[] = [
    { ...quest('practice', 'create', '2026-11-01'), desiredOutcomes: ['grow', 'express', 'grow'] },
    { ...quest('perform', 'connect', '2026-11-02'), desiredOutcomes: ['grow', 'connect'] },
    { ...quest('rest', 'explore', '2026-11-03'), desiredOutcomes: ['relax'], tags: ['成长'] },
  ];
  const routes = buildThreadRoutes(quests, [], []);
  const graph = buildThreadGraph(routes, quests);
  assert.equal(graph.nodes.length, quests.length);
  assert.deepEqual(graph.nodes.map(node => node.outcome), ['grow', 'grow', 'relax']);
  assert.deepEqual(graph.nodes.map(node => node.x), [0.9, 0.9, 0.1]);
  assert.deepEqual(new Set(graph.nodes[0].routeIds), new Set(['outcome:grow', 'outcome:express']));
  assert.deepEqual(graph.routeRecordIds['outcome:grow'], ['practice', 'perform']);
  assert.deepEqual(graph.routeRecordIds['outcome:surprise'], []);
  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.to]), [['practice', 'perform']]);
  assert.deepEqual(recordOutcomes(quests[0]), ['grow', 'express']);
});

test('旧记录使用明确标签与保守后备分组，忽略未知方向且不改动原始数据', () => {
  const tagged = { ...quest('lesson', 'create', '2026-11-01'), tags: ['观察', '学习', '表达', '成长'] };
  assert.deepEqual(recordOutcomes(tagged), ['grow', 'express']);
  assert.deepEqual(recordOutcomes({ ...tagged, desiredOutcomes: ['unknown'] as unknown as DesiredOutcome[] }), ['grow', 'express']);
  assert.deepEqual(recordOutcomes({ ...tagged, tags: ['个人成长的记录'] }), ['express'], 'do not guess from partial tags');
  const legacy = ['organize', 'explore', 'create', 'connect', 'sense'].map(category => quest(category, category as QuestCategory, ''));
  assert.deepEqual(legacy.map(record => recordOutcomes(record)), [['relax'], ['surprise'], ['express'], ['connect'], ['relax']]);
  assert.deepEqual(tagged.tags, ['观察', '学习', '表达', '成长']);
});
