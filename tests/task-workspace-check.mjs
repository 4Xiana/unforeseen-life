// Exercise the hosted app in the shared browser. Every API write is intercepted.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = await browser.contexts()[0].newPage();
page.setDefaultTimeout(12000);
page.setDefaultNavigationTimeout(30000);
const base = process.env.TASK_TEST_URL || 'http://localhost:8801';
const client = `task-ui-fixture-${Date.now()}`, sessionId = `${client}-session`;
const output = '.cache/task-workspace';
mkdirSync(output, { recursive: true });
const first = { index: 0, instruction: '挑出桌上三件小物，给它们起一个展览名字。', hint: '不用买东西，眼前的就很好。', submissionType: 'text', proofPrompt: '写下三件小物和展览的名字。', suggestedSeconds: 180 };
const second = { index: 1, instruction: '把三件小物摆在一起，留下一张小展览的照片。', submissionType: 'photo', proofPrompt: '拍下你的展览，并说明最喜欢的一个细节。' };
const activity = { id: 'fixture-exhibit', title: '桌上的小小展览', hook: '用眼前的小物，留下一点自己的想象。', tags: ['15分钟', '在家'], category: 'create' };
const other = { ...activity, id: 'fixture-sound', title: '听听房间的声音' };
const saved = { sessionId, clientId: client, status: 'idle', snapshot: { fsmState: 'S0', proposedActivities: [], selectedActivity: null, currentStepIndex: 0 }, events: [] };
const handbook = { clientId: client, quests: [], badges: [], stats: { total: 0, weekCount: 0, earnedCount: 0, byCategory: { explore: 0, organize: 0, create: 0, connect: 0, sense: 0 } } };
const profile = { clientId: client, onboarded: true, energy: 'any', budget: 'any', social: 'any', novelty: 0, mechs: [], interests: '', avoids: '', pairVotes: {} };
let eventId = 0, rejected = false, failSelection = true, failPhoto = true, selectionHold = null;
let originalClient, originalSession;
const writes = [], errors = [];
const append = events => { for (const event of events) saved.events.push({ id: ++eventId, at: Date.now(), event }); return events; };
append([{ type: 'turn_start' }, { type: 'text_delta', text: '想给自己留一点什么时间？和我说说吧。' }, { type: 'turn_complete', fsmState: 'S0' }]);
const response = (route, events) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: append(events).map(event => `data: ${JSON.stringify(event)}\n\n`).join('') });
const change = to => { const from = saved.snapshot.fsmState; saved.snapshot.fsmState = to; return { type: 'state_changed', from, to, reason: 'fixture' }; };
const userTurn = text => [{ type: 'user_message', content: text }, { type: 'turn_start' }];
page.on('pageerror', error => errors.push(error.message));
await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = () => {}; navigator.geolocation.watchPosition = () => 1; });
await page.route('**/api/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  const method = req.method();
  if (method === 'GET') {
    if (path.startsWith('/api/session/')) return route.fulfill({ json: saved });
    if (path === '/api/profile') return route.fulfill({ json: profile });
    if (path === '/api/handbook') return route.fulfill({ json: handbook });
    if (path === '/api/quest-pairs' || path === '/api/goals' || path === '/api/quest-threads') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: {} });
  }
  const data = req.headers()['content-type']?.includes('application/json') ? req.postDataJSON() : null;
  writes.push({ path, data });
  if (path.endsWith('/message')) {
    if (data.type === 'select_activity') {
      if (failSelection) { failSelection = false; return route.fulfill({ status: 503, json: { error: 'fixture unavailable' } }); }
      if (selectionHold) await selectionHold;
      saved.snapshot.selectedActivity = { ...activity, steps: [first, second] }; saved.snapshot.currentStepIndex = 0;
      return response(route, [...userTurn('我选桌上的小小展览'), change('S2'), { type: 'text_delta', text: '就从眼前的小物开始。' }, { type: 'step_published', step: first, total: 2, activityTitle: activity.title }, { type: 'turn_complete', fsmState: 'S2' }]);
    }
    if (data.type === 'submit_text') {
      if (!rejected) { rejected = true; return response(route, [...userTurn(data.text), { type: 'evidence_reviewed', stepIndex: 0, review: { available: true, verdict: 'reject', reason: '缺少展览名字', whatNeeded: '请补上展览名字，保留你已经写下的三件小物。' } }, { type: 'text_delta', text: '这三件小物有了，再给展览起个名字吧。' }, { type: 'step_published', step: first, total: 2, activityTitle: activity.title }, { type: 'turn_complete', fsmState: 'S2' }]); }
      saved.snapshot.currentStepIndex = 1;
      return response(route, [...userTurn(data.text), { type: 'evidence_reviewed', stepIndex: 0, review: { available: true, verdict: 'pass', reason: '真实内容齐备', whatNeeded: '' } }, { type: 'text_delta', text: '名字很有趣，接下来把它们摆在一起。' }, { type: 'step_published', step: second, total: 2, activityTitle: activity.title }, { type: 'turn_complete', fsmState: 'S2' }]);
    }
    if (data.type === 'abandon') { saved.snapshot.selectedActivity = null; return response(route, [...userTurn('先放下'), change('S0'), { type: 'text_delta', text: '好呀，我们再慢慢找。' }, { type: 'turn_complete', fsmState: 'S0' }]); }
    if (data.type === 'text') {
      if (saved.snapshot.fsmState === 'S2') return response(route, [...userTurn(data.text), { type: 'text_delta', text: '可以选杯子、钥匙和一张便签，不需要特别的材料。' }, { type: 'turn_complete', fsmState: 'S2' }]);
      saved.snapshot.proposedActivities = [activity, other]; saved.snapshot.selectedActivity = null;
      return response(route, [...userTurn(data.text), change('S1'), { type: 'text_delta', text: '有两件小事，看看今天想做哪一个。' }, { type: 'activities_proposed', activities: [activity, other] }, { type: 'turn_complete', fsmState: 'S1' }]);
    }
  }
  if (path.endsWith('/photo')) {
    assert.match(req.postData(), /我最喜欢杯子旁边的钥匙/);
    if (failPhoto) { failPhoto = false; return route.fulfill({ status: 503, json: { error: 'fixture photo unavailable' } }); }
    handbook.stats.total = 1;
    return response(route, [...userTurn('我最喜欢杯子旁边的钥匙'), { type: 'evidence_reviewed', stepIndex: 1, review: { available: true, verdict: 'pass', reason: '照片和说明齐备', whatNeeded: '' } }, change('S3'), { type: 'text_delta', text: '小小展览完成了，这个细节是你留下的。' }, { type: 'handbook_updated', view: handbook, questTitle: activity.title, category: 'create', newBadges: [] }, { type: 'task_completed' }, { type: 'turn_complete', fsmState: 'S3' }]);
  }
  return route.fulfill({ status: 500, json: { error: `Unexpected write: ${path}` } });
});
const button = name => page.getByRole('button', { name, exact: true });
const chat = () => page.getByRole('textbox', { name: '和吱呀说说你的想法', exact: true });
const proof = () => page.getByRole('textbox', { name: '文字证物', exact: true });
const pick = () => page.locator('.ticket-card:not(:disabled)').filter({ hasText: activity.title });
async function send(text) { await chat().fill(text); await button('发送消息').click(); }
async function layout() {
  const result = await page.locator('.session-layout').evaluate(root => ({
    overflow: root.scrollWidth > innerWidth + 1,
    clipped: [...root.querySelectorAll('button,input,textarea')].filter(e => e.getClientRects().length && !e.closest('[inert]')).some(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }),
    small: [...root.querySelectorAll('button,summary')].filter(e => e.getClientRects().length && !e.closest('[inert]')).some(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }),
  }));
  assert.deepEqual(result, { overflow: false, clipped: false, small: false });
}
try {
  // Establish this origin before running the app, so fixture restoration never changes real state.
  await page.route(base + '/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Interaction fixture</title>' }));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  [originalClient, originalSession] = await page.evaluate(() => [localStorage.getItem('xian.clientId'), localStorage.getItem('xian-active-session')]);
  await page.evaluate(({ client }) => { localStorage.setItem('xian.clientId', client); localStorage.setItem(`xian-app-guide-v1:${client}`, 'done'); localStorage.removeItem('xian-active-session'); }, { client });
  await page.unroute(base + '/');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await chat().waitFor(); assert.equal(await page.locator('.task-workspace').count(), 0);
  await send('我在家，有15分钟，想放松一下'); await pick().waitFor(); await layout();
  await page.screenshot({ path: `${output}/01-conversation.png` });
  await pick().click(); await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.task-workspace').count(), 0, 'failed selection returns to conversation');
  assert.equal(await page.locator('.skeleton-card').count(), 0);
  let release; selectionHold = new Promise(resolve => { release = resolve; });
  await pick().click(); await page.getByRole('heading', { name: '支线选好了，准备开始' }).waitFor();
  assert.equal(await chat().count(), 0, 'task takes over before steps arrive');
  release(); selectionHold = null; await proof().waitFor();
  assert.equal(await proof().count(), 1, 'one active submission surface');
  await proof().fill('杯子、钥匙和便签'); await proof().press('Enter');
  assert.equal(writes.filter(w => w.data?.type === 'submit_text').length, 0, 'Enter creates a new line, not an accidental submission');
  await proof().fill('杯子、钥匙和便签');
  await button('暂停计时').click();
  const sizes = [[320, 568], [390, 844], [844, 390], [1280, 900]];
  for (const [width, height] of sizes) { await page.setViewportSize({ width, height }); await layout(); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/02-task.png` });
  await button('问问吱呀').click(); await page.getByRole('dialog', { name: '和吱呀聊聊', exact: true }).waitFor();
  assert.equal(await proof().count(), 0, 'task input is not exposed to assistive tech behind modal');
  assert.equal(await page.locator('.conversation-panel textarea').count(), 0);
  await send('没有特别的小物怎么办'); await page.getByRole('dialog', { name: '和吱呀聊聊', exact: true }).getByText('可以选杯子、钥匙和一张便签，不需要特别的材料。', { exact: true }).waitFor();
  await chat().fill('还没有发出去的问题');
  await page.setViewportSize({ width: 390, height: 360 }); await layout();
  await button('回到任务').click(); await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await proof().inputValue(), '杯子、钥匙和便签');
  assert.equal(await button('继续计时').count(), 1, 'asking for help does not resume a paused timer');
  assert.equal(await page.evaluate(() => document.activeElement.textContent.includes('问问吱呀')), true);
  await button('问问吱呀').click(); assert.equal(await chat().inputValue(), '还没有发出去的问题');
  await page.screenshot({ path: `${output}/03-assistance.png` });
  await page.keyboard.press('Escape'); await proof().waitFor();
  await button('返回首页').click(); await button('继续当前支线').click(); assert.equal(await proof().inputValue(), '杯子、钥匙和便签');
  await page.reload({ waitUntil: 'domcontentloaded' }); await proof().waitFor(); assert.equal(await proof().inputValue(), '杯子、钥匙和便签', 'refresh restores draft without resubmitting');
  await button('提交记录').click(); await page.getByRole('alert').filter({ hasText: '请补上展览名字' }).waitFor();
  assert.equal(await proof().inputValue(), '杯子、钥匙和便签');
  await proof().fill('杯子、钥匙和便签，展览名字叫：出门之前。'); await button('提交记录').click();
  await page.getByRole('textbox', { name: '照片说明', exact: true }).waitFor();
  assert.equal(await proof().count(), 0);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX2kAAAAASUVORK5CYII=', 'base64');
  await page.locator('.task-workspace input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('textbox', { name: '照片说明', exact: true }).fill('我最喜欢杯子旁边的钥匙');
  await button('问问吱呀').click(); await button('回到任务').click();
  assert.equal(await page.getByRole('img', { name: '待提交的现场照片' }).count(), 1);
  await button('提交照片和回答').click(); await page.getByRole('alert').filter({ hasText: '暂时没能完成' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '照片说明', exact: true }).inputValue(), '我最喜欢杯子旁边的钥匙');
  await button('提交照片和回答').click(); await page.getByRole('region', { name: '支线完成', exact: true }).waitFor();
  assert.equal(await page.locator('.conversation-composer').count(), 0);
  await page.screenshot({ path: `${output}/04-complete.png` });
  await button('再找一条支线 →').click(); await pick().waitFor();
  assert.equal(await page.locator('.task-workspace').count(), 0); await chat().waitFor();
  await pick().click(); await proof().waitFor(); assert.equal(await proof().inputValue(), '', 'new task cannot inherit old draft');
  await button('暂时不想做了').click(); assert.equal(saved.snapshot.fsmState, 'S2');
  await button('继续做这条').click(); assert.equal(saved.snapshot.fsmState, 'S2');
  await button('暂时不想做了').click(); await button('确认放下').click(); await chat().waitFor();
  assert.equal(await page.locator('.task-workspace').count(), 0);
  await page.reload({ waitUntil: 'domcontentloaded' }); await chat().waitFor(); assert.equal(await page.locator('.task-workspace').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ beforeSelection: 'conversation with cards', afterSelection: 'task with auxiliary conversation', failureLoadingRetry: 'pass', draftAndPhotoRetention: 'pass', refreshWithoutSubmission: 'pass', rejectThenAdvance: 'pass', completeAndNewTask: 'pass', abandonAndRestore: 'pass', viewports: sizes, pageErrors: errors }, null, 2));
} finally {
  if (!page.isClosed()) {
    await page.evaluate(({ client, originalClient, originalSession }) => {
      for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.includes(client)) storage.removeItem(key);
      if (originalClient === null) localStorage.removeItem('xian.clientId'); else localStorage.setItem('xian.clientId', originalClient);
      if (originalSession === null) localStorage.removeItem('xian-active-session'); else localStorage.setItem('xian-active-session', originalSession);
    }, { client, originalClient, originalSession });
    await page.close();
  }
  await browser.close();
}
