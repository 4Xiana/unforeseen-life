// Test the hosted build in the user's shared browser, with isolated fixture data.
// API writes are intercepted: this suite never creates sessions, goals, or real profiles.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = await browser.contexts()[0].newPage();
page.setDefaultTimeout(12000);
// External font availability must not block local interaction and screenshot checks.
await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
const base = process.env.ONBOARDING_TEST_URL || 'http://localhost:8801';
const output = '.cache/onboarding';
mkdirSync(output, { recursive: true });
const button = name => page.getByRole('button', { name, exact: true });
const client = `onboarding-fixture-${Date.now()}`;
const guideKey = `xian-app-guide-v1:${client}`;
let profile = { clientId: client, onboarded: false, energy: '慢', novelty: 2, social: 'solo', budget: 'free', mechs: ['定点观察'], interests: '', avoids: '不拍照', pairVotes: { preserved: 'A' } };
let failSave = false, holdSave = null;
const writes = [], errors = [];
const handbook = { clientId: client, quests: [], badges: [], stats: { total: 0, weekCount: 0, earnedCount: 0, byCategory: { explore: 0, organize: 0, create: 0, connect: 0, sense: 0 } } };
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  const method = req.method();
  if (method !== 'GET') writes.push({ method, path, data: req.postDataJSON() });
  if (path === '/api/profile') {
    if (method === 'PUT') {
      if (holdSave) await holdSave;
      if (failSave) return route.fulfill({ status: 503, json: { error: 'fixture: unavailable' } });
      profile = { ...profile, ...req.postDataJSON(), onboarded: true };
    }
    return route.fulfill({ json: profile });
  }
  if (method !== 'GET') return route.fulfill({ status: 500, json: { error: `Unexpected write: ${path}` } });
  if (path === '/api/handbook') return route.fulfill({ json: handbook });
  if (path === '/api/session/active') return route.fulfill({ json: null });
  if (path === '/api/quest-pairs' || path === '/api/goals') return route.fulfill({ json: [] });
  return route.fulfill({ status: 404, json: {} });
});
await page.addInitScript(() => {
  window.geoCalls = 0;
  navigator.geolocation.getCurrentPosition = () => { window.geoCalls++; };
  navigator.geolocation.watchPosition = () => { window.geoCalls++; return 1; };
});
let originalClient, originalSession;
async function step(number) {
  await page.locator(`.app-guide-progress[aria-label="应用引导，第 ${number} 页，共 4 页"]`).waitFor();
}
async function loadGuide(stored = '0') {
  await page.evaluate(({ client, guideKey, stored }) => {
    localStorage.setItem('xian.clientId', client);
    localStorage.setItem(guideKey, stored);
    localStorage.removeItem('xian-active-session');
  }, { client, guideKey, stored });
  await page.reload({ waitUntil: 'domcontentloaded' });
}
async function layout() {
  const result = await page.locator('.app-guide').evaluate(root => {
    const footer = root.querySelector('.quick-guide-footer').getBoundingClientRect();
    const skip = root.querySelector('.app-guide-top button').getBoundingClientRect();
    return {
      overflow: root.scrollWidth > innerWidth + 1,
      footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1,
      skipVisible: skip.top >= 0 && skip.bottom <= innerHeight + 1,
      clipped: [...root.querySelectorAll('button,input,textarea')].filter(e => e.getClientRects().length).some(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }),
      // Translated page-entry animations can produce 43.999999px bounding boxes.
      smallTarget: [...root.querySelectorAll('button,summary')].filter(e => e.getClientRects().length).some(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }),
    };
  });
  assert.deepEqual(result, { overflow: false, footerVisible: true, skipVisible: true, clipped: false, smallTarget: false });
}
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#root > *').waitFor();
  [originalClient, originalSession] = await page.evaluate(() => [localStorage.getItem('xian.clientId'), localStorage.getItem('xian-active-session')]);
  // New visitors see the guide automatically, without a pre-existing guide key.
  await page.evaluate(client => localStorage.setItem('xian.clientId', client), client);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await step(1);
  const results = [];
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    profile = { ...profile, energy: '慢', budget: 'free', interests: '', onboarded: false };
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await loadGuide(); await step(1); await layout();
    assert.equal(await page.locator('.guide-narration').count(), 0, 'No timed captions');
    await button('看看怎么玩 →').click(); await step(2); await layout();
    await button('就选这条支线 →').click(); await layout();
    await button('提交这份示例作品 →').click();
    await page.getByRole('status').filter({ hasText: '一条支线完成了' }).waitFor();
    await layout();
    await button('下一步：选点喜好 →').click(); await step(3); await layout();
    assert.equal(await page.locator('.basic-choice-group').count(), 2);
    assert.equal(await page.locator('.preference-fitting').count(), 0, 'No long questionnaire during onboarding');
    await button('安静坐着').click();
    await button('安静坐着').click();
    assert.equal(await button('安静坐着').getAttribute('aria-pressed'), 'false');
    await button('慢慢活动').click();
    await button('小额花费可以').click();
    if (width === 390) {
      await page.screenshot({ path: `${output}/preferences.png` });
      failSave = true;
      await button('保存喜好，下一步 →').click();
      await page.getByRole('alert').waitFor(); await step(3);
      assert.equal(await button('慢慢活动').getAttribute('aria-pressed'), 'true');
      failSave = false;
    }
    await button('保存喜好，下一步 →').click(); await step(4); await layout();
    assert.equal(profile.energy, '慢'); assert.equal(profile.budget, 'low'); assert.equal(profile.avoids, '不拍照');
    assert.deepEqual(profile.mechs, ['定点观察']); assert.deepEqual(profile.pairVotes, { preserved: 'A' });
    await button('重新捡起画画').click();
    await page.setViewportSize({ width, height: Math.min(height, 400) });
    await page.locator('#quick-wish-input').scrollIntoViewIfNeeded(); await layout();
    await page.setViewportSize({ width, height });
    if (width === 390) await page.screenshot({ path: `${output}/wish.png` });
    await button('留下心愿，完成引导 →').click();
    await button('使用指南').waitFor();
    assert.equal(await page.locator('.app-guide').count(), 0);
    assert.equal(await page.evaluate(() => window.geoCalls), 0);
    await page.reload({ waitUntil: 'domcontentloaded' }); await button('我的手册').waitFor();
    assert.equal(await page.locator('.app-guide').count(), 0, 'Completed guide stays closed');
    await button('我的手册').click();
    await page.getByRole('region', { name: '本机心愿草稿' }).waitFor();
    await button('继续安排这个心愿 →').click();
    assert.equal(await page.getByRole('textbox', { name: '我的愿望' }).inputValue(), '重新捡起画画');
    results.push({ viewport: `${width}x${height}`, fullFlow: 'pass', layout: 'pass', draftRecovery: 'pass' });
  }
  // Optional route: no profile write and no extra ending page.
  const before = writes.length;
  await loadGuide(); await step(1);
  await button('看看怎么玩 →').click(); await button('跳过演示').click();
  await button('暂时不选，下一步 →').click(); await step(4);
  await button('上一步').click(); await step(3);
  await button('暂时不选，下一步 →').click();
  await button('暂时没有，完成引导 →').click(); await button('使用指南').waitFor();
  assert.equal(writes.length, before);
  await button('使用指南').click(); await step(1);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '看看怎么玩 →');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '跳过引导');
  await page.keyboard.press('Escape'); await button('使用指南').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' }); await button('使用指南').waitFor();
  assert.equal(await page.locator('.app-guide').count(), 0);
  // A slow profile save must not reopen or advance a guide that has been closed.
  await loadGuide('5'); await step(3);
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  await button('保存喜好，下一步 →').click();
  await button('跳过引导').click();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().method() === 'PUT');
  release(); await (await saved).finished(); holdSave = null;
  await button('使用指南').waitFor(); assert.equal(await page.locator('.app-guide').count(), 0);
  // Earlier persisted guide steps still resolve to a visible page.
  await loadGuide('7'); await step(4);
  await loadGuide('2'); await step(1);
  assert.ok(writes.every(w => w.method === 'PUT' && w.path === '/api/profile'), 'No model, session, or goal writes');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, skipReplayResume: 'pass', saveFailureRetry: 'pass', lateSaveExit: 'pass', preservedProfileFields: 'pass', modelCalls: 0, pageErrors: errors }, null, 2));
} finally {
  if (!page.isClosed()) {
    await page.evaluate(({ client, originalClient, originalSession }) => {
      for (const key of Object.keys(localStorage)) if (key.includes(client)) localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage)) if (key.includes(client)) sessionStorage.removeItem(key);
      if (originalClient === null) localStorage.removeItem('xian.clientId'); else localStorage.setItem('xian.clientId', originalClient);
      if (originalSession === null) localStorage.removeItem('xian-active-session'); else localStorage.setItem('xian-active-session', originalSession);
    }, { client, originalClient, originalSession });
    await page.close();
  }
  await browser.close(); // Disconnect only: leave the shared browser running.
}
