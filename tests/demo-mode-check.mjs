import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertMobileShell } from './mobile-shell.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const base = process.env.BASE_URL || 'http://127.0.0.1:8801';
const output = '.cache/demo-check'; mkdirSync(output, { recursive: true });
const errors = [], demoNetwork = [], mutations = [];
let trackingDemo = false;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (trackingDemo && new URL(request.url()).pathname.startsWith('/api/')) demoNetwork.push(request.url()); });
// External font availability is outside the app contract; exercise system-font fallback deterministically.
await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, route => route.fulfill({ contentType: 'text/css', body: '' }));
// The normal-mode half uses fixtures too: this test never changes a real user's data.
await page.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (request.method() !== 'GET') mutations.push(path);
  const body = path === '/api/handbook' ? { clientId: 'real-fixture', quests: [], badges: [], stats: { total: 0, byCategory: {}, thisWeek: 0 } }
    : path === '/api/profile' ? { clientId: 'real-fixture', onboarded: true, pairVotes: {}, desiredOutcomes: [], energy: '慢', budget: 'free', social: 'solo', novelty: 2, mechs: [], interests: '', avoids: '' }
      : path.startsWith('/api/session/') ? null : [];
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
const button = name => page.getByRole('button', { name, exact: true });
async function navigate(action) {
  await button('演示设置').click();
  await page.locator(`[data-demo-action="${action}"]`).click();
  await page.getByRole('dialog', { name: '演示控制台', exact: true }).waitFor({ state: 'hidden' });
}
async function countNodes(count) { await page.waitForFunction(count => document.querySelectorAll('.thread-graph-node').length === count, count); }
async function submit(kind) {
  await button(kind === 'photo' ? '填入示例照片' : '填入示例记录').click();
  await button(kind === 'photo' ? '提交照片和回答' : '提交记录').click();
}
try {
  await page.route(base + '/', route => route.fulfill({ contentType: 'text/html', body: '<title>Demo test setup</title>' }));
  await page.goto(base + '/');
  const baseline = await page.evaluate(() => {
    localStorage.setItem('xian.clientId', 'real-fixture');
    localStorage.setItem('xian-app-guide-v1:real-fixture', 'done');
    localStorage.setItem('xian-inspiration-draft:real-fixture', '{"text":"真实模式草稿"}');
    sessionStorage.setItem('real-task-draft', '真实模式任务草稿');
    return { local: { ...localStorage }, session: { ...sessionStorage } };
  });
  await page.unroute(base + '/');
  await page.reload();
  await button('演示设置').click();
  await page.getByRole('switch', { name: '演示模式' }).click();
  await page.locator('.demo-mode-badge').waitFor();
  await button('演示：帮我找一条支线').waitFor();
  trackingDemo = true;
  await navigate('task');
  await page.getByRole('region', { name: '当前第1步', exact: true }).waitFor();
  await navigate('recommend');
  await button('演示：换一批支线').waitFor();
  await navigate('task');
  await page.getByRole('region', { name: '当前第1步', exact: true }).waitFor();
  await button('问问吱呀').click();
  await button('演示：问问做法').click();
  await page.getByRole('dialog', { name: '和吱呀聊聊', exact: true }).getByText('你准备好后，再提交这一小步的作品。', { exact: false }).waitFor();
  await button('回到任务').click();
  await page.getByRole('region', { name: '当前第1步', exact: true }).waitFor();
  await submit('text');
  await page.getByRole('region', { name: '当前第2步', exact: true }).waitFor();
  await assertMobileShell(page);
  await submit('photo');
  await page.getByRole('region', { name: '当前第3步', exact: true }).waitFor();
  await submit('text');
  await page.locator('.task-finished').waitFor();
  await page.reload();
  await page.locator('.task-finished').waitFor();
  await navigate('threads'); await countNodes(16);
  assert.deepEqual(await page.locator('.thread-graph-lanes button').allTextContents(), ['放松', '惊喜', '表达', '连接', '成长']);
  await page.screenshot({ path: output + '/map.png' });
  const layouts = [];
  for (const [width, height] of [[320, 568], [375, 812], [844, 390], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await assertMobileShell(page);
    await button('演示设置').click();
    await assertMobileShell(page);
    await button('关闭演示控制台').click();
    layouts.push(`${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate('preferences');
  await page.getByRole('tab', { name: '喜好配置拟合', exact: true }).click();
  await button('查看已保存画像').click();
  await page.getByRole('region', { name: '我的喜好画像' }).waitFor();
  await assertMobileShell(page);
  await navigate('inspiration');
  await page.locator('.inspiration-saved').nth(2).waitFor();
  await button('填入示例灵感').click();
  await button('让吱呀整理 →').click();
  await button('收藏这条灵感 ♡').click();
  await page.waitForFunction(() => document.querySelectorAll('.inspiration-saved').length === 4);
  await navigate('goals');
  await page.locator('.goals-cover').filter({ hasText: '做一本自己的日常声音小册' }).click();
  await button('今天想推进一点 →').click();
  await page.getByRole('region', { name: '当前第1步', exact: true }).waitFor();
  await submit('text');
  await page.getByRole('region', { name: '当前第2步', exact: true }).waitFor();
  await submit('photo'); await page.locator('.task-finished').waitFor();
  await navigate('goals');
  await page.locator('.goals-cover').filter({ hasText: '做一本自己的日常声音小册' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="心愿计划完成进度"]')?.getAttribute('aria-valuenow') === '2');
  assert.equal(await page.locator('.goals-stamps .earned').count(), 2);
  await page.screenshot({ path: output + '/goal.png' });
  await navigate('recommend');
  await button('演示：换一批支线').waitFor();
  await button('演示：换一批支线').click();
  await page.getByText('用三种颜色记下今天', { exact: true }).waitFor();
  await navigate('onboarding'); await page.locator('.app-guide').waitFor();
  await assertMobileShell(page);
  await button('演示设置').click(); await button('重置演示').click();
  await button('演示：帮我找一条支线').waitFor();
  await navigate('threads'); await countNodes(15);
  await navigate('inspiration');
  await page.waitForFunction(() => document.querySelectorAll('.inspiration-saved').length === 3);
  await page.goto(base + '/debug.html?demo=1');
  await page.getByText('演示模式 · 不连接真实日志', { exact: true }).waitFor();
  await page.getByText('暂无会话记录', { exact: true }).waitFor();
  await page.goto(base + '/?demo=1');
  await button('演示：帮我找一条支线').waitFor();
  assert.deepEqual(demoNetwork, [], 'Demo must not make actual API requests');
  trackingDemo = false;
  await button('演示设置').click();
  await page.getByRole('switch', { name: '演示模式' }).click();
  await page.locator('.demo-hidden-dot').waitFor();
  const restored = await page.evaluate(baseline => ({
    local: Object.fromEntries(Object.keys(baseline.local).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(baseline.session).map(key => [key, sessionStorage.getItem(key)])),
  }), baseline);
  assert.deepEqual(restored, baseline, 'Original-mode identity, drafts and guide state survive demo reset and exit');
  await page.keyboard.press('Alt+Shift+D');
  await page.getByRole('dialog', { name: '演示设置', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ taskAndAssistance: 'pass', textAndPhoto: 'pass', restore: 'pass', lanes: 'pass', preferences: 'pass', inspiration: 'pass', goalContinuationAndRewards: 'pass', refreshBatch: 'pass', onboarding: 'pass', resetAndExitIsolation: 'pass', demoNetworkRequests: demoNetwork.length, layouts, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + '/failure.png' });
  console.error((await page.locator('body').innerText()).slice(-3500));
  throw error;
} finally { await context.close(); await browser.close(); }
