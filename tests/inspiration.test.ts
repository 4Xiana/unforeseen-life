import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InspirationStore, isPublicAddress, readPublicPage, extractInspiration } from '../server/inspiration.js';
import type { ActivityPlan } from '../server/agent/memory/types.js';
import type { UserProfile } from '../server/agent/profile/profile.js';
const draft = {
  rawInput: '用三片落叶做秋日拼贴，原文永久保留', sourceText: '用三片落叶做秋日拼贴，原文永久保留',
  task: { title: '秋日拼贴', description: '用三片落叶组成一幅秋日拼贴，再写一句观察。', hook: '把路上的秋天留在纸上', tags: ['手作'], category: 'create', minutes: 15, scene: 'any', people: 1, cost: 0, energy: 'low', materials: '三片落叶和纸' },
};
const ordinary: ActivityPlan[] = [{ id: 'ordinary', title: '听此刻', hook: '听窗边的声音', category: 'sense', tags: [] }];
test('原文、确认收藏、重复提交、所有权、暂停和删除持久化', () => {
  const store = new InspirationStore(':memory:');
  try {
    assert.equal(store.list('a').length, 0);
    const item = store.create('a', draft);
    assert.equal(store.create('a', draft).id, item.id);
    assert.equal(store.list('b').length, 0);
    assert.throws(() => store.update('b', item.id, false));
    assert.equal(store.delete('b', item.id), false);
    assert.equal(store.list('a')[0].rawInput, draft.rawInput);
    store.update('a', item.id, false);
    assert.deepEqual(store.mix('a', ordinary, { freeTime: '30分钟' }), ordinary);
    store.update('a', item.id, true);
    assert.equal(store.delete('a', item.id), true);
  } finally { store.close(); }
});
test('时间、场景、预算、人数、体力、冷却筛选，并保留普通卡和来源快照', () => {
  const store = new InspirationStore(':memory:');
  try {
    const item = store.create('a', draft);
    assert.deepEqual(store.mix('a', ordinary, { freeTime: '5分钟' }), ordinary);
    const cards = store.mix('a', ordinary, { freeTime: '30分钟' });
    assert.equal(cards[0].id, item.id);
    assert.equal(cards[1].id, 'ordinary');
    assert.equal(cards[0].inspiration?.description, draft.task.description);
    assert.deepEqual(store.mix('a', ordinary, { freeTime: '30分钟' }), ordinary);
    store.create('b', { ...draft, task: { ...draft.task, scene: 'outdoors', cost: 20, people: 2 } });
    assert.deepEqual(store.mix('b', ordinary, { freeTime: '30分钟', scene: '家里', peopleCount: 2, budget: '30元' }), ordinary);
    assert.deepEqual(store.mix('b', ordinary, { freeTime: '30分钟', scene: '公园', peopleCount: 1, budget: '30元' }), ordinary);
    assert.deepEqual(store.mix('b', ordinary, { freeTime: '30分钟', scene: '公园', peopleCount: 2, budget: '不花钱' }), ordinary);
    assert.equal(store.mix('b', ordinary, { freeTime: '30分钟', scene: '公园', peopleCount: 2, budget: '30元' }).length, 2);
    store.create('c', { ...draft, task: { ...draft.task, energy: 'medium' } });
    assert.deepEqual(store.mix('c', ordinary, { freeTime: '30分钟', energyLevel: '疲惫' }), ordinary);
  } finally { store.close(); }
});
test('自由文本雷点需要模型明确提名，暂停收藏不能被模型伪造回推荐', () => {
  const store = new InspirationStore(':memory:');
  try {
    const item = store.create('a', draft);
    const profile = { avoids: '不拍照', energy: 'any', social: 'any' } as UserProfile;
    assert.deepEqual(store.mix('a', ordinary, { freeTime: '30分钟' }, profile), ordinary);
    const nominee = { ...ordinary[0], id: item.id };
    assert.equal(store.mix('a', [nominee, ...ordinary], { freeTime: '30分钟' }, profile)[0].id, item.id);
    store.update('a', item.id, false);
    assert.deepEqual(store.mix('a', [nominee, ...ordinary], { freeTime: '30分钟' }, profile), ordinary);
  } finally { store.close(); }
});
test('来源读取拒绝本机、局域网、IPv6映射和非公开协议', async () => {
  for (const ip of ['127.0.0.1', '10.1.1.1', '172.16.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(readPublicPage('http://127.0.0.1/'));
  await assert.rejects(readPublicPage('file:///etc/hosts'));
  await assert.rejects(readPublicPage('http://example.com:5184/'));
});
test('链接不可读时使用用户粘贴的正文，明确来源且不虚构网页内容', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fixture-only';
  let sent = '';
  globalThis.fetch = async (_input, init) => {
    sent = String(init?.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft.task) } }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const pasted = '在家用三片捡到的落叶和一张纸做秋日拼贴，不拍照，写三句作品介绍，约15分钟。';
    const result = await extractInspiration(`${pasted}\nhttp://127.0.0.1/`);
    assert.equal(result.sourceText, pasted);
    assert.match(result.sourceNotice!, /根据你粘贴的正文/);
    assert.ok(sent.includes(pasted));
    await assert.rejects(extractInspiration('看看这个 http://127.0.0.1/'));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});
