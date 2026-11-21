// Shared-browser regression; all API writes use isolated fixtures, never real user data.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fitPreferences } from '../server/dist/agent/profile/preference-model.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREFERENCE_TEST_URL || 'http://localhost:8801';
const pairs = await (await fetch(`${base}/api/quest-pairs`)).json();
assert.equal(pairs.length, 30);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = await browser.contexts()[0].newPage();
page.setDefaultTimeout(12000);
const client = `fitting-fixture-${Date.now()}`;
const key = `xian-preference-fitting-v1:${client}`;
const guideKey = `xian-app-guide-v1:${client}`;
const output = '.cache/preference-fitting';
mkdirSync(output, { recursive: true });
const button = name => page.getByRole('button', { name, exact: true });
const card = side => page.getByRole('button', { name: new RegExp(`^选${side}：`) });
let profile = { clientId: client, onboarded: true, energy: '慢', budget: 'free', social: 'solo', novelty: 2, mechs: ['定点观察'], interests: '植物', avoids: '不拍照', pairVotes: { q1: 'B' }, fitting: fitPreferences({}) };
const handbook = { clientId: client, quests: [], badges: [], stats: { total: 0, weekCount: 0, earnedCount: 0, byCategory: { explore: 0, organize: 0, create: 0, connect: 0, sense: 0 } } };
const writes = [], errors = [];
let failSave = false, holdSave = null, originalClient, originalSession;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const req = route.request(), pathname = new URL(req.url()).pathname;
  const method = req.method();
  if (method !== 'GET') writes.push({ path: pathname, data: req.postDataJSON() });
  if (pathname === '/api/profile/fitting' && method === 'PUT') {
    assert.equal(req.headers()['x-client-id'], client);
    if (holdSave) await holdSave;
    if (failSave) return route.fulfill({ status: 503, json: { error: '测试保存失败，请重试' } });
    const votes = req.postDataJSON().pairVotes;
    profile = { ...profile, pairVotes: { ...profile.pairVotes, ...votes }, fitting: fitPreferences(votes), fittingUpdatedAt: new Date().toISOString() };
    return route.fulfill({ json: profile });
  }
  if (pathname === '/api/profile') {
    if (method === 'PUT') {
      assert.equal(req.postDataJSON().pairVotes, undefined, 'basic settings must not resend fitting answers');
      profile = { ...profile, ...req.postDataJSON() };
    }
    return route.fulfill({ json: profile });
  }
  if (method !== 'GET') return route.fulfill({ status: 500, json: { error: `Unexpected write: ${pathname}` } });
  if (pathname === '/api/handbook') return route.fulfill({ json: handbook });
  if (pathname === '/api/session/active') return route.fulfill({ json: null });
  if (pathname === '/api/quest-pairs') return route.fulfill({ json: pairs });
  if (pathname === '/api/goals') return route.fulfill({ json: [] });
  return route.fulfill({ status: 404, json: {} });
});
async function openFitting() {
  await button('我的手册').click();
  await page.locator('#library-tab-preferences').click();
  await page.getByRole('tab', { name: '喜好配置拟合', exact: true }).click();
}
async function question(n) {
  await page.locator('.fitting-question-top').filter({ hasText: `第 ${n} / 30 组` }).waitFor();
}
async function layout() {
  assert.deepEqual(await page.locator('.preferences-hub').evaluate(root => ({
    overflow: root.scrollWidth > root.clientWidth + 1,
    clipped: [...root.querySelectorAll('button,input')].filter(e => e.getClientRects().length).some(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }),
    small: [...root.querySelectorAll('button')].filter(e => e.getClientRects().length).some(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }),
  })), { overflow: false, clipped: false, small: false });
}
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#root > *').waitFor();
  [originalClient, originalSession] = await page.evaluate(() => [localStorage.getItem('xian.clientId'), localStorage.getItem('xian-active-session')]);
  await page.evaluate(({ client, guideKey }) => { localStorage.setItem('xian.clientId', client); localStorage.setItem(guideKey, 'done'); localStorage.removeItem('xian-active-session'); }, { client, guideKey });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFitting(); await layout();
  await button('开始30组喜好对比 →').click(); await question(1); await layout();
  await page.screenshot({ path: `${output}/question-mobile.png` });
  await card('A').click(); await question(2);
  await button('两个差不多').click(); await question(3);
  await button('都不想选，跳过').click(); await question(4);
  await button('上一组').click(); await question(3);
  assert.equal(await button('都不想选，跳过').getAttribute('aria-pressed'), 'true');
  await card('B').click(); await question(4);
  assert.equal(writes.length, 0, 'answers remain drafts before final confirmation');
  await page.keyboard.press('Escape'); await button('我的手册').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' }); await openFitting();
  await page.getByRole('button', { name: /继续上次问卷（已看3\/30组）/ }).click(); await question(4);
  const sizes = [[320, 568], [390, 844], [844, 390], [1280, 900]];
  for (const [width, height] of sizes) { await page.setViewportSize({ width, height }); await layout(); }
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 3; i < 30; i++) {
    await question(i + 1);
    if (i === 4) await button('都不想选，跳过').click();
    else await card(i % 2 ? 'B' : 'A').click();
  }
  await page.getByRole('heading', { name: '检查一下，再保存我的画像' }).waitFor();
  await layout();
  assert.equal(await page.locator('.fitting-review button').count(), 30);
  assert.equal(writes.length, 0);
  await page.locator('.fitting-review button').first().click(); await question(1);
  await card('B').click(); await question(2);
  await button('检查全部答案').click();
  assert.match(await page.locator('.fitting-review button').first().innerText(), new RegExp(pairs[0].b.title));
  failSave = true;
  await button('保存问卷，生成喜好画像 →').click();
  await page.getByRole('alert').filter({ hasText: '测试保存失败' }).waitFor();
  assert.ok(await page.evaluate(key => localStorage.getItem(key), key), 'failure retains draft');
  assert.equal(profile.fitting.reviewed, 0);
  failSave = false;
  await button('保存问卷，生成喜好画像 →').click();
  await page.getByRole('heading', { name: '喜好画像已保存' }).waitFor();
  await layout();
  assert.equal(await page.locator('.fitting-dimensions article').count(), 6);
  assert.equal(profile.fitting.complete, true); assert.equal(profile.fitting.ties, 1); assert.equal(profile.fitting.skipped, 1);
  assert.equal(profile.avoids, '不拍照'); assert.equal(profile.pairVotes.q1, 'B');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  await page.screenshot({ path: `${output}/result-mobile.png` });
  await button('回看并调整答案').click();
  await page.getByRole('heading', { name: '检查一下，再保存我的画像' }).waitFor();
  await page.keyboard.press('Escape'); await page.reload({ waitUntil: 'domcontentloaded' }); await openFitting();
  await button('查看已保存画像').click(); await page.getByRole('heading', { name: '喜好画像已保存' }).waitFor();
  const oldVotes = structuredClone(profile.pairVotes);
  await button('从头重新拟合').click(); await question(1);
  assert.deepEqual(profile.pairVotes, oldVotes, 'redo cannot erase saved model');
  assert.equal(await card('A').getAttribute('aria-pressed'), 'false');
  assert.equal(await card('B').getAttribute('aria-pressed'), 'false');
  await page.getByRole('tab', { name: '基础喜好', exact: true }).click();
  await page.getByRole('textbox', { name: '不想做的事（选填）', exact: true }).fill('不拍照，不与陌生人互动');
  await button('保存基础喜好').click();
  await page.getByRole('status').filter({ hasText: '基础喜好已保存' }).waitFor();
  assert.deepEqual(profile.pairVotes, oldVotes);
  assert.equal(profile.avoids, '不拍照，不与陌生人互动');
  // A response arriving after exit cannot reopen the questionnaire or erase a newer draft.
  await page.evaluate(({ key, pairs }) => localStorage.setItem(key, JSON.stringify({ version: 'v1', answers: Object.fromEntries(pairs.map(p => [p.id, 'tie'])), index: 29 })), { key, pairs });
  await page.getByRole('tab', { name: '喜好配置拟合', exact: true }).click();
  await page.getByRole('button', { name: /继续上次问卷/ }).click();
  let release; holdSave = new Promise(resolve => { release = resolve; });
  await button('保存问卷，生成喜好画像 →').click();
  await button('关闭我的手册').click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/profile/fitting') && r.request().method() === 'PUT');
  release(); await (await response).finished(); holdSave = null;
  await button('我的手册').waitFor();
  assert.equal(await page.locator('.library-overlay').count(), 0);
  assert.ok(writes.every(w => ['/api/profile/fitting', '/api/profile'].includes(w.path)));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ questionnaire: '30 groups, six dimensions', resumeAndReview: 'pass', noEarlyWrites: 'pass', retryAndLateSaveExit: 'pass', preserveBasicAndFitting: 'pass', viewports: sizes, pageErrors: errors }, null, 2));
} finally {
  if (!page.isClosed()) {
    await page.evaluate(({ client, originalClient, originalSession }) => {
      for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.includes(client)) storage.removeItem(key);
      if (originalClient === null) localStorage.removeItem('xian.clientId'); else localStorage.setItem('xian.clientId', originalClient);
      if (originalSession === null) localStorage.removeItem('xian-active-session'); else localStorage.setItem('xian-active-session', originalSession);
    }, { client, originalClient, originalSession });
    await page.close();
  }
  await browser.close();
}
