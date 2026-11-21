import { assertMobileShell } from './mobile-shell.mjs';
// Shared browser, deterministic API fixtures. No writes reach real user data or models.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(12000);
const base = process.env.THREAD_TEST_URL || 'http://localhost:8801';
const client = `thread-map-fixture-${Date.now()}`;
const output = '.cache/thread-map';
mkdirSync(output, { recursive: true });
const tasks = [
  ['street', '给街角的小店画张地图', 'explore', '我记下了巷口的书店和面包房。'],
  ['sound', '收集街区的三种声音', 'sense', '自行车铃、树叶和门口的风铃。'],
  ['exhibit', '给桌上的小物办个展', 'create', '《归来》：钥匙与一片落叶。'],
  ['postcard', '做一张寄给明天的明信片', 'create', '把今天的晚霞画在卡片上。'],
  ['walk', '沿一条陌生的小路散步', 'explore', '发现了一片安静的竹林。'],
  ['friend', '问朋友一个关于童年的问题', 'connect', '听到了第一次远行的故事。'],
  ['long', '在熟悉的日常里'.repeat(12), 'sense', '保留长标题的真实记录。'],
].map(([id,title,category,evidence],i) => ({ id,title,category,evidence,tags:['观察'],date:`2026-11-${String(i+1).padStart(2,'0')}T10:00:00Z`,steps:1,
  stepDetails:[{instruction:'留下一段自己的观察',submissionType:'text',evidence:{type:'text',text:evidence,at:'2026-11-01T10:00:00Z'}}] }));
const handbook = {clientId:client,quests:[...tasks].reverse(),badges:[],stats:{total:tasks.length,weekCount:2,earnedCount:0,byCategory:{explore:2,create:2,sense:2,connect:1,organize:0}}};
const profile={clientId:client,onboarded:true,energy:'any',novelty:0,social:'any',budget:'any',mechs:[],interests:'',avoids:'',pairVotes:{}};
const chapters=[1,2,3].map(n=>({id:`c${n}`,title:['记下第一段声音','把声音变成一页','装订自己的声音小册'][n-1],purpose:'用观察积累自己的声音素材',connection:n===1?'从家门口开始。':'接着上一章的真实声音继续创作。',outcome:'一页声音笔记',category:'sense',scene:'home',minutes:10,steps:[]}));
const goal={id:'wish',status:'active',createdAt:'2026-11-01',input:{wish:'做一本声音小册',motivation:'',preferences:'',avoid:'',scene:'home',minutes:15},plan:{title:'我的日常声音小册',outcome:'把听见的日常，收成一本小册。',chapters},records:[{chapterId:'c1',sessionId:'old',at:'2026-11-01',steps:[{instruction:'留下一段声音笔记',submissionType:'text',completionCriteria:'',submittedEvidence:{type:'text',text:'厨房里水壶与雨滴的合奏。',at:'2026-11-01'}}]}],rewards:[]};
let threads=[{id:'street-theme',title:'认识我住的街区',description:'把声音、散步和小店的故事串在一起。',questIds:['street','sound'],createdAt:'2026-11-01',updatedAt:'2026-11-01'}];
let failSave=true, failLoad=false, empty=false, activeSession=null;
const messages=[], errors=[], unexpected=[];
let originalClient, originalSession;
page.on('pageerror', e=>errors.push(e.message));
await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//,r=>r.abort());
await page.addInitScript(()=>{navigator.geolocation.getCurrentPosition=()=>{};navigator.geolocation.watchPosition=()=>1;});
await page.route('**/api/**',async route=>{
 const req=route.request(), url=new URL(req.url()), path=url.pathname, method=req.method();
 if(method==='GET') {
  if(path==='/api/profile') return route.fulfill({json:profile});
  if(path==='/api/handbook') return route.fulfill({json:empty?{...handbook,quests:[],stats:{...handbook.stats,total:0}}:handbook});
  if(path==='/api/goals') return route.fulfill({json:empty?[]:[goal]});
  if(path==='/api/quest-threads') return failLoad?route.fulfill({status:503,json:{error:'fixture unavailable'}}):route.fulfill({json:empty?[]:threads});
  if(path==='/api/quest-pairs'||path==='/api/inspirations') return route.fulfill({json:[]});
  if(path.startsWith('/api/session/')) return route.fulfill({json:activeSession});
 }
 if(path.startsWith('/api/quest-threads')&&['POST','PUT'].includes(method)) {
  assert.equal(req.headers()['x-client-id'],client);
  if(failSave){failSave=false;return route.fulfill({status:503,json:{error:'测试保存失败，选择已保留，请重试'}});}
  const data=req.postDataJSON(),id=path.split('/')[3]||'new-thread';
  const thread={...data,id,createdAt:'2026-11-01',updatedAt:'2026-11-21'};
  threads=[thread,...threads.filter(t=>t.id!==id)];return route.fulfill({json:thread});
 }
 if(method==='DELETE'&&path.startsWith('/api/quest-threads/')) {threads=threads.filter(t=>t.id!==path.split('/')[3]);return route.fulfill({json:{ok:true}});}
 if(method==='POST'&&path==='/api/session')return route.fulfill({json:{sessionId:'new-session',clientId:client,fsmState:'S0'}});
 if(method==='POST'&&path.endsWith('/message')) {
  messages.push(req.postDataJSON());
  return route.fulfill({contentType:'text/event-stream',body:[{type:'user_message',content:req.postDataJSON().text},{type:'turn_start'},{type:'text_delta',text:'我们沿着这个方向继续，今天想在哪儿探索？'},{type:'turn_complete',fsmState:'S0'}].map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')});
 }
 unexpected.push(`${method} ${path}`);return route.fulfill({status:404,json:{}});
});
const button=name=>page.getByRole('button',{name,exact:true});
const branch=title=>page.locator('.thread-overview').getByRole('button',{name:`查看支线：${title}`,exact:true}).first();
const taskNode=id=>page.locator(`.thread-graph-node[data-record-id="${id}"]`);
const stop=title=>page.locator('.thread-timeline').getByRole('button',{name:`查看任务：${title}`,exact:true});
const stopDetail=()=>page.locator('.thread-stop-detail');
async function focusIs(selector){
 await page.waitForFunction(selector=>document.activeElement?.matches(selector),selector);
}
async function nodeInView(node){
 const visible=await node.evaluate(node=>{
  const box=node.getBoundingClientRect(),surface=node.closest('.thread-map').getBoundingClientRect();
  return box.top>=surface.top-1&&box.bottom<=surface.bottom+1&&box.left>=surface.left-1&&box.right<=surface.right+1;
 });
 assert.equal(visible,true,'Closing details returns to a visible task node');
}
async function open(){await button('我的手册').click();await page.getByRole('tab',{name:'支线脉络'}).click();await branch('表达').waitFor();await page.getByText('正在翻开你的探索地图…',{exact:true}).waitFor({state:'hidden'});}
async function layout(){
  await assertMobileShell(page);
 const data=await page.locator('.library-overlay').evaluate(root=>({overflow:root.scrollWidth>innerWidth+1,clipped:[...root.querySelectorAll('button,input,textarea')].filter(e=>e.getClientRects().length).some(e=>{const r=e.getBoundingClientRect();return r.left < -1||r.right>innerWidth+1;}),smallButtons:[...root.querySelectorAll('button')].filter(e=>e.getClientRects().length).some(e=>{const r=e.getBoundingClientRect();return r.width<43.5||r.height<43.5;})}));
 assert.deepEqual(data,{overflow:false,clipped:false,smallButtons:false});
}
try{
 // Establish storage without mounting the real app, then use an isolated fixture identity.
 await page.route(base+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Thread fixture</title>'}));
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 [originalClient,originalSession]=await page.evaluate(()=>[localStorage.getItem('xian.clientId'),localStorage.getItem('xian-active-session')]);
 await page.evaluate(client=>{localStorage.setItem('xian.clientId',client);localStorage.setItem(`xian-app-guide-v1:${client}`,'done');localStorage.removeItem('xian-active-session');},client);
 await page.unroute(base+'/');await page.reload({waitUntil:'domcontentloaded'});
 await open();
 const results=[];
 for(const [width,height]of [[320,568],[390,844],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});await layout();
  assert.deepEqual(await page.locator('.thread-graph-lanes button').allTextContents(), ['放松','惊喜','表达','连接','成长']);
  // Records shared by a category and a theme remain one physical task node.
  const recordIds=await page.locator('.thread-graph-node').evaluateAll(nodes=>nodes.map(node=>node.dataset.recordId));
  assert.equal(recordIds.length,tasks.length);
  assert.deepEqual([...new Set(recordIds)].sort(),tasks.map(task=>task.id).sort());
  const customEdge=page.locator('.thread-graph-edge[data-from="street"][data-to="sound"]');
  const categoryEdge=page.locator('.thread-graph-edge[data-from="street"][data-to="walk"]');
  assert.match(await customEdge.getAttribute('data-kinds'),/custom/);
  assert.match(await categoryEdge.getAttribute('data-kinds'),/category/);
  assert.ok(await customEdge.getAttribute('d'),'Cross-category theme has a drawn relationship');
  assert.ok(await categoryEdge.getAttribute('d'),'Same-direction chronology has a drawn relationship');
  if(width===390||width===1280)await page.screenshot({path:`${output}/overview-${width}.png`});
  await taskNode('street').click();
  const peek=page.locator('.thread-record-peek');
  await peek.waitFor();
  assert.match(await peek.innerText(),/给街角的小店画张地图/);
  await peek.locator('[aria-expanded]').click();
  await peek.getByText('我记下了巷口的书店和面包房。').waitFor();
  await layout();
  await taskNode('long').click();
  await peek.getByText(`「${tasks.find(task=>task.id==='long').title}」`,{exact:true}).waitFor();
  await layout();
  await branch('认识我住的街区').click();await layout();
  assert.equal(await page.locator('.thread-timeline button').count(),2);
  assert.equal(await stopDetail().count(),0,'Map stays compact until a task is selected');
  await stop('给街角的小店画张地图').click();
  await focusIs('.thread-stop-detail');
  await button('收起任务详情').click();
  await focusIs('.thread-timeline button[data-stop-id="street"]');
  await stop('给街角的小店画张地图').click();
  await focusIs('.thread-stop-detail');
  await stopDetail().locator('[aria-expanded]').click();
  await stopDetail().getByText('我记下了巷口的书店和面包房。').waitFor();await layout();
  if(width===390)await page.screenshot({path:`${output}/detail-${width}.png`});
  await button('← 返回地图').click();
  await branch('我的日常声音小册').click();
  assert.equal(await page.locator('.thread-timeline [data-status=done]').count(),1);
  assert.equal(await page.locator('.thread-timeline [data-status=next]').count(),1);
  assert.equal(await page.locator('.thread-timeline [data-status=locked]').count(),1);
  assert.equal(await stopDetail().count(),0);
  if(width===390)await page.screenshot({path:`${output}/chapters-${width}.png`});
  await stop('记下第一段声音').click();
  await stopDetail().locator('[aria-expanded]').click();
  await stopDetail().getByText('厨房里水壶与雨滴的合奏。').waitFor();await layout();
  await stop('把声音变成一页').click();
  await stopDetail().getByText('接着上一章的真实声音继续创作。',{exact:true}).waitFor();
  assert.equal(await stopDetail().locator('[aria-expanded]').count(),0,'Next chapter has no invented completed record');
  await layout();
  await button('← 返回地图').click();
  results.push({viewport:`${width}x${height}`,uniqueNodes:'pass',themeAndChronologyEdges:'pass',nodeEvidence:'pass',chapters:'pass',layout:'pass'});
 }
 await page.setViewportSize({width:390,height:844});
 // Large histories reveal older nodes on demand and retain a useful keyboard/focus path.
 const originalQuests=handbook.quests;
 handbook.quests=Array.from({length:26},(_,index)=>({
  ...tasks[index%tasks.length],id:`bulk-${String(index).padStart(2,'0')}`,
  title:`第${index+1}次探索`,date:`2026-10-${String(index+1).padStart(2,'0')}T10:00:00Z`,
 }));
 try{
  await page.reload({waitUntil:'domcontentloaded'});await open();
  await button('展开更早的 6 次探索 ↓').waitFor();
  assert.equal(await page.locator('.thread-graph-node').count(),20);
  await button('展开更早的 6 次探索 ↓').click();
  await taskNode('bulk-00').waitFor();
  assert.equal(await page.locator('.thread-graph-node').count(),26);
  await layout();
  await taskNode('bulk-00').click();await focusIs('.thread-record-peek');
  await taskNode('bulk-00').click();await focusIs('.thread-record-peek');
  await button('收起任务记录').click();
  await focusIs('.thread-graph-node[data-record-id="bulk-00"]');
  await nodeInView(taskNode('bulk-00'));
  await taskNode('bulk-01').focus();await page.keyboard.press('Enter');
  await focusIs('.thread-record-peek');
  assert.match(await page.locator('.thread-record-peek').innerText(),/第2次探索/);
  await button('收起任务记录').click();
  assert.equal(failSave,true,'Graph interactions must not save or consume the retry fixture');
 }finally{handbook.quests=originalQuests;}
 await page.reload({waitUntil:'domcontentloaded'});await open();
 assert.equal(await page.locator('.thread-graph-node').count(),tasks.length);
 await button('串成一条支线').click();
 await page.getByRole('textbox',{name:'支线名称'}).fill('日常的另一种看法');
 await page.getByRole('textbox',{name:/想沿着它探索什么/}).fill('从街区声音到桌上创作');
 await page.getByRole('checkbox',{name:/给街角的小店画张地图/}).check();
 await page.getByRole('checkbox',{name:/给桌上的小物办个展/}).check();
 await layout();await page.screenshot({path:`${output}/editor.png`});
 await button('保存这条支线').click();await page.getByRole('alert').filter({hasText:'测试保存失败'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'支线名称'}).inputValue(),'日常的另一种看法');
 assert.equal(await page.getByRole('checkbox',{checked:true}).count(),2);
 await button('保存这条支线').click();await button('编辑名称与经历').waitFor();
 assert.equal(await page.locator('.thread-timeline button').count(),2);
 assert.equal(await stopDetail().count(),0);
 await button('编辑名称与经历').click();await page.getByRole('textbox',{name:'支线名称'}).fill('日常的新视角');await button('保存这条支线').click();await button('编辑名称与经历').waitFor();
 await page.reload({waitUntil:'domcontentloaded'});await open();await branch('日常的新视角').click();await button('移除主题').click();await button('保留主题').click();
 assert.equal(threads.some(t=>t.title==='日常的新视角'),true);
 await button('移除主题').click();await button('确认移除主题').click();await branch('认识我住的街区').waitFor();
 assert.equal(handbook.quests.length,7);
 assert.equal(await branch('日常的新视角').count(),0);
 await branch('成长').click();await page.getByText('这个方向还没有留下经历。',{exact:true}).waitFor();await button('← 返回地图').click();
 await branch('认识我住的街区').click();await button('沿这条线继续探索 →').click();
 await page.getByText('我们沿着这个方向继续，今天想在哪儿探索？',{exact:true}).waitFor();
 assert.match(messages.at(-1).text,/认识我住的街区/);assert.match(messages.at(-1).text,/街角的小店/);assert.match(messages.at(-1).text,/街区的三种声音/);
 // Active task guard: opening a map must not replace the current task or submit evidence.
 const step={instruction:'观察手边的小物',submissionType:'text',completionCriteria:'真实记录',proofPrompt:'写下发现'};
 activeSession={sessionId:'active-task',clientId:client,status:'idle',snapshot:{fsmState:'S2',proposedActivities:[],selectedActivity:{id:'task',title:'正在做的任务',category:'create',tags:[],steps:[step]},currentStepIndex:0},events:[]};
 await page.evaluate(()=>localStorage.setItem('xian-active-session','active-task'));await page.reload({waitUntil:'domcontentloaded'});await open();await branch('认识我住的街区').click();
 assert.equal(await button('沿这条线继续探索 →').isDisabled(),true);
 await page.getByText('先回到正在进行的任务，完成或放下后再探索。',{exact:true}).waitFor();
 activeSession=null;empty=true;await page.evaluate(()=>localStorage.removeItem('xian-active-session'));await page.reload({waitUntil:'domcontentloaded'});await open();
 await page.getByText('完成一次探索，点亮第一个节点',{exact:true}).waitFor();assert.equal(await page.locator('.thread-graph-node').count(),0);assert.equal(await button('串成一条支线').isDisabled(),true);
 await branch('表达').click();assert.equal(await button('沿这条线继续探索 →').isEnabled(),true);
 await button('← 返回地图').click();await button('关闭我的手册').click();
 empty=false;failLoad=true;await open();await page.getByRole('alert').filter({hasText:'部分脉络暂时没能打开'}).waitFor();
 failLoad=false;await button('重新加载脉络').click();await branch('认识我住的街区').waitFor();
 await page.getByRole('tab',{name:'支线脉络'}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'喜好',exact:true}).getAttribute('aria-selected'),'true');
 await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'支线脉络'}).getAttribute('aria-selected'),'true');
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'我的手册',exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log(JSON.stringify({results,historyExpansionAndFocus:'pass',createEditReloadRemove:'pass',saveFailureRetry:'pass',emptyAndRetry:'pass',continuationContext:'pass',activeTaskGuard:'pass',keyboard:'pass',pageErrors:errors},null,2));
}catch(error){
 await page.screenshot({path:`${output}/failure.png`});
 console.error((await page.locator('body').innerText()).slice(-7000));
 throw error;
}finally{
 if(!page.isClosed()){
  await page.evaluate(({client,originalClient,originalSession})=>{for(const key of Object.keys(localStorage))if(key.includes(client))localStorage.removeItem(key);if(originalClient===null)localStorage.removeItem('xian.clientId');else localStorage.setItem('xian.clientId',originalClient);if(originalSession===null)localStorage.removeItem('xian-active-session');else localStorage.setItem('xian-active-session',originalSession);},{client,originalClient,originalSession});
  await page.close();
 }
 await context.close();await browser.close();
}
