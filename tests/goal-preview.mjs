// Isolated UI test fixture: real routes, SQLite, coordinator and tools;
// model generation/review are deterministic test doubles. Never used by production.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

process.env.XIAN_DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'xian-goal-ui-'));
process.env.PORT = '5193';
process.env.OPENAI_API_KEY = 'fixture-only';
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:5195/v1';
process.env.OPENAI_MODEL = 'fixture';
const { examplePlan } = await import('../server/dist/goal-planner.js');
const model = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  const isInspiration = request.messages?.[0]?.content?.includes('提炼为一条忠于原文');
  const isReview = !!request.tools;
  const submitted = request.messages[request.messages.length - 1]?.content;
  const submittedText = Array.isArray(submitted) ? submitted.find(c => c.type === 'text')?.text?.split('# 玩家提交的证物')[1] || '' : '';
  const rejected = submittedText.includes('我做完了');
  const review = { verdict: rejected ? 'reject' : 'pass', evidence_seen: '测试证物', criteria_checked: [{ criterion: '测试要求', hit: !rejected, note: '测试返回' }], reason: rejected ? '需要具体记录' : '符合卡片要求', what_needed: rejected ? '补充三种声音' : '' };
  const inspiration = { title: '秋日拼贴', description: '用三片落叶组成一幅秋日拼贴，再写三句介绍。', hook: '把秋天留在纸上', tags: ['手作'], category: 'create', minutes: 15, scene: 'home', people: 1, cost: 0, energy: 'low', materials: '三片落叶与一张纸，时间为估计' };
  const message = { role: 'assistant', content: isReview ? JSON.stringify(review) : JSON.stringify(isInspiration ? inspiration : examplePlan()) };
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture', choices: [{ index: 0, message, finish_reason: 'stop' }] }));
});
await new Promise(resolve => model.listen(5195, '127.0.0.1', resolve));

const { LLMRunnerProvider } = await import('../server/dist/agent/llm/runner-provider.js');
const { RunContext } = await import('../server/node_modules/@openai/agents/dist/index.js');
const ordinary = [{ id: 'ordinary', title: '窗边小憩', hook: '把此刻留给自己', category: 'sense', tags: ['放松'] }];
LLMRunnerProvider.prototype.invoke = async function (params) {
  const calls = [];
  const speak = text => params.streamTextCallback?.(text);
  const call = async (name, args) => {
    calls.push(name); params.toolCallCallback?.(name);
    const out = JSON.parse(await params.tools.find(t => t.name === name).invoke(new RunContext(), JSON.stringify(args)));
    if (!out.success) throw new Error(`${name}: ${JSON.stringify(out)}`);
    return out;
  };
  const publish = index => call('publish_step', { step_index: index, instruction: '测试占位内容，长程应替换为定稿步骤', submission_type: 'text', proof_prompt: '应被规范证物要求覆盖' });
  const state = params.instructions.match(/当前阶段：(S\d)/)?.[1];
  if (state === 'S0' || (state === 'S1' && /换一批/.test(params.userMessage))) {
    speak('愿望可以慢慢来，今天先留下一点自己的发现。');
    await call('save_user_info', { freeTime: '15分钟', scene: '家里' });
    if (state === 'S0') await call('request_state_change', { target_state: 'S1', reason: '已知时长' });
    await call('propose_activities', { activities: ordinary });
  } else if (state === 'S1') {
    speak('好，我们从这一页开始。');
    const id = params.instructions.match(/id=(goal:[^ |]+)/)?.[1];
    await call('select_activity', { activityId: id || 'ordinary' });
    await call('request_state_change', { target_state: 'S2', reason: '用户选定' });
    await call('design_activity_steps', { steps: examplePlan().chapters[0].steps });
    await publish(0);
  } else if (state === 'S2') {
    if (/不想继续|放弃/.test(params.userMessage)) {
      speak('先歇一歇，已经留下的发现还在。');
      await call('request_state_change', { target_state: 'S1', reason: '放下任务' });
      await call('propose_activities', { activities: ordinary });
    } else if (/我做完了/.test(params.userMessage)) {
      speak('已经听了一会儿，辛苦啦。还需要补充三种声音及来源，让这页记录更具体。');
    } else {
      const progress = params.instructions.match(/当前进度：第 (\d+) 步 \/ 共 (\d+) 步/);
      const index = Number(progress?.[1] || 1), total = Number(progress?.[2] || 2);
      speak(index === total ? '这章全部完成，窗边的声音也有了自己的名字，恭喜。' : '这些细节都找到了，验收通过，下一步。');
      if (index === total) await call('request_state_change', { target_state: 'S3', reason: '全部步骤完成' });
      else await publish(index);
    }
  } else speak('这一页已经好好收起来了。');
  return { visibleOutput: '', success: true, toolCalls: calls };
};
await import('../server/dist/index.js');
const web = await createServer({
  configFile: false, root: path.resolve(import.meta.dirname, '..'), plugins: [react()],
  server: { port: 5194, strictPort: true, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:5193', '/evidence': 'http://127.0.0.1:5193' } },
});
await web.listen();
console.log('GOAL_UI_READY http://127.0.0.1:5194 · isolated fixture');
