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

const app = express();
const port = parseInt(process.env.PORT || '5182', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── 证物照片持久化：存到 data/evidence/，通过 /evidence/:file 对外访问 ──────────
const EVIDENCE_DIR = path.resolve(process.cwd(), 'data', 'evidence');
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

function getOrCreateSession(id?: string, clientId?: string): AgentSession {
  if (id && sessions.has(id)) {
    return sessions.get(id)!;
  }
  const sessionId = id || randomUUID();
  const cid = clientId || randomUUID();
  const session = new AgentSession(sessionId, cid);
  sessions.set(sessionId, session);
  return session;
}

function sseEvent(res: express.Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
    (res as unknown as { flush: () => void }).flush();
  }
}

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
  const sid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const session = sessions.get(sid);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    sessionId: session.id,
    fsmState: session.ctx.fsmState,
    collectedInfo: session.ctx.collectedInfo,
    proposedActivities: session.ctx.proposedActivities,
    selectedActivity: session.ctx.selectedActivity,
    currentStepIndex: session.ctx.currentStepIndex,
  });
});

app.post('/api/session/:id/message', async (req, res) => {
  const sid = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const session = sessions.get(sid);
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
      input = { type: 'text', text: text || '', geo };
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    await session.processInput(input, (event) => {
      sseEvent(res, event);
    });
  } catch (err) {
    sseEvent(res, { type: 'error', message: err instanceof Error ? err.message : String(err) });
  }

  res.end();
});

app.post('/api/session/:id/photo', upload.single('photo'), async (req, res) => {
  const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const session = sessions.get(sessionId);
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // 先把磁盘持久化后的照片 URL 推给前端，让对话流里的图用可刷新的地址
  if (photoUrl) {
    sseEvent(res, { type: 'photo_saved', photoUrl });
  }

  try {
    await session.processInput(input, (event) => {
      sseEvent(res, event);
    });
  } catch (err) {
    sseEvent(res, { type: 'error', message: err instanceof Error ? err.message : String(err) });
  }

  res.end();
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
