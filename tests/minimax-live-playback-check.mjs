// Requires production preview 5183/5184 and isolated goal-preview fixture 5193.
// Chat and storage use the fixture; one voice sample uses the configured MiniMax service.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio { constructor(...args) { super(...args); window.__liveAudio = this; } };
  });
  let voiceResponse;
  await page.route('**/unforeseen-life/api/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/tts')) { await route.continue(); return; }
    const url = request.url().replace('http://localhost:5183/unforeseen-life', 'http://127.0.0.1:5193');
    const response = await route.fetch({ url });
    await route.fulfill({ response });
  });
  page.on('response', async response => {
    if (response.url().endsWith('/api/tts')) voiceResponse = { status: response.status(), type: response.headers()['content-type'] };
  });
  await page.goto('http://localhost:5183/unforeseen-life/');
  await page.getByRole('button', { name: '跳过引导' }).click();
  await page.getByRole('button', { name: '我的手册', exact: true }).click();
  await page.getByRole('tab', { name: /灵感收藏/ }).click();
  await page.getByRole('textbox', { name: '这次想留下什么灵感？' }).fill('用三片落叶和一张纸做秋日拼贴，在家十五分钟。');
  await page.getByRole('button', { name: '让吱呀整理 →' }).click();
  await page.locator('.inspiration-preview').waitFor();
  await page.screenshot({ path: 'docs/screenshots/07-灵感收藏.png', fullPage: true });
  await page.getByRole('button', { name: '关闭我的手册' }).click();
  await page.getByRole('button', { name: '先出发再说' }).click();
  await page.locator('.ticket-card').first().waitFor();
  await page.getByRole('button', { name: '沉浸', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByText('吱呀中', { exact: true }).waitFor({ timeout: 40000 });
  const playback = await page.evaluate(() => ({ readyState: window.__liveAudio.readyState, duration: window.__liveAudio.duration, paused: window.__liveAudio.paused }));
  assert.equal(voiceResponse.status, 200);
  assert.match(voiceResponse.type, /audio\/mpeg/);
  assert.ok(playback.readyState >= 2 && playback.duration > 0 && !playback.paused);
  await page.getByRole('button', { name: '挂断并退出沉浸' }).click();
  assert.equal(await page.evaluate(() => window.__liveAudio.paused), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ voiceResponse, playback, exitStopped: true, errors }));
} finally { await browser.close(); }
