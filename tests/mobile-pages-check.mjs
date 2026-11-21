// Hosted pages, shared browser, isolated data; no model or real-data writes.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { assertMobileShell } from './mobile-shell.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = await browser.newContext({ reducedMotion: 'reduce' });
const page = await context.newPage();
const base = process.env.MOBILE_TEST_URL || 'http://localhost:8801';
const client = 'mobile-layout-fixture';
const errors = [];
const unexpectedWrites = [];
const results = [];
let sessionActive = false;
const sessionId = `${client}-session`;
const saved = { sessionId, clientId: client, status: 'idle', snapshot: { fsmState: 'S1', proposedActivities: [{ id: 'magic', title: '学会一个能表演给朋友的小魔术', category: 'create', tags: ['在家', '轻松'], hook: '给朋友准备一个小惊喜。' }], selectedActivity: null, currentStepIndex: 0 }, events: [] };
mkdirSync('.cache/mobile-pages', { recursive: true });
page.on('pageerror', error => errors.push(error.message));
await context.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, r => r.abort());
await context.addInitScript(client => {
  localStorage.setItem('xian.clientId', client);
  localStorage.setItem(`xian-app-guide-v1:${client}`, 'done');
  navigator.geolocation.getCurrentPosition = () => {};
}, client);
await context.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() !== 'GET') unexpectedWrites.push(path);
  const data = path === '/api/profile' ? { clientId: client, onboarded: true, energy: 'any', budget: 'any', social: 'any', novelty: 0, mechs: [], pairVotes: {} }
    : path === '/api/handbook' ? { clientId: client, quests: [], badges: [], stats: { total: 0, weekCount: 0, earnedCount: 0, byCategory: {} } }
    : path.startsWith('/api/session/') ? (sessionActive ? saved : null) : [];
  return route.fulfill({ json: data });
});
const button = name => page.getByRole('button', { name, exact: true });
async function check() {
  await assertMobileShell(page);
  const undersized = await page.locator('.app-shell').evaluate(root => [...root.querySelectorAll('button')]
    .filter(el => el.getClientRects().length && !el.closest('[hidden]'))
    .filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; })
    .map(el => el.getAttribute('aria-label') || el.textContent));
  assert.deepEqual(undersized, []);
}
try {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [1280, 900]]) {
    sessionActive = false;
    await page.setViewportSize({ width, height });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await button('我的手册').waitFor();
    await check();
    await button('打字告诉吱呀').click();
    await page.getByRole('textbox', { name: '告诉吱呀，你想试点什么' }).fill('想学会一个能表演给朋友的小魔术');
    await check();
    await page.setViewportSize({ width, height: Math.min(height, 360) });
    await check();
    const input = await page.locator('.landing-input').boundingBox();
    const shell = await page.locator('.app-shell').boundingBox();
    assert.ok(input.y >= shell.y && input.y + input.height <= shell.y + shell.height + 1);
    await page.setViewportSize({ width, height });
    await button('我的手册').click();
    for (const tab of ['支线脉络', '喜好', '心愿计划', '日常记录', '灵感收藏']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await check();
      if (width === 375) await page.screenshot({ path: `.cache/mobile-pages/${tab}.png` });
    }
    await button('关闭我的手册').click();
    sessionActive = true;
    await page.evaluate(sessionId => localStorage.setItem('xian-active-session', sessionId), sessionId);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await button('沉浸').click();
    await page.locator('.call-sheet').waitFor();
    await check();
    await button('关闭').click();
    await check();
    await button('退出').click();
    await page.evaluate(() => localStorage.removeItem('xian-active-session'));
    results.push({ viewport: `${width}x${height}`, landing: 'pass', keyboardHeight: 'pass', libraryTabs: 'pass', immersiveSheet: 'pass' });
  }
  await page.goto(`${base}/debug.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.trace-dashboard').waitFor();
  await check();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedWrites, []);
  console.log(JSON.stringify({ results, debug: 'pass', pageErrors: errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
