import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FITTING_PAIRS, type PairAnswer } from '../server/agent/profile/fitting-pairs.js';
import { LEGACY_PAIRS, questPairsForClient } from '../server/agent/profile/quest-pairs.js';
import { fitPreferences, renderFittingBrief } from '../server/agent/profile/preference-model.js';

const dir = mkdtempSync(path.join(tmpdir(), 'xian-preference-test-'));
process.env.XIAN_DATA_DIR = dir;
const { getProfile, saveProfile, saveProfileFitting, normalizeProfileInput, buildProfileBrief } = await import('../server/agent/profile/profile.js');
after(() => rmSync(dir, { recursive: true, force: true }));
const all = (answer: PairAnswer) => Object.fromEntries(FITTING_PAIRS.map(pair => [pair.id, answer]));
const basic = normalizeProfileInput({ energy: '慢', novelty: 2, social: 'solo', budget: 'free', mechs: ['定点观察'], avoids: '不拍照', interests: '植物' });

test('宏观喜好清洗非法值、去重期待，并允许旧请求省略新增字段', () => {
  const value = normalizeProfileInput({ mbti: ' infp ', activityPreference: 'quiet', desiredOutcomes: ['grow', 'relax', 'relax', 'unknown', { value: 'connect' }] });
  assert.equal(value.mbti, 'INFP');
  assert.equal(value.activityPreference, 'quiet');
  assert.deepEqual(value.desiredOutcomes, ['relax', 'grow']);
  const invalid = normalizeProfileInput({ mbti: 'NF', activityPreference: 'high', desiredOutcomes: 'relax' });
  assert.equal(invalid.mbti, null);
  assert.equal(invalid.activityPreference, 'any');
  assert.deepEqual(invalid.desiredOutcomes, []);
  assert.equal(basic.mbti, undefined);
  assert.equal(basic.activityPreference, undefined);
  assert.equal(basic.desiredOutcomes, undefined);
});

test('人格、动静与期待进入推荐摘要，兼容旧档案并独立于体力与问卷保存', async () => {
  const input = { ...basic, ...normalizeProfileInput({ ...basic, mbti: 'INFP', activityPreference: 'active', desiredOutcomes: ['relax', 'grow'] }) };
  const saved = await saveProfile('identity', input);
  assert.equal(saved.energy, '慢');
  assert.equal(saved.activityPreference, 'active');
  const brief = buildProfileBrief(saved);
  assert.match(brief, /用户自述 MBTI：INFP/);
  assert.match(brief, /喜动/);
  assert.match(brief, /放松、成长/);
  assert.match(brief, /不推断固定兴趣、能力或社交需求/);
  await saveProfileFitting('identity', all('tie'));
  const legacySave = await saveProfile('identity', basic);
  assert.equal(legacySave.mbti, 'INFP');
  assert.equal(legacySave.activityPreference, 'active');
  assert.deepEqual(legacySave.desiredOutcomes, ['relax', 'grow']);
  assert.equal(legacySave.fitting?.ties, 30);
  const cleared = await saveProfile('identity', { ...basic, mbti: null, activityPreference: 'any', desiredOutcomes: [] });
  assert.equal(cleared.mbti, null);
  assert.deepEqual(cleared.desiredOutcomes, []);
  assert.equal(cleared.activityPreference, 'any');
  assert.equal(cleared.fitting?.ties, 30);
  const legacyDir = mkdtempSync(path.join(dir, 'legacy-'));
  writeFileSync(path.join(legacyDir, 'profile.json'), JSON.stringify({ legacy: { clientId: 'legacy', onboarded: true, ...basic, pairVotes: {} } }));
  const output = execFileSync(path.resolve('server/node_modules/.bin/tsx'), ['-e', `import { getProfile } from './server/agent/profile/profile.ts'; getProfile('legacy').then(p => console.log(JSON.stringify(p)));`], { env: { ...process.env, XIAN_DATA_DIR: legacyDir }, encoding: 'utf8' });
  const restored = JSON.parse(output);
  assert.equal(restored.mbti, null);
  assert.equal(restored.activityPreference, 'any');
  assert.deepEqual(restored.desiredOutcomes, []);
  assert.equal(restored.avoids, '不拍照');
});

test('30组匹配时长与预算，六方向均有覆盖，旧题保持兼容', () => {
  assert.equal(FITTING_PAIRS.length, 30);
  assert.equal(new Set(FITTING_PAIRS.map(p => p.id)).size, 30);
  const groups = new Map<string, number>();
  for (const pair of FITTING_PAIRS) {
    groups.set(pair.section, (groups.get(pair.section) || 0) + 1);
    assert.equal(pair.a.min, pair.b.min);
    assert.equal(pair.a.budget, pair.b.budget);
    assert.ok(pair.a.title && pair.b.title && pair.a.text && pair.b.text);
  }
  assert.deepEqual([...groups.values()], [5, 5, 5, 5, 5, 5]);
  assert.equal(questPairsForClient().length, 30);
  assert.equal(LEGACY_PAIRS.length, 6);
  const normalized = normalizeProfileInput({ pairVotes: { q1: 'A', q2: 'B', [FITTING_PAIRS[0].id]: 'tie', unknown: 'A', q3: ['A'], q4: 'invalid' } });
  assert.deepEqual(normalized.pairVotes, { q1: 'A', q2: 'B', [FITTING_PAIRS[0].id]: 'tie' });
  assert.equal(normalizeProfileInput({}).pairVotes, undefined);
});

test('平局与跳过不冒充选择；无证据不生成倾向', () => {
  for (const answer of ['tie', 'skip'] as const) {
    const fit = fitPreferences(all(answer));
    assert.equal(fit.complete, true);
    assert.equal(fit.decisive, 0);
    assert.equal(answer === 'tie' ? fit.ties : fit.skipped, 30);
    assert.ok(fit.dimensions.flatMap(d => d.signals).every(s => s.weight === 0));
    assert.ok(!renderFittingBrief(fit).includes('相对更常选'));
  }
  assert.equal(fitPreferences({}).complete, false);
  assert.equal(renderFittingBrief(fitPreferences({})), '');
});

test('对同一方向的一致选择产生正确相对权重，反选使权重反向', () => {
  const votes = all('skip');
  for (const pair of FITTING_PAIRS.filter(p => p.section === '新鲜程度')) votes[pair.id] = pair.a.nov > pair.b.nov ? 'A' : 'B';
  const fit = fitPreferences(votes);
  const signals = fit.dimensions.find(d => d.id === 'nov')!.signals;
  assert.ok(signals.find(s => s.label === '脑洞玩法')!.weight > signals.find(s => s.label === '熟悉稳妥')!.weight);
  const inverse = Object.fromEntries(Object.entries(votes).map(([id, v]) => [id, v === 'A' ? 'B' : v === 'B' ? 'A' : v])) as Record<string, PairAnswer>;
  const flipped = fitPreferences(inverse);
  for (const dimension of fit.dimensions) for (const signal of dimension.signals) {
    const other = flipped.dimensions.find(d => d.id === dimension.id)!.signals.find(s => s.label === signal.label)!;
    assert.ok(Math.abs(signal.weight + other.weight) < .002);
  }
});

test('独立保存、并发更新与失败重试均保留基础限制和已提交画像', async () => {
  await assert.rejects(saveProfileFitting('alice', {}));
  await assert.rejects(saveProfileFitting('alice', { ...all('A'), [FITTING_PAIRS[0].id]: ['A'] }));
  assert.equal((await getProfile('alice')).onboarded, false);
  await saveProfile('alice', { ...basic, pairVotes: { q1: 'B' } });
  const fitted = await saveProfileFitting('alice', { ...all('A'), q1: 'A', unknown: 'A' });
  assert.equal(fitted.pairVotes.q1, 'B', 'fitting only updates its own questions');
  assert.equal(fitted.avoids, '不拍照');
  assert.equal(fitted.budget, 'free');
  assert.deepEqual(fitted.mechs, ['定点观察']);
  assert.ok(fitted.fittingUpdatedAt);
  assert.equal(fitted.fitting?.complete, true);
  await Promise.all([
    saveProfile('alice', { ...basic, energy: '动' }),
    saveProfileFitting('alice', all('B')),
    saveProfile('bob', basic),
  ]);
  const combined = await getProfile('alice');
  assert.equal(combined.energy, '动');
  assert.equal(combined.avoids, '不拍照');
  assert.equal(combined.pairVotes[FITTING_PAIRS[0].id], 'B');
  assert.equal((await getProfile('bob')).fitting?.reviewed, 0);
  assert.equal((await getProfile('unknown')).fitting?.reviewed, 0);
  const brief = buildProfileBrief(combined);
  assert.match(brief, /玩法对比拟合/);
  assert.match(brief, /明确雷点、预算及当次时间\/地点\/人数优先/);
  assert.match(brief, /不拍照/);
  const disk = readFileSync(path.join(dir, 'profile.json'), 'utf8');
  mkdirSync(path.join(dir, 'profile.json.tmp'));
  await assert.rejects(saveProfile('alice', { ...basic, avoids: '未保存的新限制' }));
  assert.equal((await getProfile('alice')).avoids, '不拍照');
  assert.equal(readFileSync(path.join(dir, 'profile.json'), 'utf8'), disk);
  rmSync(path.join(dir, 'profile.json.tmp'), { recursive: true });
  await saveProfile('alice', { ...basic, energy: '坐' });
  assert.equal((await getProfile('alice')).energy, '坐');
  assert.equal((await getProfile('alice')).fitting?.complete, true);
  const output = execFileSync(path.resolve('server/node_modules/.bin/tsx'), ['-e', `import { getProfile } from './server/agent/profile/profile.ts'; getProfile('alice').then(p => console.log(JSON.stringify(p)));`], { env: { ...process.env, XIAN_DATA_DIR: dir }, encoding: 'utf8' });
  const restored = JSON.parse(output);
  assert.equal(restored.energy, '坐');
  assert.equal(restored.fitting.complete, true);
  assert.equal(restored.pairVotes[FITTING_PAIRS[0].id], 'B');
});
