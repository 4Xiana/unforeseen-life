// Isolated SQLite and deterministic extraction: start goal-preview.mjs first.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const base = 'http://127.0.0.1:5194';
const results = [];
async function open(page) {
  await page.getByRole('button', { name: '我的手册', exact: true }).click();
  await page.getByRole('tab', { name: /灵感收藏/ }).click();
  await page.locator('.inspiration-view').waitFor();
}
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button', { name: '跳过引导' }).click();
    await open(page);
    const raw = '我想用三片落叶做秋日拼贴，在家15分钟，不拍照。';
    await page.getByRole('textbox', { name: '这次想留下什么灵感？' }).fill(raw);
    await page.getByRole('button', { name: '让吱呀整理 →' }).click();
    await page.locator('.inspiration-preview').waitFor();
    await page.getByRole('textbox', { name: '任务名称' }).fill(`我的秋日拼贴${width}`);
    await page.getByRole('button', { name: /收藏这条灵感/ }).click();
    await page.getByText('✅ 灵感收好了。下次有合适的空闲，吱呀会想起它。').waitFor();
    const card = page.locator('.inspiration-saved').first();
    assert.equal(await card.locator('h4').innerText(), `我的秋日拼贴${width}`);
    await card.getByText('看看原文与来源').click();
    assert.equal(await card.locator('.inspiration-original').innerText(), raw);
    if (width === 320) {
      await page.getByRole('button', { name: '关闭我的手册' }).click();
      if (!await page.getByRole('textbox', { name: '位置、空闲时间和同行的人' }).count()) await page.getByRole('button', { name: '改用键盘输入' }).click();
      await page.getByRole('textbox', { name: '位置、空闲时间和同行的人' }).fill('我在家有15分钟，一个人，不花钱');
      await page.getByRole('button', { name: '发送，让吱呀带你出发' }).click();
      await page.locator('.ticket-card').filter({ hasText: `我的秋日拼贴${width}` }).waitFor();
      assert.equal(await page.locator('.ticket-card').count(), 2);
      assert.match(await page.locator('.ticket-card').first().innerText(), /你收藏的灵感/);
      await open(page);
    }
    await card.getByRole('button', { name: '暂不推荐' }).click();
    await card.getByText('◌ 暂不推荐').waitFor();
    await page.reload();
    await open(page);
    assert.equal(await page.locator('.inspiration-saved h4').innerText(), `我的秋日拼贴${width}`);
    await page.getByRole('button', { name: '恢复推荐' }).click();
    await page.getByText('♡ 会在合适时推荐').waitFor();
    const invalidUrl = 'http://127.0.0.1:5184/' + '很长的来源地址'.repeat(20);
    await page.getByRole('textbox', { name: '这次想留下什么灵感？' }).fill(invalidUrl);
    await page.getByRole('button', { name: '让吱呀整理 →' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('textbox', { name: '这次想留下什么灵感？' }).inputValue(), invalidUrl);
    await page.getByRole('button', { name: '关闭我的手册' }).click();
    await page.reload(); await open(page);
    assert.equal(await page.getByRole('textbox', { name: '这次想留下什么灵感？' }).inputValue(), invalidUrl);
    const layout = await page.locator('.library-overlay').evaluate(root => ({
      overflow: root.scrollWidth > innerWidth,
      clipped: [...root.querySelectorAll('button,input,textarea')].filter(e => e.getClientRects().length && !e.closest('[hidden]')).some(e => {
        const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
      }),
    }));
    assert.deepEqual(layout, { overflow: false, clipped: false });
    await page.getByRole('button', { name: '移出收藏' }).click();
    await page.getByRole('button', { name: '留下它' }).click();
    assert.equal(await page.locator('.inspiration-saved').count(), 1);
    await page.getByRole('button', { name: '移出收藏' }).click();
    await page.getByRole('button', { name: '确认移出' }).click();
    await page.locator('.inspiration-saved').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    results.push({ width, height, collection: 'pass', persistence: 'pass', errorDraft: 'pass', layout: 'pass' });
    await context.close();
  }
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
