// Run goal-preview.mjs first. Real routes/storage; deterministic model fixture.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const base = 'http://127.0.0.1:5194';
const results = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function narrate(page) {
  for (let i = 0; i <= 8; i++) {
    const pending = page.locator('.guide-narration:not(.is-ready)');
    if (!await pending.count()) return;
    if ((await pending.getAttribute('class'))?.includes('has-scene')) {
      await button(page, '跳过').waitFor();
      await button(page, '跳过').click();
      await expectStep(page, 5);
      return;
    }
    const sentence = await pending.locator('.guide-caption-label > span:last-child').getAttribute('aria-label');
    await button(page, '跳过这一步').click();
    await page.waitForFunction(previous => {
      const pending = document.querySelector('.guide-narration:not(.is-ready)');
      return !pending || pending.querySelector('.guide-caption-label > span:last-child').getAttribute('aria-label') !== previous;
    }, sentence);
  }
  assert.fail('Narration did not finish');
}
async function expectStep(page, step) {
  await page.locator(`.app-guide-progress[aria-label="应用引导，第 ${[0, 5, 6, 7].indexOf(step) + 1} 页，共 4 页"]`).waitFor();
}
async function checkLayout(page) {
  await page.locator('.app-guide-controls').scrollIntoViewIfNeeded();
  assert.deepEqual(await page.locator('.app-guide').evaluate(root => {
    const controls = root.querySelector('.app-guide-controls');
    const footer = controls.getBoundingClientRect();
    const skip = root.querySelector('.app-guide-top button').getBoundingClientRect();
    const book = root.querySelector('.app-guide-book').getBoundingClientRect();
    return {
      overflow: root.scrollWidth > innerWidth + 1,
      clippedHorizontally: [...root.querySelectorAll('button,input,textarea')].filter(e => e.getClientRects().length && !e.closest('[hidden]')).some(e => {
        const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
      }),
      footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1,
      skipVisible: skip.top >= 0 && skip.bottom <= innerHeight,
      footerButtons: controls.querySelectorAll('button').length <= 2,
      controlsInPage: controls.closest('.app-guide-page') !== null && getComputedStyle(controls).position === 'static' && !root.querySelector('.app-guide-footer'),
      unifiedFonts: [...root.querySelectorAll('h1,h2,p,button,input,textarea,label')].filter(e => e.getClientRects().length).every(e => getComputedStyle(e).fontFamily.startsWith('"LXGW WenKai"')),
      boundedColumn: book.width <= 480 && book.width <= innerWidth,
      touchTargets: [...root.querySelectorAll('button')].filter(e => e.getClientRects().length && !e.closest('[hidden]')).every(e => {
        const rect = e.getBoundingClientRect(); return rect.height >= 44 && rect.width >= 44;
      }),
      mobileMainAction: innerWidth > 600 || root.querySelector('.app-guide-next').classList.contains('app-guide-scene-skip') || (root.querySelector('.app-guide-next').classList.contains('app-guide-round') ? root.querySelector('.app-guide-next').getBoundingClientRect().width === 48 : root.querySelector('.app-guide-next').getBoundingClientRect().width >= (controls.querySelectorAll('button').length === 2 ? (footer.width - 12) / 2 - 1 : book.width - 140)),
    };
  }), { overflow: false, clippedHorizontally: false, footerVisible: true, skipVisible: true, footerButtons: true, controlsInPage: true, unifiedFonts: true, boundedColumn: true, touchTargets: true, mobileMainAction: true });
}
async function reachPreferences(page) {
  await narrate(page);
  if (await button(page, '记下我的喜好 →').count()) await button(page, '记下我的喜好 →').click();
  await expectStep(page, 5);
  await narrate(page);
}
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      window.geoCalls = 0;
      navigator.geolocation.getCurrentPosition = () => { window.geoCalls++; };
      navigator.geolocation.watchPosition = () => { window.geoCalls++; return 1; };
    });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (['POST', 'PUT', 'PATCH'].includes(r.method())) writes.push(r.url()); });
    await page.goto(base);
    await expectStep(page, 0);
    assert.match(await page.locator('.app-guide-top').innerText(), /支线任务/);
    assert.match(await page.locator('.guide-caption-text').innerText(), /白天努力工作/);
    assert.equal(await page.locator('.guide-caption-text').count(), 1);
    assert.equal(await page.locator('.guide-caption').count(), 0, 'Captions have no card wrapper');
    await checkLayout(page);
    if (width === 390) await page.screenshot({ path: '/tmp/xian-app-guide-welcome.png' });
    for (let i = 0; i < 4; i++) await button(page, '跳过这一步').click();
    for (const [scene, title] of [
      ['home', '给桌上的小物办个展'],
    ]) {
      assert.equal(await page.locator('.scene-try-note').innerText(), '对话演示');
      await button(page, '跳过').waitFor();
      assert.equal(await page.locator('.app-guide-controls button').count(), 1);
      assert.equal(await page.locator('.app-guide-controls button').innerText(), '跳过');
      assert.equal(await page.locator('.scene-try-composer textarea').inputValue(), '周末一个人在家，有15分钟，想做点有趣的事');
      assert.equal(await page.locator('.scene-try-composer textarea').evaluate(e => getComputedStyle(e).fontSize), '16px');
      await checkLayout(page);
      await page.locator('.scene-try-send').click();
      assert.equal(await page.locator('.scene-message.is-user').count(), 1);
      assert.match(await page.locator('.scene-message.is-agent').innerText(), new RegExp(title));
      assert.deepEqual(await page.locator('.scene-try-card').evaluate(e => {
        const text = e.querySelector('strong').getBoundingClientRect();
        const action = e.querySelector('button').getBoundingClientRect();
        return { horizontal: text.right <= action.left, border: getComputedStyle(e).borderTopWidth, outline: getComputedStyle(e.querySelector('button')).outlineStyle };
      }), { horizontal: true, border: '0px', outline: 'none' });
      await button(page, '认领任务').click();
      assert.equal(await page.locator('.scene-message.is-user').count(), 1);
      assert.equal(await page.getByText('就选这个，怎么开始？', { exact: true }).count(), 0);
      const text = await page.locator(`#scene-record-${scene}`).inputValue();
      assert.ok(text.length > 20);
      assert.equal(await page.locator(`#scene-record-${scene}`).getAttribute('readonly'), '');
      assert.equal(await page.locator('.scene-try form, .scene-try [required]').count(), 0);
      await checkLayout(page);
      if (width === 390 && scene === 'home') {
        await page.setViewportSize({ width, height: 400 });
        await page.locator(`#scene-record-${scene}`).scrollIntoViewIfNeeded();
        await checkLayout(page);
        assert.equal(await page.locator('.app-guide-welcome > img').evaluate(e => e.getBoundingClientRect().width), 64);
        assert.equal(await page.locator(`#scene-record-${scene}`).inputValue(), text);
        await page.setViewportSize({ width, height });
      }
      if (width === 390) await page.screenshot({ path: `/tmp/xian-guide-scene-${scene}.png` });
      await button(page, '发送示例作品 ↑').click();
      assert.equal(await page.locator('.scene-message.is-user blockquote').innerText(), text);
      assert.equal(await page.locator('.scene-message.is-user').count(), 2);
      assert.equal(await page.locator('.scene-message.is-agent').count(), 3);
      assert.match(await page.locator('.scene-try-record').innerText(), /我的手册/);
      await checkLayout(page);
      assert.equal(await page.locator('.app-guide-controls .app-guide-round').count(), 0);
      assert.equal(await page.locator('.app-guide-controls button').evaluateAll(items => items.every(e => getComputedStyle(e).borderRadius === '9999px')), true);
      await button(page, '再看一遍').click();
      assert.equal(await page.locator('.scene-message').count(), 0);
      assert.equal(await page.locator('.scene-try-composer textarea').inputValue(), '周末一个人在家，有15分钟，想做点有趣的事');
      await page.locator('.scene-try-send').click();
      await button(page, '认领任务').click();
      await button(page, '发送示例作品 ↑').click();
      await button(page, '下一步').click();
    }
    assert.equal(await button(page, '带我试一次 →').count(), 0);
    assert.equal(await page.evaluate(() => window.geoCalls), 0);
    assert.deepEqual(writes, [], 'Demos must not create user data');
    await page.getByRole('heading', { name: '让支线更合你的心意' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /慢慢溜达/ }).count(), 0, 'Introduction precedes choices');
    await checkLayout(page);
    if (width === 390) await page.screenshot({ path: '/tmp/xian-preference-intro.png' });
    await page.reload();
    await button(page, '开始选一选 →').click();
    await page.getByRole('button', { name: /慢慢溜达/ }).click();
    await page.locator('.preference-guide-heading').filter({ hasText: /2 \/ 6/ }).waitFor();
    assert.match(await page.locator('.preference-guide-heading').innerText(), /2 \/ 6/);
    await page.reload();
    await expectStep(page, 5);
    await narrate(page);
    await page.locator('.preference-guide-heading').filter({ hasText: /2 \/ 6/ }).waitFor();
    assert.match(await page.locator('.preference-guide-heading').innerText(), /2 \/ 6/);
    await checkLayout(page);
    for (const [name, step] of [[/有点新鲜/, 3], [/一个人/, 4], [/零成本/, 5]]) {
      await page.getByRole('button', { name }).click();
      await page.locator('.preference-guide-heading').filter({ hasText: `${step} / 6` }).waitFor();
    }
    await button(page, '收集图鉴').click();
    await button(page, '下一题 →').click();
    await page.getByRole('textbox', { name: '兴趣爱好（选填）' }).fill('绘画、观察建筑');
    await page.getByRole('textbox', { name: '雷点（选填）' }).fill('不拍照');
    await checkLayout(page);
    if (width === 320) {
      await page.route('**/api/profile', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
      await button(page, '保存喜好，去写心愿 →').click();
      await page.getByText('喜好暂时没能保存，请再试一次。').waitFor();
      await expectStep(page, 5);
      await page.unroute('**/api/profile');
    }
    await button(page, '保存喜好，去写心愿 →').click();
    await expectStep(page, 6);
    await narrate(page);
    const wish = page.getByRole('textbox', { name: '我的愿望', exact: true });
    await wish.fill('做一本街区观察册，记录路过的建筑');
    await page.reload();
    await expectStep(page, 6);
    await narrate(page);
    assert.equal(await wish.inputValue(), '做一本街区观察册，记录路过的建筑');
    await checkLayout(page);
    if (width === 390) await page.screenshot({ path: '/tmp/xian-app-guide-wish.png' });
    await button(page, '记下心愿 →').click();
    await button(page, '记好了，继续 →').waitFor();
    assert.equal(await page.locator('.goals-chapters, .goals-rewards, .goals-progress').count(), 0);
    assert.equal(await page.locator('.goals-reason').innerText(), '做一本街区观察册，记录路过的建筑');
    await expectStep(page, 6);
    await page.reload();
    await narrate(page);
    await button(page, '记好了，继续 →').click();
    await expectStep(page, 7);
    await narrate(page);
    await checkLayout(page);
    const clientId = await page.evaluate(() => localStorage.getItem('xian.clientId'));
    const profile = await (await page.request.get(`${base}/api/profile?clientId=${clientId}`)).json();
    assert.equal(profile.interests, '绘画、观察建筑');
    assert.equal(profile.avoids, '不拍照');
    if (width === 390) {
      await button(page, '开始体验 →').click();
      await page.locator('.chat-header').waitFor();
      await button(page, '我的手册').click();
      await button(page, '使用指南').click();
      await expectStep(page, 0);
      await button(page, '跳过引导').click();
      await page.locator('.chat-header').waitFor();
      await page.reload();
      await page.locator('.chat-header').waitFor();
    } else await button(page, '跳过引导').click();
    // Upgrading an existing account without a guide marker must not interrupt it.
    await page.evaluate(id => localStorage.removeItem(`xian-app-guide-v1:${id}`), clientId);
    await page.reload();
    await page.waitForFunction(id => localStorage.getItem(`xian-app-guide-v1:${id}`) === 'existing', clientId);
    assert.equal(await page.locator('.app-guide').count(), 0);
    await button(page, '我的手册').click();
    await page.locator('.goals-cover').first().waitFor();
    assert.equal(await page.locator('.library-guide').count(), 0);
    if (width === 320) {
      await page.evaluate(id => localStorage.setItem(`xian-app-guide-v1:${id}`, '3'), clientId);
      await page.reload();
      await expectStep(page, 0);
      assert.equal(await page.locator('.walkthrough').count(), 0, 'Old rehearsal pages must not return');
      await button(page, '跳过引导').click();
    }
    assert.deepEqual(errors, []);
    results.push({ width, height, fullGuide: 'pass', resume: 'pass', realForms: 'pass', existingAccount: 'pass' });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base);
  await expectStep(page, 0);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '跳过这一步');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '跳过引导');
  await page.waitForFunction(() => {
    const text = document.querySelector('.guide-caption-text > [aria-hidden]')?.textContent || '';
    return text === '白天努力工作，晚上疲惫地刷刷手机，一天就这样结束了。';
  });
  await button(page, '暂停').click();
  assert.equal(await page.locator('.guide-type-cursor').count(), 0);
  assert.equal(await page.locator('.guide-caption-text').evaluate(e => getComputedStyle(e).animationName), 'caption-enter');
  const pausedText = await page.locator('.guide-caption-text').innerText();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.guide-caption-text').innerText(), pausedText);
  await button(page, '继续播放').click();
  for (let i = 0; i < 4; i++) await button(page, '跳过这一步').click();
  assert.equal(await page.locator('.scene-try-send').evaluate(e => getComputedStyle(e, '::after').animationName), 'scene-send-hint');
  assert.equal(await page.locator('.scene-try-send').evaluate(e => getComputedStyle(e).animationName), 'scene-send-attention');
  assert.equal(await page.locator('.scene-try-send').evaluate(e => getComputedStyle(e, '::after').animationIterationCount), 'infinite');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.scene-try-send').evaluate(e => getComputedStyle(e, '::after').animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.scene-try-send').click();
  await page.mouse.move(0, 0);
  assert.equal(await button(page, '认领任务').evaluate(e => getComputedStyle(e).animationName), 'scene-send-attention');
  assert.equal(await button(page, '认领任务').evaluate(e => getComputedStyle(e, '::after').animationName), 'scene-send-hint');
  await button(page, '认领任务').click();
  await page.mouse.move(0, 0);
  assert.equal(await button(page, '发送示例作品 ↑').evaluate(e => getComputedStyle(e).animationName), 'scene-send-attention');
  assert.equal(await button(page, '发送示例作品 ↑').evaluate(e => getComputedStyle(e, '::after').animationName), 'scene-send-hint');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await button(page, '发送示例作品 ↑').evaluate(e => getComputedStyle(e).animationName), 'none');
  assert.equal(await button(page, '发送示例作品 ↑').evaluate(e => getComputedStyle(e, '::after').animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const sample = await page.locator('#scene-record-home').inputValue();
  await page.waitForTimeout(5000); // A checkpoint must survive the usual automatic reading pause.
  assert.equal(await page.locator('#scene-record-home').inputValue(), sample);
  assert.equal(await page.locator('.guide-narration').getAttribute('data-position'), 'left');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.guide-caption-text').evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await narrate(page);
  if (await button(page, '记下我的喜好 →').count()) await button(page, '记下我的喜好 →').click();
  await expectStep(page, 5);
  assert.equal(await page.locator('.guide-narration').count(), 0);
  await page.keyboard.press('Escape');
  await page.reload();
  await button(page, '使用指南').waitFor();
  assert.equal(await page.locator('.app-guide').count(), 0);
  await button(page, '我的手册').click();
  assert.equal(await page.locator('.preferences-guided').count(), 0);
  await page.locator('.library-overlay').getByRole('button', { name: '使用指南' }).click();
  await reachPreferences(page);
  await button(page, '这项稍后再填 →').click();
  await expectStep(page, 6);
  await narrate(page);
  await button(page, '这项稍后再填 →').click();
  await expectStep(page, 7);
  assert.equal(await page.locator('.app-guide-page').evaluate(e => getComputedStyle(e).animationName), 'guide-page-in');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.app-guide-page').evaluate(e => getComputedStyle(e).animationName), 'none');
  await button(page, '跳过引导').click();
  await button(page, '使用指南').click();
  await reachPreferences(page);
  await button(page, '开始选一选 →').click();
  for (let i = 0; i < 4; i++) await button(page, '留白，下一题 →').click();
  await button(page, '下一题 →').click();
  let release, submitted;
  const barrier = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { submitted = resolve; });
  await page.route('**/api/profile', async route => {
    if (route.request().method() === 'PUT') { submitted(); await barrier; }
    await route.continue();
  });
  await button(page, '保存喜好，去写心愿 →').click();
  await seen;
  await button(page, '跳过引导').click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().method() === 'PUT');
  release();
  await (await response).finished();
  await button(page, '我的手册').click();
  await page.getByRole('tab', { name: /喜好/ }).click();
  await page.getByRole('button', { name: /慢慢溜达/ }).waitFor();
  assert.equal(await page.locator('.app-guide').count(), 0);
  results.push({ skipReload: 'pass', optionalForms: 'pass', replay: 'pass', focusTrap: 'pass', dynamicSpotlight: 'pass', animatedCaptions: 'pass', pauseAndContinue: 'pass', stagedActions: 'pass', reducedMotion: 'pass', lateSaveExit: 'pass' });
  await context.close();
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
