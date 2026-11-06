// Run goal-preview.mjs first: real isolated storage/routes, deterministic model.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const base = 'http://127.0.0.1:5194';
const results = [];
const open = async page => {
  await page.waitForFunction(() => {
    const id = localStorage.getItem('xian.clientId');
    return !!localStorage.getItem(`xian-app-guide-v1:${id}`);
  });
  if (await page.locator('.app-guide').count()) await page.getByRole('button', { name: '跳过引导' }).click();
  await page.getByRole('button', { name: '我的手册', exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem(`xian-library-guide-v1:${localStorage.getItem('xian.clientId')}`));
  const continueButton = page.getByRole('button', { name: '继续填写引导 →' });
  // Filling is now explicit; opening the handbook never launches a second tour.
  if (saved === 'preferences' || saved === 'goals' || (!saved && await page.locator('.library-dot').count())) {
    await continueButton.click();
  }
};
const close = page => page.getByRole('button', { name: '关闭我的手册' }).click();
async function layout(page, width) {
  const result = await page.locator('.library-overlay').evaluate(root => ({
    overflow: root.scrollWidth > innerWidth,
    buttonClipped: [...root.querySelectorAll('button')].filter(e => e.getClientRects().length && !e.closest('[hidden]')).some(e => {
      const r = e.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1;
    }),
    nextVisible: (() => {
      const r = root.querySelector('.preference-guide-next')?.getBoundingClientRect();
      return !r || (r.top >= 0 && r.bottom <= innerHeight);
    })(),
  }));
  assert.deepEqual(result, { overflow: false, buttonClipped: false, nextVisible: true }, `${width}: ${JSON.stringify(result)}`);
}
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await open(page);
    await page.locator('.preferences-guided').waitFor();
    await layout(page, width);
    await page.getByRole('button', { name: '开始选一选 →' }).click();
    await page.getByRole('button', { name: /慢慢溜达/ }).click();
    await page.locator('.preference-guide-heading').filter({ hasText: /2 \/ 6/ }).waitFor();
    await close(page);
    await page.reload();
    await open(page);
    await page.locator('.preferences-guided').waitFor();
    assert.match(await page.locator('.preference-guide-heading').innerText(), /2 \/ 6/);
    await page.getByRole('button', { name: '← 上一题' }).click();
    assert.equal(await page.getByRole('button', { name: /慢慢溜达/ }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: /慢慢溜达/ }).click();
    for (const [name, step] of [[/有点新鲜/, 3], [/一个人/, 4], [/零成本/, 5]]) {
      await page.getByRole('button', { name }).click();
      await page.locator('.preference-guide-heading').filter({ hasText: `${step} / 6` }).waitFor();
    }
    await page.getByRole('button', { name: '收集图鉴', exact: true }).click();
    await page.getByRole('button', { name: '下一题 →' }).click();
    await page.getByRole('textbox', { name: '兴趣爱好（选填）' }).fill('绘画、观察建筑');
    await page.getByRole('textbox', { name: '雷点（选填）' }).fill('不拍照');
    await layout(page, width);
    if (width === 320) {
      await page.route('**/api/profile', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
      await page.getByRole('button', { name: '保存喜好，去写心愿 →' }).click();
      await page.getByText('喜好暂时没能保存，请再试一次。').waitFor();
      assert.equal(await page.locator('.preferences-guided').count(), 1);
      assert.equal(await page.getByRole('textbox', { name: '兴趣爱好（选填）' }).inputValue(), '绘画、观察建筑');
      await page.unroute('**/api/profile');
    }
    await page.getByRole('button', { name: '保存喜好，去写心愿 →' }).click();
    await page.getByRole('textbox', { name: '我的愿望', exact: true }).waitFor();
    const clientId = await page.evaluate(() => localStorage.getItem('xian.clientId'));
    const profile = await (await page.request.get(`${base}/api/profile?clientId=${clientId}`)).json();
    assert.equal(profile.interests, '绘画、观察建筑');
    assert.equal(profile.avoids, '不拍照');
    assert.equal(profile.onboarded, true);
    assert.equal(await page.locator('.goal-guide-details').count(), 0);
    await page.getByRole('button', { name: '做一本街区观察册', exact: true }).click();
    await page.getByRole('textbox', { name: '我的愿望', exact: true }).fill('做一本街区观察册，记录路过的建筑');
    await close(page);
    await page.reload();
    await open(page);
    await page.locator('.goals-guided').waitFor();
    assert.equal(await page.getByRole('textbox', { name: '我的愿望', exact: true }).inputValue(), '做一本街区观察册，记录路过的建筑');
    await page.getByRole('button', { name: '替我安排章节 →' }).click();
    await page.getByRole('button', { name: '开启心愿计划' }).waitFor();
    assert.equal(await page.locator('.library-guide-done').count(), 0);
    await close(page);
    await page.reload();
    await open(page);
    await page.getByRole('button', { name: '开启心愿计划' }).waitFor();
    await page.getByRole('button', { name: '开启心愿计划' }).click();
    await page.locator('.library-guide-done').waitFor();
    await layout(page, width);
    await page.getByRole('button', { name: '翻开我的手册 →' }).click();
    await close(page);
    // Existing users without the new local marker must not be re-onboarded.
    await page.evaluate(id => localStorage.removeItem(`xian-library-guide-v1:${id}`), clientId);
    await page.reload();
    await open(page);
    await page.locator('.goals-cover').first().waitFor();
    assert.equal(await page.locator('.library-guide').count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, height, guide: 'pass', reloadResume: 'pass', save: 'pass', previewConfirm: 'pass', completion: 'pass' });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base);
  await open(page);
  await page.locator('.preferences-guided').waitFor();
  await page.getByRole('button', { name: '稍后再填' }).click();
  await close(page);
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: '继续填写引导 →' }).waitFor();
  assert.equal(await page.locator('.preferences-guided').count(), 0);
  await page.getByRole('button', { name: '继续填写引导 →' }).click();
  await page.locator('.preferences-guided').waitFor();
  await page.getByRole('tab', { name: '日常记录' }).click();
  assert.equal(await page.locator('.preferences-guided').count(), 0);
  await page.getByRole('tab', { name: '喜好', exact: false }).click();
  await page.getByRole('button', { name: '继续填写引导 →' }).click();
  await page.screenshot({ path: '/tmp/xian-onboarding-mobile.png' });
  const animated = await page.locator('.library-guide-track .current i').evaluate(e => getComputedStyle(e).animationName);
  assert.equal(animated, 'guide-ring');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.library-guide-track .current i').evaluate(e => getComputedStyle(e).animationName), 'none');
  results.push({ skipReload: 'pass', explicitResume: 'pass', tabExit: 'pass', reducedMotion: 'pass' });
  await context.close();
  const raceContext = await browser.newContext();
  const racePage = await raceContext.newPage();
  await racePage.goto(base);
  await open(racePage);
  await racePage.locator('.preferences-guided').waitFor();
  await racePage.getByRole('button', { name: '开始选一选 →' }).click();
  for (let i = 0; i < 4; i++) await racePage.getByRole('button', { name: '留白，下一题 →' }).click();
  await racePage.getByRole('button', { name: '下一题 →' }).click();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let submitted;
  const requestSeen = new Promise(resolve => { submitted = resolve; });
  await racePage.route('**/api/profile', async route => {
    if (route.request().method() === 'PUT') { submitted(); await barrier; }
    await route.continue();
  });
  await racePage.getByRole('button', { name: '保存喜好，去写心愿 →' }).click();
  await requestSeen;
  await racePage.getByRole('button', { name: '稍后再填' }).click();
  release();
  await racePage.getByText('喜好已经记下了，下次推荐会参考它。').waitFor();
  assert.equal(await racePage.locator('.library-guide').count(), 0);
  results.push({ skipDuringSave: 'pass', existingUsers: 'pass' });
  await raceContext.close();
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
