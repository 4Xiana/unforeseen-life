// Run against goal-preview.mjs: real UI/routes/storage, deterministic model.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const titles = ['给此刻一张声签', '听见一点变化', '装订声音小册'];
const proofs = [
  ['空调发出低鸣，窗边有鸟叫，手边键盘有打字声。', '给鸟叫起名“窗边来客”，它像一支清亮的短笛。'],
  ['上次的鸟叫很清亮，这次只听到风声，鸟叫消失了。', '鸟叫消失了。我猜可能是鸟飞走了，但这只是猜测。'],
  ['小册名《窗边来客》；第一章：清亮的短笛；第二章：只听到风声。', '声音会变化，留在记录里的细节也会积累。下次想听下雨落在窗沿的声音。'],
];
async function submit(text) {
  const input = page.getByRole('textbox', { name: '文字证物', exact: true });
  await input.fill(text);
  await page.getByRole('button', { name: '提交记录', exact: true }).click();
}
async function inspectContext(root) {
  const panel = root.locator('.journey-context').last();
  await panel.locator('summary').click();
  await panel.locator('.journey-record').first().waitFor();
  assert.match(await panel.innerText(), /窗边来客/);
}
try {
  await page.goto('http://127.0.0.1:5194');
  await page.getByRole('button', { name: '跳过引导' }).click();
  await page.getByRole('button', { name: '我的手册', exact: true }).click();
  await page.getByRole('tab', { name: '心愿计划' }).click();
  await page.getByRole('button', { name: '体验示例 · 声音小册' }).click();
  assert.equal(await page.locator('.goals-chapter').count(), 0);
  assert.equal(await page.getByRole('textbox', { name: '我的愿望', exact: true }).inputValue(), '做一本自己的日常声音小册');
  await page.getByRole('button', { name: '替我安排章节 →' }).click();
  await page.getByRole('button', { name: '开启心愿计划' }).click();
  for (let chapter = 0; chapter < 3; chapter++) {
    await page.getByRole('button', { name: '今天想推进一点 →' }).click();
    const activity = page.getByRole('button', { name: new RegExp(titles[chapter]) }).filter({ has: page.locator('h3') });
    await activity.waitFor();
    if (chapter > 0) await inspectContext(page);
    await activity.click();
    await page.getByRole('textbox', { name: '文字证物', exact: true }).waitFor();
    if (chapter === 0) {
      const response = page.waitForResponse(r => r.url().includes('/message') && r.request().method() === 'POST');
      await submit('我做完了');
      const rejectedResponse = await response;
      await rejectedResponse.finished();
      const events = (await rejectedResponse.body()).toString('utf8').split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
      assert.ok(events.some(event => event.type === 'evidence_reviewed' && event.review.verdict === 'reject'));
      assert.ok(events.filter(event => event.type === 'step_published').every(event => event.step.index === 0));
    }
    if (chapter === 1) {
      await page.reload();
      await page.getByRole('textbox', { name: '文字证物', exact: true }).waitFor();
      await inspectContext(page);
      await page.getByTitle('任务进度', { exact: true }).click();
      const drawer = page.getByRole('dialog', { name: '任务进度', exact: true });
      await inspectContext(drawer);
      await drawer.getByRole('button', { name: '关闭', exact: true }).click();
      await page.getByTitle('沉浸通话模式：语音对话 + 字幕').click();
      const sheet = page.locator('.call-sheet');
      await sheet.waitFor();
      await inspectContext(sheet);
      await sheet.getByRole('button', { name: '关闭', exact: true }).click();
      await page.getByTitle('退出沉浸，返回对话').click();
    }
    for (const proof of proofs[chapter]) {
      const response = page.waitForResponse(r => r.url().includes('/message') && r.request().method() === 'POST');
      await submit(proof);
      await (await response).finished();
    }
    await page.getByRole('button', { name: '查看心愿成果 →' }).click();
    await page.locator('.goals-cover').first().click();
    assert.equal(await page.locator('.goals-chapter.is-done').count(), chapter + 1);
    assert.match(await page.locator('.goals-evidence').first().innerText(), /空调发出低鸣/);
  }
  assert.equal(await page.locator('.goals-stamps .earned').count(), 3);
  await page.getByText('从一个念头，到这一册真实发生过的日常。它已经属于你了。').waitFor();
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载我的成果' }).click();
  const download = await downloadReady;
  const text = await readFile(await download.path(), 'utf8');
  for (const chapter of proofs) for (const proof of chapter) assert.ok(text.includes(proof));
  assert.deepEqual(errors, []);
  console.log('PASS: example form → confirm → reject bare completion → 3 chapters → chat/drawer/call prior evidence → reload → 3 rewards → original-text export');
} finally { await context.close(); await browser.close(); }
