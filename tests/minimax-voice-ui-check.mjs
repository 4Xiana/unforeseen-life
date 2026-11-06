// Tests real hook lifecycle with deterministic transport, audio and recognition.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__audioLog = [];
    window.Audio = class {
      src = ''; onended = null; onerror = null;
      constructor() { window.__audio = this; }
      play() { if (this.src.startsWith('blob:')) window.__audioLog.push('play'); return Promise.resolve(); }
      pause() { if (this.src.startsWith('blob:')) window.__audioLog.push('pause'); }
      load() {}
      removeAttribute(name) { if (name === 'src') this.src = ''; }
    };
    window.SpeechRecognition = class {
      start() { queueMicrotask(() => this.onstart?.()); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
  let pending;
  let requests = 0;
  let mode = 'pending';
  await page.route('**/api/tts', async route => {
    requests++;
    if (mode === 'pending') { pending = route; return; }
    if (mode === 'error') await route.fulfill({ status: 503, body: '{}' });
    else await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([1, 2, 3, 4]) });
  });
  await page.goto('http://127.0.0.1:5194');
  await page.getByRole('button', { name: '跳过引导' }).click();
  await page.getByRole('button', { name: '先出发再说' }).click();
  await page.getByRole('button', { name: '沉浸', exact: true }).waitFor();
  await page.locator('.ticket-card').first().waitFor();
  await page.getByRole('button', { name: '沉浸', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByText('准备声音中', { exact: true }).waitFor({ timeout: 5000 }).catch(async e => {
    console.log(JSON.stringify({ hero: await page.locator('.immersive-hero').innerText(), requests, errors }));
    throw e;
  });
  // Cancel an in-flight request: its late response must never start playback.
  await page.getByRole('button', { name: '静音', exact: true }).click();
  await pending.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([1, 2, 3]) }).catch(() => {});
  assert.equal(await page.evaluate(() => window.__audioLog.filter(x => x === 'play').length), 0);
  mode = 'success';
  await page.getByRole('button', { name: '取消静音' }).click();
  await page.getByRole('button', { name: '听听吱呀的新声音' }).click();
  await page.getByText('吱呀中', { exact: true }).waitFor();
  const mic = page.getByRole('button', { name: '按住说话', exact: true });
  await mic.focus(); await page.keyboard.press('Enter');
  await page.getByText('聆听中', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__audio.src), '');
  assert.ok((await page.evaluate(() => window.__audioLog)).includes('pause'));
  await page.keyboard.press('Escape');
  // Transport failure is visible and recoverable by a user gesture.
  mode = 'error';
  await page.getByRole('button', { name: '听听吱呀的新声音' }).click();
  const retry = page.getByRole('button', { name: '吱呀的语音暂时没连上，点击重试。' });
  await retry.waitFor();
  mode = 'success'; await retry.click();
  await page.getByText('吱呀中', { exact: true }).waitFor();
  await page.getByRole('button', { name: '挂断并退出沉浸' }).click();
  assert.equal(await page.evaluate(() => window.__audio.src), '');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cancelLateResponse: 'pass', interruptOnMic: 'pass', retry: 'pass', exit: 'pass', requests }));
} finally { await browser.close(); }
