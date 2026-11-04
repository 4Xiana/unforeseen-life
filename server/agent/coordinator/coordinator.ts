import { WorkingMemory } from '../memory/working-memory.js';
import type { WorkingMemorySnapshot, FSMState } from '../memory/types.js';
import { StateMachine } from '../fsm/state-machine.js';
import { getStateConfig } from '../flows/registry.js';
import type { StructuredInput, ChatMessageItem, LLMInvokeResult } from '../flows/types.js';
import { LLMRunnerProvider, type EmitEvent } from '../llm/runner-provider.js';
import { createAtomTools } from '../tools/atom-tools.js';
import { loadSkillBody } from '../skills/loader.js';
import { assembleContext } from '../context/builder.js';
import {
  getView,
  recordQuest,
  buildHandbookBrief,
  CATEGORY_META,
  type QuestCategory,
  type BadgeState,
} from '../handbook/handbook.js';
import { resolveEnv, renderEnvBrief, type EnvContext } from '../env/env-service.js';
import { getProfile, buildProfileBrief } from '../profile/profile.js';
import { reviewEvidence } from '../review/evidence-reviewer.js';
import type { EvidenceReview } from '../review/evidence-reviewer.js';
import type { SessionTracer } from '../tracer/tracer.js';
import { SUBMISSION_PROMPTS } from '../prompts/tool-meta.js';

const RUN_MAX_TURNS = 10;

// ── 台词净化：括号"舞台说明"与元文本硬过滤 ─────────────────────────────
// 模型在护栏重试/工具报错时，可能模仿回喂占位符的格式，把（系统内部记录：…）
// 这类旁白当台词输出。事件层直接丢弃：不发前端、不累积进 assistantText、不进历史。
const META_LINE_PAT = /系统内部记录|不是台词|严禁[^。；]{0,12}复述|禁止复述|调用被拒绝|这行是系统|系统状态说明|工具链错乱/g;
const VOICE_URL_PAT = /https?:\/\/\S+/g;

function sanitizeVoiceText(s: string): string {
  return s
    .replace(/（[^（）]*）/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(META_LINE_PAT, '')
    .replace(VOICE_URL_PAT, '')
    .trim();
}

// 开场台词（出卡/出步骤前）事件层硬护栏：
// S2 开场只许"接了、出发"的气氛句——步骤指令、玩法词一旦成句即整句丢弃；
// 红线词句（好嘞/得咧……）任何位置成句即丢弃。全部被截光时用兜底句顶上，保证"先说话再出卡"的工具门不失灵。
const BANNED_VOICE_SENTENCE = /好嘞|好咧|得嘞|得咧/;
const S2_INSTRUCTION_SENTENCE =
  /第一步|先[把去坐站关开拿找拍听看数堆拢迈走抓]|闭上眼睛?|闭眼|：|、|\d\s*(秒|分钟|分|张|种|个|步|声|条|圈|样|次)|数给我|交给我|发给我|拍下来|走[到进去]|坐下来|站起来|转[身一]|把[^，。！？]{0,14}[找拢收拿拍数关开听看堆放摆]|颜色|声音|照片|招牌|抽屉/;
const FALLBACK_OPENER: Record<string, string[]> = {
  S1: ['替你留了几条支线，看看哪一条合心意？'],
  S2: ['这条归你了，我们出发吧。', '好，就这条，慢慢开始。', '眼光真好——出发吧。'],
};

/**
 * 流式台词净化：跨 chunk 维护状态，丢弃全角括号旁白与 ![alt](url) 图片段。
 * 每个 stream delta 调一次，返回本段可安全发射给前端的文字。
 */
function createVoiceStreamFilter(): (text: string) => string {
  let parenOpen = false;
  let img: '' | 'bang' | 'alt' | 'afterAlt' | 'url' = '';
  return (text: string): string => {
    let clean = '';
    for (const ch of text) {
      if (parenOpen) {
        if (ch === '）') parenOpen = false;
        continue;
      }
      switch (img) {
        case 'alt':
          if (ch === ']') img = 'afterAlt';
          continue;
        case 'afterAlt':
          if (ch === '(') { img = 'url'; }
          else { img = ''; clean += ch; }
          continue;
        case 'url':
          if (ch === ')') img = '';
          continue;
        case 'bang':
          img = '';
          if (ch === '[') { img = 'alt'; continue; }
          clean += '!';
          if (ch === '（') { parenOpen = true; continue; }
          clean += ch;
          continue;
        case '':
          if (ch === '（') { parenOpen = true; continue; }
          if (ch === '!') { img = 'bang'; continue; }
          clean += ch;
      }
    }
    return clean;
  };
}

export class Coordinator {
  readonly id: string;
  readonly clientId: string;
  readonly memory: WorkingMemory;
  readonly fsm: StateMachine;
  readonly llm: LLMRunnerProvider;
  private tracer: SessionTracer | null;

  constructor(id: string, clientId: string, tracer?: SessionTracer) {
    this.id = id;
    this.clientId = clientId;
    this.memory = new WorkingMemory();
    this.tracer = tracer ?? null;
    this.fsm = new StateMachine(this.memory, {
      onTransition: (from, to, reason) => {
        this.tracer?.log('state_transition', { from, to, reason });
      },
    });
    this.llm = new LLMRunnerProvider(tracer);
  }

  snapshot(): WorkingMemorySnapshot {
    return this.memory.snapshot();
  }

  /**
   * 完成一条支线：把它盖进玩家的支线手账，结算成就。
   * 证据片段从对话记录里捞玩家最后交的那份"文字/图说答案"，作为票根上的小字。
   */
  private async recordCompletedQuest(): Promise<{
    view: Awaited<ReturnType<typeof getView>>;
    newBadges: BadgeState[];
    title: string;
    category: QuestCategory;
  } | null> {
    const act = this.memory.selected;
    if (!act) return null;
    const category: QuestCategory = act.category ?? 'sense';
    const steps = act.steps || [];
    const { view, newBadges } = await recordQuest(this.clientId, {
      title: act.title,
      category,
      tags: act.tags ?? [],
      steps: steps.length,
      evidence: this.extractEvidence(),
      // 收集每一步的指引与玩家提交的原始证物，供记录页完整回放
      stepDetails: steps.map((s) => ({
        instruction: s.instruction,
        submissionType: s.submissionType,
        proofPrompt: s.proofPrompt,
        evidence: s.submittedEvidence,
      })),
    });
    return { view, newBadges, title: act.title, category };
  }

  /** 从近期对话里找玩家最后一份证物（文字反馈/图说答案），取一句话票根小字 */
  private extractEvidence(): string | undefined {
    const transcript = this.memory.recentTranscript();
    for (let i = transcript.length - 1; i >= 0; i--) {
      const e = transcript[i];
      if (e.role !== 'user') continue;
      const content = e.content.trim();
      // 玩家证物消息形如"……：xxxx"；纯打卡/系统消息不含冒号，跳过
      const idx = content.lastIndexOf('：');
      if (idx >= 0) {
        const tail = content.slice(idx + 1).replace(/[。！!？?\s]+$/, '').trim();
        if (tail && !/^(做完了|完成|好了|✅|打卡)/.test(tail)) return tail;
      }
    }
    return undefined;
  }

  /** 追加给 S3 祝贺轮的即时提示：告诉模型手账盖了第几枚戳、解锁了什么成就 */
  private buildHandbookNote(rec: {
    view: Awaited<ReturnType<typeof getView>>;
    newBadges: BadgeState[];
    category: QuestCategory;
  }): string {
    const total = rec.view.stats.total;
    const catLabel = CATEGORY_META[rec.category].label;
    let note = `\n\n【手账已盖戳】这条支线已经收进玩家的支线手账，是第 ${total} 枚戳记（${catLabel}类）。`;
    if (rec.newBadges.length > 0) {
      const names = rec.newBadges.map((b) => `「${b.name}」（${b.desc}）`).join('、');
      note += `而且玩家刚解锁了成就 ${names}——请在祝贺里自然地为这枚新成就高兴一句，像朋友替 TA 开心，不要像系统播报。`;
    } else {
      note += `可以自然提一句"手账上又多了一枚戳记"，给人收集的踏实感。`;
    }
    note += `记住：别说"手账系统/字段/接口"，这就是你替玩家攒着的一本小册子；也不要催 TA 为了解锁成就而玩。`;
    return note;
  }

  async process(input: StructuredInput, emit: EmitEvent): Promise<void> {
    const tStart = Date.now();
    this.tracer?.log('user_input', { inputKind: input.kind, text: input.text || input.description || input.activityId || '' });
    emit({ type: 'turn_start', fsmState: this.memory.state });

    const configBefore = getStateConfig(this.memory.state);

    // 独立证物验收的结果：在 try 内赋值，try 外（驳回重发逻辑）也需要读取
    let evidenceReview: EvidenceReview | undefined;

    try {
      // ── 预处理：把 UI 交互包装成自然语言（不做信息提取/memory写入/决策）─────
      let userMessage = '';
      const preprocessResult = configBefore.onUserInput
        ? await configBefore.onUserInput(input, { memory: this.memory, emit })
        : null;

      if (preprocessResult?.injectedMessage) userMessage = preprocessResult.injectedMessage;
      else userMessage = this.buildUserMessage(input);

      // ── 事件追踪：用于"卡片动作缺失"护栏（模型提前结束回合时轻推）──────────
      let enteredS2ThisTurn = false;
      let sawActivitiesProposed = false;
      let sawStepPublished = false;
      let sawSelectActivity = false;
      let sawProposeCall = false;
      let sawSaveCall = false;
      let sawPlaybookLoaded = false;
      let stateTransitionCount = 0;
      // 硬护栏：模型在 S0/S1 已经说过承接句后，切换到 S1/S2 到"出卡片"之间不再放行任何文字。
      // 否则模型切到新阶段、读到新手册里"出卡前先说一句"的规则，会把承接句再说一遍（双段气泡）。
      // 纯提示词压不住（手册与入场注入互相打架），这里在事件层确定性抑制：切换瞬间已开口即置位，
      // activities_proposed/step_published 出产物后解除。
      let suppressSpeechUntilCard = false;
      const isSessionFirstTurn = this.memory.recentTranscript().length === 0;
      const selectedAtTurnStart = this.memory.selected;
      const isOnLastStepAtTurnStart = !!selectedAtTurnStart
        && this.memory.stepIndex >= (selectedAtTurnStart.steps || []).length - 1;
      // 玩家想"换一批"：S1 中明确表达重刷意图，本轮必须重新 propose_activities
      const isRefreshIntent = input.kind === 'text'
        && /换一批|换一组|换几个|换点别的|再来(一)?(批|组|些|个|点)|没看上|没兴趣|不太喜欢|不喜欢这|还有吗|别的呢|其他的呢/.test(input.text || '');
      // 玩家这条消息里是否带了时长表达（用于 S0 偷懒护栏：说了时长却没被 save_user_info 存上）
      const userMentionedDuration = input.kind === 'text'
        && /\d+\s*(分钟|分|小时|个小时|钟头)|十分钟|半小时|一刻钟|几个?小时|一两个小时/.test(input.text || '');
      const trackedEmit: EmitEvent = (event) => {
        const ev = event as Record<string, unknown>;
        if (ev.type === 'state_changed') {
          stateTransitionCount++;
          if (ev.to === 'S2') enteredS2ThisTurn = true;
        }
        if (ev.type === 'activities_proposed') { sawActivitiesProposed = true; suppressSpeechUntilCard = false; flushOpener(); }
        if (ev.type === 'step_published') { sawStepPublished = true; suppressSpeechUntilCard = false; flushOpener(); }
        if (ev.type === 'tool_call' && ev.tool === 'select_activity') sawSelectActivity = true;
        if (ev.type === 'tool_call' && ev.tool === 'propose_activities') sawProposeCall = true;
        if (ev.type === 'tool_call' && ev.tool === 'save_user_info') sawSaveCall = true;
        if (ev.type === 'skill_loaded' && String(ev.skillId ?? '').startsWith('playbook-')) {
          sawPlaybookLoaded = true;
        }
        emit(event);
      };

      // ── 状态切换回调：派发 state_changed、执行目标状态 onEnter、回传即时提示 ──
      const onStateChange = async (from: FSMState, to: FSMState, reason: string): Promise<string | void> => {
        trackedEmit({ type: 'state_changed', from, to, reason });
        // 切换到 S1/S2 的瞬间若模型已经说过承接句，切换后到出卡前的文字一律硬抑制，防双段
        if ((to === 'S1' || to === 'S2') && from !== to) {
          suppressSpeechUntilCard = assistantText.trim().length > 0;
        }
        let handbookNote = '';
        // 进入 S3（终态）= 一条支线真正完成：盖戳记进手账、结算新成就、通知前端
        if (to === 'S3' && from !== to) {
          const rec = await this.recordCompletedQuest();
          if (rec) {
            trackedEmit({
              type: 'handbook_updated',
              view: rec.view,
              newBadges: rec.newBadges,
              questTitle: rec.title,
              category: rec.category,
            });
            handbookNote = this.buildHandbookNote(rec);
          }
        }
        const config = getStateConfig(to);
        if (config.onEnter) {
          const result = await config.onEnter({
            memory: this.memory,
            emit: trackedEmit,
            reason,
            hasSpoken: () => assistantText.trim().length > 0,
          });
          if (result?.injectedInstruction) return result.injectedInstruction + handbookNote;
        }
        return handbookNote || undefined;
      };

      // 本轮模型已输出的可见文本（跨护栏重试累积，不重置）。
      // 工具层据此拦截"默默发卡/发步骤"：玩家发了言，出组件前必须先有一句承接。
      let assistantText = '';
      // 跨护栏重试的文本去重闸门：记录第一段台词出自第几次 invoke；
      // 之后重试 invoke 再产出的文本一律丢弃（重试是为了补工具动作，不是重说一遍）。
      let voiceEmittedOnInvoke: number | null = null;

      // ── 开场台词按句过闸（S1 出卡前 / S2 出第一步前）──────────────────────
      // 模型偶发把步骤指令念进聊天、或甩红线词；提示词压不死，事件层按句截断。
      let openerPhase = '';
      let openerBuffer = '';
      let openerSentenceCount = 0;
      let openerDead = false;

      const emitVoice = (t: string) => {
        voiceEmittedOnInvoke = totalInvokes;
        assistantText += t;
        trackedEmit({ type: 'text_delta', text: t });
      };
      const fallbackOpener = (phase: string) => {
        const pool = FALLBACK_OPENER[phase] || FALLBACK_OPENER.S2;
        return pool[(totalInvokes + stateTransitionCount) % pool.length];
      };
      // 已完整成句的部分逐句判定：干净句放行，脏句丢弃；脏句出现在第一句时用兜底句补位
      const pumpOpener = () => {
        const phase = openerPhase;
        const parts = openerBuffer.match(/[^。！？!?…]*[。！？!?…]+/g) || [];
        let consumed = 0;
        for (const p of parts) {
          consumed += p.length;
          if (openerDead) break;
          if (BANNED_VOICE_SENTENCE.test(p) || (phase === 'S2' && S2_INSTRUCTION_SENTENCE.test(p))) {
            openerDead = true;
            if (openerSentenceCount === 0) {
              emitVoice(fallbackOpener(phase));
              openerSentenceCount++;
            }
            break;
          }
          emitVoice(p);
          openerSentenceCount++;
        }
        openerBuffer = openerBuffer.slice(consumed);
      };
      // 窗口结束（卡片已出/阶段切换）：冲刷未成句的尾巴，脏则丢、净则放，全空则兜底
      const flushOpener = () => {
        if (!openerPhase) return;
        const phase = openerPhase;
        const tail = openerBuffer.trim();
        openerPhase = '';
        openerBuffer = '';
        if (!tail || openerDead || BANNED_VOICE_SENTENCE.test(tail)
          || (phase === 'S2' && S2_INSTRUCTION_SENTENCE.test(tail))) {
          if (openerSentenceCount === 0) {
            emitVoice(fallbackOpener(phase));
            openerSentenceCount++;
          }
          return;
        }
        emitVoice(tail);
        openerSentenceCount++;
      };

      // ── Agent Loop：SDK 自动循环"模型输出→执行工具→喂回结果→继续" ──────────
      // 玩家实时环境（定位坐标 → 城市/天气）：坐标随消息上行，这里解析一次供整轮使用。
      // 外部服务失败/未授权都降级为 null——环境是锦上添花的上下文，绝不阻断对话。
      let envContext: EnvContext | null = null;
      if (input.geo) {
        try {
          envContext = await resolveEnv(input.geo);
          // 回传前端：header 定位状态徽章显示"城市 · 天气"，只给展示所需字段
          trackedEmit({
            type: 'env_resolved',
            env: {
              city: envContext.city ?? null,
              district: envContext.district ?? null,
              province: envContext.province ?? null,
              weather: envContext.weather
                ? { text: envContext.weather.text, tempC: envContext.weather.tempC }
                : null,
            },
          });
        } catch (err) {
          this.tracer?.log('error', { phase: 'resolve_env', error: err instanceof Error ? err.message : String(err) });
          envContext = null;
        }
      }

      // ── 独立证物验收：证物轮在主对话前先由验收员核对，得到权威 verdict ──────────
      // 核对期间向前端发 stepping 反馈；verdict 会同时用于注入吱呀上下文与工具硬门控。
      if (input.kind === 'submit_text' || input.kind === 'submit_photo') {
        const currentStep = this.memory.selected?.steps?.[this.memory.stepIndex];
        if (currentStep) {
          trackedEmit({ type: 'stepping', text: '正在核对证物…' });
          const tRev = Date.now();
          evidenceReview = await reviewEvidence({
            step: currentStep,
            kind: input.kind,
            text: input.kind === 'submit_text' ? input.text : input.description,
            imageDataUrl: input.kind === 'submit_photo' ? input.imageDataUrl : undefined,
            geo: input.geo,
            claimedPlace: this.memory.collected.scene,
          });
          trackedEmit({ type: 'stepping_end' });
          this.tracer?.log('info', {
            phase: 'evidence_review',
            stepIndex: this.memory.stepIndex,
            available: evidenceReview.available,
            verdict: evidenceReview.verdict,
            reason: evidenceReview.reason,
            whatNeeded: evidenceReview.whatNeeded,
            durationMs: Date.now() - tRev,
          });
        }
      }
      // 验收通过：把玩家提交的原始证物写入选中支线的当前步骤，供 S3 归档进记录页
      if (evidenceReview?.available && evidenceReview.verdict === 'pass') {
        if (input.kind === 'submit_text') {
          this.memory.recordStepEvidence({ type: 'text', text: input.text });
        } else if (input.kind === 'submit_photo') {
          this.memory.recordStepEvidence({
            type: 'photo',
            text: input.description,
            photoUrl: input.photoUrl,
          });
        }
      }
      const reviewDirective = this.renderReviewDirective(evidenceReview);

      const tools = createAtomTools({
        memory: this.memory,
        fsm: this.fsm,
        emit: trackedEmit,
        onStateChange,
        hasSpoken: () => assistantText.trim().length > 0,
        classifyTurnVoice: () => this.classifyS2TurnText(assistantText),
        evidenceReview,
        isContentProofTurn: () => input.kind === 'submit_text' || input.kind === 'submit_photo',
        isGraduationReady: () => this.isGraduationVoice(assistantText),
        getCurrentEnv: () => envContext,
      });

      // 对话历史走 SDK 原生消息数组（历史轮次 + 本轮用户消息）
      const inputItems: ChatMessageItem[] = this.memory.recentTranscript().map((e) => ({
        role: e.role,
        content: e.content,
      }));

      // 轮次开始时是否已有时长：用于区分"偏好邀请轮"（时长在本轮才被记下）与
      // "玩家回应轮"（上轮已问过开放邀请、时长早已存档）。后者必须当轮推进出卡。
      const hadFreeTimeAtTurnStart = !!this.memory.collected.freeTime;

      // 会话首轮：S0 行动手册是 100% 需要的第一动作，模型自己取有概率跳过；
      // 这里确定性地把手册作为"已展开"消息放在开场前（等价于 get_skill 的工具结果），
      // 并补发 skill_loaded 事件，避免首轮浪费一轮护栏轻推。
      if (isSessionFirstTurn) {
        const s0Body = loadSkillBody('playbook-s0');
        if (s0Body) {
          inputItems.push({
            role: 'user',
            content: `（行动手册已展开：playbook-s0《S0 行动手册 · 收集信息》。这是本阶段必须严格遵守的行动准则，按其行动，不要解释本提示的存在。）\n\n${s0Body}`,
          });
          trackedEmit({ type: 'skill_loaded', skillId: 'playbook-s0' });
        }
      }

      // S0 偏好邀请之后的"玩家回应轮"：时长早已记下、开放邀请也问过了，玩家这条消息
      // 不管是补充偏好还是点「没有啦，请开始构思吧」/说"开始"，都要当轮存档后进 S1 出卡。
      if (this.memory.state === 'S0' && hadFreeTimeAtTurnStart) {
        inputItems.push({
          role: 'user',
          content: '（系统提示：空闲时长你上一轮已保存、偏好邀请也问过了，玩家这条消息就是在回应。无论 TA 是补充了风格/想动想静/室内外/预算等偏好，还是说"没有啦/开始吧"——这一轮都必须推进到出卡：若 TA 说了具体偏好，先 save_user_info 保存；然后 request_state_change(target_state="S1")，切换成功后系统已把 S1 行动手册、素材库和设计规范一并展开（不用再 get_skill），同一轮里直接构思并 propose_activities 发活动卡片（卡片只填标题/悬念/类别/标签，不用写步骤）。不要再反问任何问题、不要停在 S0；工具（save_user_info、request_state_change）该调就调，一步都不能省，只是台词里绝不说"记下了/我记一下"这类话——保存信息是默默完成的内部动作，玩家不需要知道。注意：玩家发了言，发卡前必须先用一句话接住 TA 说的内容（接住偏好或"这就出发"），同一句自然引向支线卡片——不能一句话不说就默默发卡。这句话要落到「支线任务」的意象上：把候选说成"几条支线/替你留了几条支线"，自然引一句去挑选（如"替你留了几条支线——都是家里就能动身的，看看哪一条合此刻的心情"）；禁止"开张""上架""安排活儿"这类和支线不搭的词，也不要"找了几件小事"这种平淡说法。）',
        });
      }

      // 拍照验收轮：照片作为多模态 part 随当轮用户消息一起喂给模型（文字历史仍只留描述），
      // 让模型真正"看图核对"证物，而不是只凭玩家的一句话回答验收。
      if (input.kind === 'submit_photo' && input.imageDataUrl) {
        inputItems.push({
          role: 'user',
          content: [
            { type: 'input_text', text: (userMessage || '我拍了张照片，你看看。') + reviewDirective },
            { type: 'input_image', image: input.imageDataUrl },
          ],
        });
      } else {
        inputItems.push({ role: 'user', content: (userMessage || '（空消息）') + reviewDirective });
      }

      // ── 放弃 = 确定性流转：玩家点了"放弃"，立刻退回"挑选支线"(S1)，不靠模型自觉调工具 ──
      // 直接回 S1 而非 S0：任务 tag/抽屉全程不卸载（进行中→再挑选无缝衔接），护栏同轮保证重新发卡；
      // state_changed(S1) 驱动前端把刚放下的支线以"已放下"归档进时间轴。
      if (input.kind === 'abandon' && (this.memory.state === 'S2' || this.memory.state === 'S3')) {
        const tr = await this.fsm.requestTransition('S1', '玩家主动放弃当前支线，退回挑选');
        if (tr.success && tr.previousState !== tr.newState) {
          const enterHint = await onStateChange(tr.previousState!, tr.newState!, '玩家主动放弃当前支线，退回挑选');
          if (enterHint) inputItems.push({ role: 'user', content: String(enterHint) });
        }
      }

      let result: LLMInvokeResult | null = null;

      // 护栏循环：该由工具完成的动作缺失时，追加轻推在同一轮内继续 loop。
      // 预算规则：无进展的轻推最多 MAX_GUARD_NUDGES 次；若自上次轻推后发生了状态切换
      //（模型推进了阶段，只是新阶段的动作还没做完），视为有进展、不消耗预算；
      // 总 invoke 次数另设硬上限防止死循环。
      const MAX_GUARD_NUDGES = 2;
      const MAX_TOTAL_INVOKES = 6;
      let guardNudges = 0;
      let totalInvokes = 0;
      let transitionsAtLastNudge = 0;
      while (totalInvokes < MAX_TOTAL_INVOKES) {
        const attempt = guardNudges;
        totalInvokes++;
        // 每次尝试前按最新状态重组装 context（snapshot 随状态变化；行动手册走 get_skill 工具通道）
        const handbookBrief = buildHandbookBrief(await getView(this.clientId));
        const profileBrief = buildProfileBrief(await getProfile(this.clientId));
        const ctx = assembleContext(this.memory, handbookBrief, renderEnvBrief(envContext), profileBrief);

        // 流式台词净化：跨 chunk 丢弃括号旁白/图片链接/元文本
        const voiceFilter = createVoiceStreamFilter();
        result = await this.llm.invoke(
          {
            userMessage,
            inputItems,
            instructions: ctx.full,
            contextLayers: ctx.layers,
            tools,
            label: totalInvokes === 1 ? 'main' : `guard-nudge-${totalInvokes - 1}`,
            maxTurns: RUN_MAX_TURNS,
            toolCallCallback: (toolName) => {
              this.tracer?.log('tool_call', { toolName });
              trackedEmit({ type: 'tool_call', tool: toolName });
            },
            streamTextCallback: (text) => {
              // 硬抑制窗口（切换阶段后、出卡片前，且切换前已说过话）：
              // 丢弃重复承接文本——不发射给前端、不累积进 assistantText（历史只留第一句）
              if (suppressSpeechUntilCard) return;
              // 跨重试去重：第一次产出台词的 invoke 之后，后续重试 invoke 的文本整段丢弃
              if (voiceEmittedOnInvoke !== null && voiceEmittedOnInvoke !== totalInvokes) return;
              // 括号舞台说明/图片链接/系统元文本逐字过滤（模型护栏重试时可能模仿占位符格式）
              const clean = voiceFilter(text).replace(META_LINE_PAT, '').replace(VOICE_URL_PAT, '').trim();
              if (!clean) return;
              // 开场窗口（S1 出卡前 / S2 出第一步前）：按句过闸，拦截红线词与步骤指令泄漏。
              // S2 仅在"本轮刚切入 S2、第一步卡未发"时算开场；玩家交证物的验收轮
              //（enteredS2ThisTurn=false，只是这轮新卡未发）不是开场——验收/驳回台词要原样放行，
              // 绝不能套用开场过闸或兜底接任务句（否则交照片会被回一句文不对题的"好，就这条，慢慢开始"）。
              const phase = (this.fsm.current === 'S2' && enteredS2ThisTurn && !sawStepPublished) ? 'S2'
                : (this.fsm.current === 'S1' && !sawActivitiesProposed) ? 'S1' : '';
              if (!phase) {
                emitVoice(clean);
                return;
              }
              if (openerPhase !== phase) {
                flushOpener();
                openerPhase = phase;
                openerBuffer = '';
                openerSentenceCount = 0;
                openerDead = false;
              }
              openerBuffer += clean;
              pumpOpener();
            },
            steppingCallback: (text) => {
              trackedEmit(text ? { type: 'stepping', text } : { type: 'stepping_end' });
            },
            thinkingCallback: (phase) => {
              trackedEmit({ type: phase === 'start' ? 'thinking_start' : 'thinking_end' });
            },
          },
          this.tracer
        );

        if (!result.success) {
          trackedEmit({ type: 'error', message: result.errorMessage || 'Agent 运行出错' });
          break;
        }

        const nudge = this.buildGuardNudge({
          enteredS2ThisTurn,
          sawActivitiesProposed,
          sawStepPublished,
          sawSelectActivity,
          sawProposeCall,
          sawSaveCall,
          sawPlaybookLoaded,
          isSessionFirstTurn,
          isOnLastStepAtTurnStart,
          hadFreeTimeAtTurnStart,
          userMentionedDuration,
          isSelectIntent: input.kind === 'select_activity',
          isRefreshIntent,
          isSubmissionIntent: input.kind === 'submit_text' || input.kind === 'submit_photo',
          activityId: input.kind === 'select_activity' ? input.activityId : undefined,
          assistantText,
          attempt,
        });
        if (!nudge) break;

        // 自上次轻推后发生过状态切换 = 模型有实质进展，新阶段的动作缺失不消耗预算
        const progressed = stateTransitionCount > transitionsAtLastNudge;
        transitionsAtLastNudge = stateTransitionCount;
        if (!progressed) {
          guardNudges++;
          if (guardNudges > MAX_GUARD_NUDGES) {
            // 确定性入场兜底：玩家已明确选定活动（activityId 无歧义），但模型在整个轻推
            // 预算内始终不调 select_activity / request_state_change（偶发"光说不调工具"、
            // 甚至用文字编造系统状态空转），若就此结束会卡死在 S1、前端沉默。这里系统直接
            // 登记选中并切到 S2（复用 onStateChange 的全部副作用），随后重置轻推预算，让
            // 模型在 S2 开场护栏下完成 design_activity_steps + publish_step 第一步。
            if (
              input.kind === 'select_activity'
              && this.fsm.current === 'S1'
              && !this.memory.selected
              && input.activityId
            ) {
              const act = this.memory.findActivity(input.activityId);
              if (act) {
                this.memory.setSelectedActivity(act);
                const tr = await this.fsm.requestTransition(
                  'S2',
                  `玩家已选定「${act.title}」（模型未及时调工具，系统确定性兜底入场）`
                );
                if (tr.success) {
                  const enterHint = await onStateChange(tr.previousState ?? 'S1', tr.newState ?? 'S2', `玩家选定「${act.title}」`);
                  this.tracer?.log('info', { phase: 'fallback_select_to_s2', activityTitle: act.title });
                  guardNudges = 0;
                  transitionsAtLastNudge = stateTransitionCount;
                  if (enterHint) inputItems.push({ role: 'user', content: String(enterHint) });
                  continue;
                }
              }
            }
            break;
          }
        }

        this.tracer?.log('info', { phase: 'guard_nudge', attempt: guardNudges, progressed, nudge });
        // 已说过话则回喂真实台词；零文本时回喂的占位必须明确是"系统内部状态"，
        // 否则模型会把占位符（如"无文本输出"）当成台词原样复述出来满足"先开口"硬护栏。
        inputItems.push({
          role: 'assistant',
          content: assistantText.trim()
            ? assistantText.slice(-400)
            : '（系统内部记录：上一动作只调用了工具，还没有对玩家说出任何台词。这行是系统状态、不是台词，严禁原样复述或念给玩家听；若你还没对玩家开口，先用一句自然的话开场，再调用缺失的工具完成动作。）',
        });
        inputItems.push({ role: 'user', content: nudge });
      }

      const finalAssistantText = sanitizeVoiceText((assistantText || result?.visibleOutput || '').trim());

      // 本轮结束后统一记录对话历史（用户与助手各一条），供后续轮次的 message 列表使用
      this.memory.appendTranscript('user', this.transcriptUserText(input));
      this.memory.appendTranscript('assistant', finalAssistantText);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Coordinator] unhandled error:', message);
      this.tracer?.log('error', { phase: 'coordinator_process', error: message, stack: err instanceof Error ? err.stack : undefined });
      emit({ type: 'error', message });
    }

    this.tracer?.log('info', { phase: 'turn_complete', durationMs: Date.now() - tStart, finalState: this.memory.state });

    // ── 驳回重发：证物轮被验收员判 reject（或验收服务不可用降级）时，当前步不会推进，
    //    吱呀只输出了驳回话术。为了让玩家不用往上翻找旧卡片，这里重新 emit 一次当前
    //    步骤卡片，紧跟在驳回话术下方，提交入口直接可见。verdict=pass 时由 publish_step
    //    正常推进，不需要重发。 ──────────────────────────────────────────────
    const isProofTurn = input.kind === 'submit_text' || input.kind === 'submit_photo';
    const rejected = evidenceReview && !evidenceReview.available
      ? true // 验收服务不可用：降级为台词门，仍有可能被拦下，重发卡片让玩家能继续交
      : evidenceReview?.verdict === 'reject';
    if (isProofTurn && rejected && this.memory.state === 'S2') {
      const selected = this.memory.selected;
      const currentStep = selected?.steps?.[this.memory.stepIndex];
      if (selected && currentStep && selected.steps) {
        emit({
          type: 'step_published',
          step: {
            index: this.memory.stepIndex,
            instruction: currentStep.instruction,
            hint: currentStep.hint,
            submissionType: currentStep.submissionType,
            submissionPrompt: SUBMISSION_PROMPTS[currentStep.submissionType],
            proofPrompt: currentStep.proofPrompt,
            suggestedSeconds: currentStep.suggestedSeconds ?? 0,
          },
          total: selected.steps.length,
          activityTitle: selected.title,
        });
        this.tracer?.log('info', { phase: 'reject_republish_step', stepIndex: this.memory.stepIndex });
      }
    }

    emit({ type: 'turn_complete', fsmState: this.memory.state });
  }

  /**
   * 卡片动作缺失护栏：run 结束后，若该由工具完成的动作没做（模型提前结束回合
   * 或用文字代替卡片），返回一条即时轻推消息追加进同一轮的 agent loop；
   * 一切正常返回 null。护栏只提醒"完成动作"，不替代模型做任何决策。
   */
  private buildGuardNudge(opts: {
    enteredS2ThisTurn: boolean;
    sawActivitiesProposed: boolean;
    sawStepPublished: boolean;
    sawSelectActivity: boolean;
    sawProposeCall: boolean;
    sawSaveCall: boolean;
    sawPlaybookLoaded: boolean;
    isSessionFirstTurn: boolean;
    isOnLastStepAtTurnStart: boolean;
    hadFreeTimeAtTurnStart: boolean;
    userMentionedDuration: boolean;
    isSelectIntent: boolean;
    isRefreshIntent: boolean;
    isSubmissionIntent: boolean;
    activityId?: string;
    assistantText: string;
    attempt: number;
  }): string | null {
    const {
      enteredS2ThisTurn,
      sawActivitiesProposed,
      sawStepPublished,
      sawSelectActivity,
      sawProposeCall,
      sawSaveCall,
      sawPlaybookLoaded,
      isSessionFirstTurn,
      isOnLastStepAtTurnStart,
      hadFreeTimeAtTurnStart,
      userMentionedDuration,
      isSelectIntent,
      isRefreshIntent,
      isSubmissionIntent,
      activityId,
      assistantText,
      attempt,
    } = opts;

    const again = attempt > 0
      ? `这是第 ${attempt + 1} 次提醒：不要再解释或道歉，不要输出任何说明文字，直接调用工具。`
      : '';

    // 说话门控：本轮已经对玩家说过的话会原样留在上面的 assistant 消息里、且已流式显示给玩家。
    // 护栏重试只补"缺失的工具动作"——若模型已开口，严禁把邀请/承接/说明再说第二遍
    // （否则两段话会追加进同一个气泡，表现为"第一段内容回复两遍"）；没说过话则维持各条护栏原有的说话要求。
    const tail = assistantText.trim().length > 0
      ? `你这轮已经对玩家说过话了（上面那条 assistant 消息就是，玩家已经看到），这次禁止再输出任何文字——把邀请/承接/说明的话重复第二遍是错误。一句话都不要多说，直接调用缺失的工具完成动作。${again}`
      : again;

    // 会话首轮（S0）：行动手册不固定装载，模型必须先 get_skill 取 playbook-s0 手册再开口
    if (isSessionFirstTurn && this.memory.state === 'S0' && !sawPlaybookLoaded) {
      return `（系统提示：你还没取行动手册。第一个动作必须是 get_skill(skill_id="playbook-s0")，读完手册再开口：先把玩家从落地页带来的信息用 save_user_info 一次存全（时长/场景/和谁）；时长还缺，就一句话问时长；时长一到手，就用一句开放、不定向的话邀请玩家补充可选偏好，并提示可点「没有啦，请开始构思吧」跳过，问完停下等回应，不要直接出卡、不要逐项追问。先调工具，再说话。${tail}）`;
    }

    // S0 玩家消息里明明说了时长（"15分钟"），模型却没调 save_user_info、还在反问时长：
    // 纯聊天偷懒——轻推它先把时长和场景信息存全，再发开放偏好邀请
    if (
      this.memory.state === 'S0'
      && !hadFreeTimeAtTurnStart
      && !this.memory.collected.freeTime
      && !sawSaveCall
      && userMentionedDuration
    ) {
      return `（系统提示：玩家这条消息里已经说了空闲时长（比如"15分钟"），你这轮却没调 save_user_info、还在问时长——信息不会自己存上，必须由你调用工具保存。立即 save_user_info 把时长和 TA 顺带说的场景/人数等信息一次存全；保存成功后按 S0 手册继续：用一句开放、不定向的话邀请玩家补充可选的大方向偏好（想安静还是想动、室内还是户外、预算、想放空还是动脑），并提示可以点「没有啦，请开始构思吧」跳过，问完停下等回应。不要再反问时长——玩家已经说过了。工具该调就调，只是台词里别提"记下了/我记一下"这类话。${tail}）`;
    }

    // S0 偏好邀请之后的"玩家回应轮"却仍停在 S0：时长早有了、玩家也回应了，
    // 模型却没推进——轻推它当轮转 S1 并出卡，不要再问。
    if (this.memory.state === 'S0' && hadFreeTimeAtTurnStart && !sawActivitiesProposed) {
      return `（系统提示：空闲时长上一轮已保存，玩家这条消息就是对"还有什么偏好"的回应。立即 request_state_change(target_state="S1")，切换成功后同一轮里 get_skill 取 playbook-s1 与设计规范并 propose_activities 发卡片；玩家补充了偏好就先 save_user_info 保存。不要再反问、不要停在 S0；工具该调就调，只是嘴上绝不说"记下了/我记一下"这类话（保存是默默完成的内部动作）。${tail}）`;
    }

    // S0 中直接调了 propose_activities（工具层已驳回）但还没转场到 S1：
    // 常见于模型跳过 request_state_change 直接开始发卡，轻推它先完成阶段切换
    if (this.memory.state === 'S0' && sawProposeCall && !sawActivitiesProposed) {
      return `（系统提示：你还没进入推荐阶段——propose_activities 只在 S1 有效，在 S0 调用会被驳回。立即 request_state_change(target_state="S1", reason)，切换成功后同一轮里重新 propose_activities。${tail}）`;
    }

    // 已进入 S2 但第一步卡片没发
    if (this.memory.state === 'S2' && enteredS2ThisTurn && !sawStepPublished) {
      // 步骤是 S2 阶段为选中支线延迟设计的：还没 design_activity_steps 就先补设计，再发第一步
      const plannedCount = this.memory.selected?.steps?.length ?? 0;
      if (plannedCount === 0) {
        return `（系统提示：选中支线的步骤还没设计。立即调用 design_activity_steps 按设计规范设计 2-4 步（最后一步必须是 text/photo 证据步；这是静默内部动作，不要对玩家提），成功后紧接着 publish_step(step_index=0) 把第一步发出来。${tail}）`;
      }
      // 零文本时工具层 publish_step 要求"先开口"，这里要与之一致：引导说一句短开场（不描述步骤）再发卡；
      // 已开口则 tail 会禁言，只催发卡，避免"立即 publish / 不要用文字" 与工具硬护栏互相打架。
      const opener = assistantText.trim()
        ? ''
        : '你这轮还没对玩家开口——先用一句自然的短话承接 TA 这次的选择（点个头、招呼一声就出发即可），但不要在聊天里描述步骤内容；说完紧接着 ';
      return `（系统提示：第一步卡片还没发。${opener}立即调用 publish_step(step_index=0) 把第一步发出来——步骤内容只能写进卡片里，不要用文字描述步骤。${tail}）`;
    }

    // 末步提交轮：本轮开始时已在最后一步，用户提交后仍停留在 S2（既没切 S3 也没驳回）
    // 常见失败：模型验收通过后重复 publish_step 最后一步、或用文字祝贺代替切状态
    if (
      this.memory.state === 'S2'
      && !enteredS2ThisTurn
      && isSubmissionIntent
      && isOnLastStepAtTurnStart
    ) {
      const cls = this.classifyS2TurnText(assistantText);
      if (cls === 'accepted') {
        // 明确判定达标却没切 S3：补切完成
        return `（系统提示：这是最后一步，你已判定达标——立即 request_state_change(target_state="S3", reason="全部步骤完成") 触发祝贺，不要再发步骤卡片。${tail}）`;
      }
      if (cls === 'unclear') {
        // 含糊（既没明确通过也没明确驳回）：给二选一，但把"不达标必须驳回"钉死，绝不默认毕业
        return `（系统提示：这是最后一步的证物，你还没给明确结论。认真核对玩家交的东西：数量够、和任务对得上、答的是这一步的问题，才算达标——达标才 request_state_change(target_state="S3", reason="全部步骤完成") 触发祝贺；只要答非所问、数量不够、和画面/任务对不上，就用文字具体指出差在哪、让玩家重交，停在 S2，绝不含糊放行切到 S3。${tail}）`;
      }
      // cls === 'rejected'：模型在驳回/追问补料，不打扰
    }

    // S2 中该轮结束时既没发布下一步卡片也没切 S3：
    // 按钮提交（submit_*）且模型未明确驳回时必查；自由文本轮次仅在模型文字里
    // 出现"口头验收/介绍下一步"信号时兜底；模型明确追问补料（驳回）时不打扰
    if (
      this.memory.state === 'S2'
      && !enteredS2ThisTurn
      && !sawStepPublished
    ) {
      const cls = this.classifyS2TurnText(assistantText);
      const shouldNudge = cls === 'accepted' || (isSubmissionIntent && cls !== 'rejected');
      if (shouldNudge) {
        const directive = this.s2ProgressDirective();
        if (cls === 'accepted') {
          return `（系统提示：你嘴上说了验收通过/下一步，但没调工具——文字代替不了卡片，用户看不到下一步。${directive || '立即 publish_step 发下一步卡片；刚验收的若是最后一步，改调 request_state_change(target_state="S3", reason="全部步骤完成")。'}${tail}）`;
        }
        return `（系统提示：用户已交成果，你还没给反馈动作。${directive || '达标就立即 publish_step 发下一步（最后一步则 request_state_change 切 S3）；不达标就用文字具体指出差在哪、让用户补充。'}下一步内容只能写进卡片，不许在聊天里描述。${tail}）`;
      }
    }

    // 用户已选定活动，但模型完全没调 select_activity（常见失败：用文字直接扮演执行）
    if (isSelectIntent && this.memory.state === 'S1' && !sawSelectActivity) {
      const act = activityId ? this.memory.findActivity(activityId) : undefined;
      const target = act
        ? `select_activity(activityId="${act.id}")`
        : 'select_activity，参数为用户所选活动的 id';
      return `（系统提示：用户已选定活动，你还没确认。严格按顺序调工具：1) ${target}；2) request_state_change(target_state="S2", reason)。切换成功后系统会自动提示你发第一步。这两个工具完成前，禁止调用 publish_step（在 S1 调用必被驳回），禁止用聊天文字描述任何步骤或替玩家执行——步骤只能出现在 S2 的 publish_step 卡片里。${tail}）`;
    }

    // 已调 select_activity 但没切 S2（工具返回提示被忽略）
    if (this.memory.state === 'S1' && sawSelectActivity && !enteredS2ThisTurn) {
      return `（系统提示：活动已选中，但还没进入执行阶段。立即 request_state_change(target_state="S2", reason)；切换成功后系统会展开 S2 手册与设计规范，同一轮里先 design_activity_steps 设计步骤、再 publish_step(step_index=0) 发出第一步。${tail}）`;
    }

    // 玩家点了「换一批」/明说要换，但本轮结束都没重新发卡：必须再 propose_activities
    if (this.memory.state === 'S1' && isRefreshIntent && !sawActivitiesProposed) {
      return `（系统提示：玩家想换一批支线，但本轮还没发出新的活动卡片。立即行动：若 TA 顺带说了新偏好先 save_user_info 保存，然后直接再次调用 propose_activities 提交一组新的 2-4 个差异化活动覆盖旧卡片（不要重复上一批的标题和玩法）。卡片前只允许一句引导语，不要解释、不要反问、不要只说话不发卡、不要说"记下了/我记一下"这类话。${tail}）`;
    }

    // S1 阶段连活动卡片都还没发
    if (
      this.memory.state === 'S1'
      && !sawActivitiesProposed
      && this.memory.proposedActivitiesList.length === 0
    ) {
      return `（系统提示：活动卡片还没发，用户看不到任何选项。立即调用 propose_activities 提交活动数组——活动只能出现在卡片里，不要用文字罗列，也不要再解释。${tail}）`;
    }

    return null;
  }

  /**
   * 启发式分类 S2 一轮回复的文字意图（仅用于护栏轻推的触发与措辞，不参与业务决策）：
   * - accepted：出现口头验收/通关祝贺/介绍下一步的信号、且无驳回信号
   * - rejected：明确追问补料、要求重试（正常驳回，不打扰）
   * - unclear：两者都不明显（零工具时仍轻推提醒发卡或驳回二选一）
   * 注意：不能用裸问号判驳回——验收祝贺里常含语气问句（"这波不亏吧？"），
   * 驳回信号必须是具体的追问/补料词。
   */
  private classifyS2TurnText(text: string): 'accepted' | 'rejected' | 'unclear' {
    if (!text) return 'unclear';
    const accepted = /通过|过关|通关|达标|合格|(?<![不没未别])过了|(?<![不没未别])过[。，！、\s]|没问题|没毛病|完成了|完成啦|搞定|收工|稳了|认可|收下|算你过|给你过|准了|下一步|最后一步|这关过|这步过|这步算|这条算|这张算/;
    const rejected = /还没|还差|不够|再试|重新|补一|补充|补交|补上|说说|告诉我|是什么|什么东西|哪一|没看到|没看清|看不到|看不清|没法收|不能收|不收|收回|对不上|不对题|答非所问|驴唇|跑题|答偏|答的不是|没回答|重拍|再拍|重交|再来一|重来|拍一张|拍个|拍给我|给我看看|给我瞧瞧|交上来|交回来|交一下|过不了|过不去|不过|不通过|不算|不达标|不搭|不沾|沾不上|跟题|文不对题|离题|跑偏|扯远|不相关|不相干|没关系|搁一边|先欠着|再算|废话|题外话|瞎扯|乱说|乱七八糟|无厘头|摸不着头脑|答的啥|说的啥|呢[？?]|不是.{0,12}(证物|这一步|任务|活动|问题)/;
    const a = accepted.test(text);
    const r = rejected.test(text);
    if (a && !r) return 'accepted';
    if (r) return 'rejected';
    return 'unclear';
  }

  /**
   * 毕业判定（比 accepted 更严）：切 S3 必须有明确的"全部完成/达标/恭喜收工"信号。
   * 仅引用"下一步/最后一步"来布置任务不算毕业；含任何驳回信号也不算。
   */
  private isGraduationVoice(text: string): boolean {
    if (!text) return false;
    if (this.classifyS2TurnText(text) === 'rejected') return false;
    return /通过|过关|通关|达标|合格|完成|搞定|收工|毕业|恭喜|撒花|齐了|齐活|圆满|大功告成|全部做完|都做好了|全部做到|全做到了/.test(text);
  }

  /**
   * S2 验收轮权威进度指令：基于 memory.stepIndex（最近发布的步）与已设计步数，
   * 确定性算出"玩家刚交第几步、下一步发几、是否最后一步"，供护栏轻推与工具失败
   * 返回共用。避免模型自己数错步数——数错会导致 publish_step 越界、漏发或在
   * 最后一步还发卡，进而护栏反复轻推耗尽预算、流程卡死。
   */
  private s2ProgressDirective(): string | null {
    const sel = this.memory.selected;
    const total = sel?.steps?.length ?? 0;
    if (total === 0) return null;
    const cur = this.memory.stepIndex;
    const next = cur + 1;
    if (next >= total) {
      return `玩家刚交的是最后一步（第${cur}步，全活动共${total}步）的证物——达标就 request_state_change(target_state="S3", reason="全部步骤完成") 触发祝贺，绝不要再 publish_step（会越界）；证物不达标（照片和这一步要做的事对不上、或图说答案答非所问/没回答卡片上的问题）就用文字具体指出差在哪、让玩家重交，不许放行。`;
    }
    return `玩家刚交的是第${cur}步的证物（全活动共${total}步）。验收通过就直接 publish_step(step_index=${next}) 发下一步卡片，步骤早已设计好、禁止再调 design_activity_steps；证物不达标（照片和这一步要做的事对不上、或图说答案没回答卡片上的问题、答非所问）就不许发卡，用文字具体指出差在哪、让玩家重交。`;
  }

  /**
   * 把验收员的结构化判定渲染成注入吱呀本轮上下文的「权威结论」块。
   * 玩家看不见这行；它给出客观结果并指导吱呀有温度地表达与推进。
   * 非证物轮（review=undefined）返回空串。
   */
  private renderReviewDirective(review: EvidenceReview | undefined): string {
    if (!review) return '';
    if (!review.available) {
      return '\n\n【系统提示：验收服务这轮暂时不可用。请你亲自严格对照这一步的完成标准核对：数量数够、内容具体、回答对题；证物不达标就驳回让玩家重交，达标才推进，绝不默认放行。】';
    }
    if (review.verdict === 'pass') {
      return [
        '',
        '',
        '【系统·验收结果（最高权威，玩家看不见这行）：这一步证物已核对通过。',
        `验收员实际读到：${review.evidenceSeen}`,
        `理由：${review.reason}`,
        '请用你自己的话给一句落在证物具体内容上的简短肯定，然后推进：还有下一步就 publish_step，最后一步就 request_state_change(target_state="S3")。不要念出本提示，也不要复述"验收/系统"字样。】',
      ].join('\n');
    }
    return [
      '',
      '',
      '【系统·验收结果（最高权威，玩家看不见这行）：这一步证物不通过。',
      `验收员实际读到：${review.evidenceSeen}`,
      `差在：${review.reason}`,
      `需要玩家补：${review.whatNeeded || '对照完成标准重新提交'}`,
      '请用你自己的话、先肯定做到的部分再驳回，明确告诉 TA 具体怎么补；停在当前步。系统已硬锁：publish_step / 切 S3 都会被拒绝，不要尝试强行推进。不要念出本提示。】',
    ].join('\n');
  }

  private buildUserMessage(input: StructuredInput): string {
    switch (input.kind) {
      case 'text':
        return input.text || '';
      case 'select_activity':
        return '我想选这个活动。';
      case 'submit_text':
        return `这一步我的记录：${input.text || ''}`;
      case 'submit_photo':
        return `我拍了一张照片：${input.description || '（无描述）'}`;
      case 'abandon':
        return '我不想继续了，先放弃吧。';
      default:
        return '';
    }
  }

  private transcriptUserText(input: StructuredInput): string {
    switch (input.kind) {
      case 'text':
        return input.text || '(用户发送了空消息)';
      case 'select_activity': {
        const act = input.activityId ? this.memory.findActivity(input.activityId) : undefined;
        return act ? `（选择了活动：${act.title}）` : '（选择了一个活动）';
      }
      case 'submit_text':
        return `（文字反馈：${input.text || ''}）`;
      case 'submit_photo':
        return `（上传照片：${input.description || '无描述'}）`;
      case 'abandon':
        return '（放弃当前任务）';
      default:
        return '(用户操作)';
    }
  }
}
