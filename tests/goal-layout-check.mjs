// Optional browser check. Run goal-preview.mjs first; requires Playwright.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5194');
    await page.getByRole('button', { name: '跳过引导' }).click();
    await page.getByRole('button', { name: '我的手册', exact: true }).click();
    await page.getByRole('tab', { name: '心愿计划' }).click();
    await page.getByRole('button', { name: '＋ 种下一颗愿望' }).click();
    await page.getByRole('textbox', { name: '我的愿望', exact: true }).fill('做一本属于自己的观察册');
    assert.equal(await page.locator('.goals-form input, .goals-form select').count(), 0);
    await page.getByRole('button', { name: '关闭我的手册' }).click();
    await page.getByRole('button', { name: '我的手册', exact: true }).click();
    await page.getByRole('button', { name: '＋ 种下一颗愿望' }).click();
    assert.equal(await page.getByRole('textbox', { name: '我的愿望', exact: true }).inputValue(), '做一本属于自己的观察册');
    await page.getByRole('button', { name: '替我安排章节 →' }).click();
    await page.getByRole('button', { name: '开启心愿计划' }).waitFor();
    assert.equal(await page.locator('.goals-chapter').count(), 3);
    await page.getByRole('button', { name: '修改愿望与安排' }).click();
    assert.equal(await page.getByRole('textbox', { name: '我的愿望', exact: true }).inputValue(), '做一本属于自己的观察册');
    await page.getByRole('textbox', { name: '我的愿望', exact: true }).fill('留下属于自己的三个发现');
    await page.getByRole('button', { name: '替我安排章节 →' }).click();
    await page.getByRole('button', { name: '开启心愿计划' }).waitFor();
    assert.match(await page.locator('.goals-reason').innerText(), /留下属于自己的三个发现/);
    await page.getByRole('button', { name: '开启心愿计划' }).click();
    await page.getByRole('button', { name: '先歇一阵', exact: true }).click();
    await page.getByRole('button', { name: '继续生长', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '今天想推进一点 →' }).count(), 0);
    await page.getByRole('button', { name: '继续生长', exact: true }).click();
    await page.getByRole('button', { name: '今天想推进一点 →' }).waitFor();
    await page.getByLabel('此刻有空').selectOption('5');
    assert.equal(await page.getByRole('button', { name: '今天想推进一点 →' }).isDisabled(), true);
    await page.getByLabel('此刻有空').selectOption('15');
    assert.equal(await page.getByRole('button', { name: '今天想推进一点 →' }).isEnabled(), true);
    const layout = await page.evaluate(() => {
      const root = document.querySelector('.goals-overlay');
      const buttons = [...root.querySelectorAll('button')].filter(e => e.getBoundingClientRect().height);
      return {
        width: innerWidth, contentWidth: root.scrollWidth,
        smallControls: buttons.filter(e => e.getBoundingClientRect().height < 44).map(e => e.textContent),
        inputSizes: [...root.querySelectorAll('input,textarea,select')].map(e => parseFloat(getComputedStyle(e).fontSize)),
      };
    });
    assert.ok(layout.contentWidth <= width, JSON.stringify(layout));
    assert.equal(layout.smallControls.length, 0, JSON.stringify(layout));
    assert.ok(layout.inputSizes.every(n => n >= 16));
    await page.reload();
    await page.getByRole('button', { name: '我的手册', exact: true }).click();
    await page.locator('.goals-cover').first().click();
    await page.getByRole('button', { name: '先歇一阵', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    results.push({ width, height, creation: 'pass', draftRetention: 'pass', pauseResume: 'pass', timeGuard: 'pass', reload: 'pass', layout });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
