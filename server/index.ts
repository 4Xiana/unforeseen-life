import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { AgentSession, type UserInput } from './agent/session.js';
import { listSessionTraces, getSessionTrace, subscribeTraces } from './agent/tracer/tracer.js';
import { getView } from './agent/handbook/handbook.js';
import { getProfile, saveProfile, normalizeProfileInput } from './agent/profile/profile.js';
import { questPairsForClient } from './agent/profile/quest-pairs.js';
import { parseGeo } from './agent/env/env-service.js';
import { DATA_DIR } from './data-path.js';
import { SessionStore } from './session-store.js';
import { getGoalStore } from './goal-store.js';
import { goalInputSchema, generateGoalPlan, exampleInput, examplePlan } from './goal-planner.js';
import { extractInspiration, inspirationInput, getInspirationStore } from './inspiration.js';
import { synthesizeSpeech } from './minimax-tts.js';

const app = express();
const port = parseInt(process.env.PORT || '5182', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── 证物照片持久化：存到 data/evidence/，通过 /evidence/:file 对外访问 ──────────
const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
app.use('/evidence', express.static(EVIDENCE_DIR, { maxAge: '30d' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, EVIDENCE_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const sessions = new Map<string, AgentSession>();
const store = new SessionStore();

function getOrCreateSession(id?: string, clientId?: string): AgentSession {
  if (id && sessions.has(id)) {
    return sessions.get(id)!;
  }
  const sessionId = id || randomUUID();
  const cid = clientId || randomUUID();
  const session = new AgentSession(sessionId, cid);
  store.create(sessionId, cid, session.ctx);
  sessions.set(sessionId, session);
  return session;
}

function sseEvent(res: express.Response, data: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
    (res as unknown as { flush: () => void }).flush();
  }
}

function findSession(req: express.Request): AgentSession | undefined {
  const id = String(req.params.id);
  const clientId = req.get('X-Client-Id') || '';
  const existing = sessions.get(id);
  if (existing) return existing.clientId === clientId ? existing : undefined;
  const saved = store.get(id, clientId);
  if (!saved) return undefined;
  getGoalStore().reconcile(clientId, id, saved.snapshot);
  const session = new AgentSession(saved.sessionId, saved.clientId, saved.snapshot);
  sessions.set(id, session);
  return session;
}

const PUBLIC_EVENTS = new Set([
  'turn_start', 'text_delta', 'state_changed', 'activities_proposed', 'step_published',
  'task_completed', 'env_resolved', 'handbook_updated', 'turn_complete', 'error', 'photo_saved',
  'evidence_reviewed', 'goal_updated',
]);

/** 写入后才通知浏览器；连接关闭不取消服务器上的任务回合。 */
async function runInput(session: AgentSession, input: UserInput, req: express.Request, res: express.Response) {
  const requestId = req.get('X-Request-Id') || randomUUID();
  const rawInput = { ...input };
  // 原图在 evidence 目录，数据库只存引用，避免重复写入 base64。
  if (rawInput.type === 'submit_photo') delete rawInput.imageDataUrl;
  const content = input.type === 'submit_photo' ? `📷 ${input.description}`
    : input.type === 'select_activity'
      ? `我选「${session.ctx.proposedActivities.find(a => a.id === input.activityId)?.title || input.activityId}」`
      : input.type === 'abandon' ? '不想做了...' : input.text;
  const result = store.begin(session.id, requestId, rawInput, {
    type: 'user_message', content,
    imageUrl: input.type === 'submit_photo' ? input.photoUrl : undefined,
    hidden: input.type === 'text' && input.text === '（用户刚刚打开了应用）',
  }, session.ctx);
  if (result !== 'started') {
    res.status(409).json({ error: result === 'busy' ? '上一条消息仍在处理中，请稍后恢复会话。' : '这条消息已接收，请恢复会话查看结果。' });
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  let failed = false;
  const emit = (event: Record<string, unknown>) => {
    if (event.type === 'error') failed = true;
    store.append(session.id, session.ctx, PUBLIC_EVENTS.has(String(event.type)) ? event : undefined);
    sseEvent(res, event);
  };
  try {
    if (input.type === 'submit_photo' && input.photoUrl) emit({ type: 'photo_saved', photoUrl: input.photoUrl });
    await session.processInput(input, emit);
  } catch (err) {
    failed = true;
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    store.finish(session.id, requestId, session.ctx, failed);
    res.end();
  }
}

app.get('/api/session/active', (req, res) => {
  const clientId = req.get('X-Client-Id') || '';
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.json(store.latest(clientId));
});

const planningClients = new Set<string>();
const extractingClients = new Set<string>();
app.get('/api/inspirations', (req, res) => {
  const clientId = req.get('X-Client-Id');
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.json(getInspirationStore().list(clientId));
});
app.post('/api/inspirations/extract', async (req, res) => {
  const clientId = req.get('X-Client-Id');
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  if (extractingClients.has(clientId)) { res.status(409).json({ error: '正在整理你的灵感，请稍等。' }); return; }
  extractingClients.add(clientId);
  try { res.json(await extractInspiration(inspirationInput.parse(req.body).text)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : '整理失败，请粘贴正文再试。' }); }
  finally { extractingClients.delete(clientId); }
});
app.post('/api/inspirations', (req, res) => {
  const clientId = req.get('X-Client-Id');
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  try { res.json(getInspirationStore().create(clientId, req.body)); }
  catch { res.status(400).json({ error: '灵感还不完整，请重新整理。' }); }
});
app.patch('/api/inspirations/:id', (req, res) => {
  const clientId = req.get('X-Client-Id');
  if (!clientId || typeof req.body?.enabled !== 'boolean') { res.status(400).json({ error: '参数不完整' }); return; }
  try { res.json(getInspirationStore().update(clientId, String(req.params.id), req.body.enabled)); }
  catch { res.status(404).json({ error: '找不到这条灵感' }); }
});
app.delete('/api/inspirations/:id', (req, res) => {
  const clientId = req.get('X-Client-Id');
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  if (!getInspirationStore().delete(clientId, String(req.params.id))) { res.status(404).json({ error: '找不到这条灵感' }); return; }
  res.status(204).end();
});
const speakingClients = new Set<string>();
app.post('/api/tts', async (req, res) => {
  const clientId = req.get('X-Client-Id');
  const text = req.body?.text;
  if (!clientId || typeof text !== 'string' || !text.trim() || text.length > 1200) { res.status(400).json({ error: '请提供一句适合朗读的文字。' }); return; }
  if (speakingClients.has(clientId)) { res.status(429).json({ error: '正在生成语音，请稍后重试。' }); return; }
  speakingClients.add(clientId);
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const audio = await synthesizeSpeech(text.trim(), controller.signal);
    if (!res.destroyed) res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).send(audio);
  } catch { if (!res.destroyed) res.status(503).json({ error: '吱呀的语音暂时没连上，点击重试。' }); }
  finally { speakingClients.delete(clientId); }
});
app.get('/api/goals', (req, res) => {
  const clientId = req.get('X-Client-Id') || '';
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  try {
    for (const goal of getGoalStore().list(clientId)) if (goal.inProgress) {
      const saved = store.get(goal.inProgress.sessionId, clientId);
      if (saved) getGoalStore().reconcile(clientId, saved.sessionId, saved.snapshot);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(getGoalStore().list(clientId));
  } catch { res.status(500).json({ error: '暂时无法读取长程记录，请重试' }); }
});
app.get('/api/goals/:id', (req, res) => {
  const clientId = req.get('X-Client-Id') || '';
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getGoalStore().get(clientId, String(req.params.id)));
  } catch { res.status(404).json({ error: '找不到这条长程支线' }); }
});
app.post(['/api/goals', '/api/goals/:id/draft'], async (req, res) => {
  const clientId = req.get('X-Client-Id') || '';
  if (!clientId) { res.status(400).json({ error: 'clientId required' }); return; }
  if (planningClients.has(clientId)) { res.status(409).json({ error: '你的计划仍在生成，请稍后回到长程页查看' }); return; }
  planningClients.add(clientId);
  try {
    const draftId = req.params.id ? String(req.params.id) : undefined;
    if (draftId && getGoalStore().get(clientId, draftId).status !== 'draft') throw new Error('已开启的计划不能覆盖，请建立新的愿望');
    const input = req.body?.example === true ? exampleInput : goalInputSchema.parse(req.body);
    const plan = req.body?.example === true ? examplePlan() : await generateGoalPlan(input, await getProfile(clientId));
    res.json(draftId ? getGoalStore().reviseDraft(clientId, draftId, input, plan) : getGoalStore().create(clientId, input, plan));
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : '生成失败，请重试' }); }
  finally { planningClients.delete(clientId); }
});
app.post('/api/goals/:id/status', (req, res) => {
  const clientId = req.get('X-Client-Id') || '';
  const action = req.body?.action;
  if (!clientId || !['confirm', 'pause', 'resume'].includes(action)) { res.status(400).json({ error: '参数不完整' }); return; }
  try { res.json(getGoalStore().changeStatus(clientId, String(req.params.id), action)); }
  catch (err) { res.status(409).json({ error: err instanceof Error ? err.message : '操作失败' }); }
});

app.post('/api/session', (req, res) => {
  const clientId = typeof req.body?.clientId === 'string' && req.body.clientId
    ? req.body.clientId
    : randomUUID();
  const session = getOrCreateSession(undefined, clientId);
  res.json({ sessionId: session.id, clientId: session.clientId, fsmState: session.ctx.fsmState });
});

app.get('/api/handbook', async (req, res) => {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
  if (!clientId) {
    res.status(400).json({ error: 'clientId required' });
    return;
  }
  try {
    const view = await getView(clientId);
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/profile', async (req, res) => {
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
  if (!clientId) {
    res.status(400).json({ error: 'clientId required' });
    return;
  }
  try {
    const profile = await getProfile(clientId);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/profile', async (req, res) => {
  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  if (!clientId) {
    res.status(400).json({ error: 'clientId required' });
    return;
  }
  try {
    const input = normalizeProfileInput(req.body ?? {});
    const profile = await saveProfile(clientId, input);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/quest-pairs', (_req, res) => {
  res.json(questPairsForClient());
});

app.get('/api/session/:id', (req, res) => {
  const saved = store.get(String(req.params.id), req.get('X-Client-Id') || '');
  if (!saved) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ...saved.snapshot, ...saved });
});

app.post('/api/session/:id/message', async (req, res) => {
  const session = findSession(req);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { type, text, activityId } = req.body;
  // 定位坐标随每条消息上行（前端授权后才有）；解析失败/缺省即 undefined，后端静默降级
  const geo = parseGeo(req.body?.geo);
  // 步骤实际耗时（秒），仅 submit_text 由前端软计时器带上；非法值忽略
  const elapsedSeconds = Number.isFinite(req.body?.elapsedSeconds)
    ? Number(req.body.elapsedSeconds)
    : undefined;

  let input: UserInput;
  switch (type) {
    case 'select_activity':
      input = { type: 'select_activity', activityId, geo };
      break;
    case 'submit_text':
      input = { type: 'submit_text', text: text || '', geo, elapsedSeconds };
      break;
    case 'abandon':
      input = { type: 'abandon', geo };
      break;
    case 'text':
    default:
      input = { type: 'text', text: text || '', geo, goalId: typeof req.body.goalId === 'string' ? req.body.goalId : undefined };
  }

  await runInput(session, input, req, res);
});

app.post('/api/session/:id/photo', (req, res, next) => {
  if (!findSession(req)) { res.status(404).json({ error: 'Session not found' }); return; }
  next();
}, upload.single('photo'), async (req, res) => {
  const session = findSession(req);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const description = req.body.description || '[用户上传了一张照片]';
  // FormData 里的 geo 是 JSON 字符串，parseGeo 两种形态都接受
  const geo = parseGeo(req.body?.geo);
  // 步骤实际耗时（秒，FormData 里是字符串），仅 photo 步计时器带上
  const parsedElapsed = Number(req.body?.elapsedSeconds);
  const elapsedSeconds = Number.isFinite(parsedElapsed) && parsedElapsed > 0 ? parsedElapsed : undefined;

  // 照片随当轮消息以多模态 part 喂给模型（deepseek-chat 支持视觉 + 工具调用）；
  // multer 为 diskStorage，照片已存到 data/evidence/，读回字节转 base64 喂模型，
  // 同时保留可访问 URL 供持久化到记录页。
  let imageDataUrl: string | undefined;
  let photoUrl: string | undefined;
  if (req.file) {
    const mime = req.file.mimetype || 'image/jpeg';
    const buf = await fs.promises.readFile(req.file.path);
    imageDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    photoUrl = `/evidence/${req.file.filename}`;
  }

  const input: UserInput = {
    type: 'submit_photo',
    description,
    imageDataUrl,
    photoUrl,
    geo,
    elapsedSeconds,
  };

  await runInput(session, input, req, res);
});

app.get('/api/trace/sessions', (_req, res) => {
  res.json(listSessionTraces());
});

app.get('/api/trace/session/:id', (req, res) => {
  const sid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const trace = getSessionTrace(sid);
  if (!trace) {
    res.status(404).json({ error: 'Trace not found' });
    return;
  }
  res.json(trace);
});

app.get('/api/trace/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const unsubscribe = subscribeTraces((event) => {
    sseEvent(res, event);
  });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.listen(port, () => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not set. Please create a .env file with OPENAI_API_KEY=sk-...');
  }
  console.log(`🎮 Side Quest Agent server running on http://localhost:${port}`);
});
