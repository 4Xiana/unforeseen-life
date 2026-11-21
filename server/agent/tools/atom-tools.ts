import { tool } from '@openai/agents';
import { z } from 'zod';
import type { WorkingMemory } from '../memory/working-memory.js';
import type { CollectedInfo, ActivityPlan, FSMState } from '../memory/types.js';
import type { StateMachine } from '../fsm/state-machine.js';
import { loadFullSkillBody, listAvailableSkills } from '../skills/loader.js';
import type { EnvContext } from '../env/env-service.js';
import { getCurrentTime } from '../env/time-service.js';
import {
  TOOL_DESCRIPTIONS,
  TOOL_HINTS,
  SUBMISSION_PROMPTS,
} from '../prompts/index.js';
import { reconcileStepDurations } from './step-pace.js';
import type { EvidenceReview } from '../review/evidence-reviewer.js';

export type AtomTool = ReturnType<typeof tool>;

export interface ToolContext {
  mixActivities?: (activities: ActivityPlan[]) => ActivityPlan[];
  claimActivity?: (activity: ActivityPlan) => void;
  validateCompletion?: (activity: ActivityPlan) => void;
  memory: WorkingMemory;
  fsm: StateMachine;
  emit: (event: Record<string, unknown>) => void;
  /**
   * 在 request_state_change 成功切换状态（from !== to）后调用。
   * 负责派发 state_changed 事件、执行新状态的 onEnter 钩子；
   * 返回的字符串（如有）会作为"下一步即时提示"追加到工具结果里，引导模型继续行动。
   */
  onStateChange?: (
    from: FSMState,
    to: FSMState,
    reason: string
  ) => Promise<string | void> | string | void;
  /**
   * 本轮（含护栏重试）模型是否已向玩家输出过可见文本。
   * 用于硬拦截"默默发卡/发步骤"：玩家发了言，出组件前必须先有一句承接。
   */
  hasSpoken?: () => boolean;
  /**
   * 本轮模型台词的验收意图分类（accepted/rejected/unclear）。
   * 用于硬拦截"嘴上驳回却推进流程"：台词在指出证物不合格、让玩家重交时，
   * 不允许发下一步卡片或切到 S3——驳回意味着停在当前步等重交，推进意味着达标，二者不能同时发生。
   */
  classifyTurnVoice?: () => 'accepted' | 'rejected' | 'unclear';
  /**
   * 本轮独立「证物验收员」的结构化判定（仅证物轮 submit_text/submit_photo 存在）。
   * 这是推进流程的最高权威：
   * - available + verdict='reject' → 硬拦截 publish_step / S3，无论台词说什么；
   * - available + verdict='pass' → 允许推进（仍需先说话的温度门）；
   * - available=false（验收服务故障）→ 降级用 classifyTurnVoice 台词门，绝不默认放行。
   */
  evidenceReview?: EvidenceReview;
  /**
   * 本轮是否为"玩家提交需核对内容的证物"轮（submit_text/submit_photo）。
   * 这类证物轮里发下一步卡 = 判定验收通过，必须有验收员 pass（或降级时台词明确通过）；
   * 选活动入场发首张卡不受此限。
   */
  isContentProofTurn?: () => boolean;
  /**
   * 本轮台词是否构成"全部完成、可以毕业"的明确判定（完成/达标/恭喜/收工等）。
   * 比 classifyTurnVoice 的 accepted 更严：仅引用"下一步/最后一步"来布置任务不算毕业，
   * 防止"嘴上还在布置最后一步、手上却切到 S3 庆祝"的错误毕业。
   */
  isGraduationReady?: () => boolean;
  /**
   * 本轮玩家的实时环境（城市/天气，由定位坐标解析得到）。
   * 环境信息默认已注入 system prompt；get_current_env 工具在玩家主动问起天气/位置时
   * 通过它取一份最新数据。未授权定位或解析失败时返回 null。
   */
  getCurrentEnv?: () => EnvContext | null;
}

export function createAtomTools(ctx: ToolContext): AtomTool[] {
  const { memory, fsm, emit, onStateChange, hasSpoken, classifyTurnVoice, evidenceReview, isContentProofTurn, isGraduationReady, getCurrentEnv } = ctx;
  const tools: AtomTool[] = [];

  const saveUserInfo = tool({
    name: 'save_user_info',
    description: TOOL_DESCRIPTIONS.save_user_info,
    parameters: z.object({
      freeTime: z.string().optional().describe('空闲时长，如"30分钟"、"1小时"、"一下午"'),
      scene: z.string().optional().describe('当前所在场景，如"家里"、"公司"、"街上"、"公园"'),
      peopleCount: z.number().optional().describe('一起的人数，0=独自一人'),
      budget: z.string().optional().describe('预算范围，如"免费"、"50元以内"'),
      energyLevel: z.string().optional().describe('体力/心情状态，如"精力充沛"、"有点累"、"想放松"、"想动一动"'),
      preferences: z.string().optional().describe('用户表达的偏好或禁忌，如"不想出门"、"想做有意思的事"、"不喜欢运动"'),
      companion: z.string().optional().describe('陪伴状态，如"一个人"、"和朋友"、"和家人"、"和伴侣"'),
      mood: z.string().optional().describe('情绪状态，如"有点无聊"、"心情不错"、"有点累"、"有点烦躁"'),
    }),
    execute: async (args) => {
      const patch: Partial<CollectedInfo> = {};
      if (args.freeTime !== undefined) patch.freeTime = args.freeTime;
      if (args.scene !== undefined) patch.scene = args.scene;
      if (args.peopleCount !== undefined) patch.peopleCount = args.peopleCount;
      if (args.budget !== undefined) patch.budget = args.budget;
      if (args.energyLevel !== undefined) patch.energyLevel = args.energyLevel;
      if (args.preferences !== undefined) patch.preferences = args.preferences;
      if (args.companion !== undefined) patch.companion = args.companion;
      if (args.mood !== undefined) patch.mood = args.mood;
      const updated = memory.updateCollectedInfo(patch);

      // 快启：S0 只要时长到手（不管是第一条就带着、还是刚答的），当轮直接推进出卡——
      // 一句承接 → request_state_change S1 → propose_activities，不再停下来问偏好。
      const inS0 = fsm.current === 'S0';
      const hasTime = !!updated.freeTime;
      let hint: string;
      if (inS0 && hasTime) {
        hint = [
          '空闲时长保存成功，工具该调就调（以后玩家每说一条新信息都要继续 save_user_info，不会自动保存）。注意玩家不需要知道保存动作——台词里绝不说"记下了/我记一下/先存一下"这类话。',
          '你仍在 S0，但这一轮不要停下来问任何问题、也不要反问：玩家已经给了时长，直接推进——先用一句话接住玩家刚说的内容（TA 说了场景/心情/偏好就自然带进，没说就点一个眼前画面或此刻的状态），同一句引向支线（"替你留了几条支线，看看哪一条合心意"），然后 request_state_change(target_state="S1")；切换成功后 S1 手册、素材库和设计规范会自动展开（不用 get_skill），同一轮里直接 propose_activities 出卡（卡片只填标题/悬念/类别/标签，不写步骤）。',
          '全轮文字就这一句承接的话，不说"开张/找了几件小事"这类话；不能一句话不说默默转场发卡（会被系统拒绝），也不要分两段。',
        ].join('\n');
      } else if (hasTime) {
        hint = TOOL_HINTS.save_user_info_hasFreeTime;
      } else {
        hint = TOOL_HINTS.save_user_info_continue;
      }

      return JSON.stringify({
        success: true,
        savedFields: Object.keys(patch),
        allCollectedInfo: updated,
        currentState: fsm.current,
        hint,
      });
    },
  });

  const requestStateChange = tool({
    name: 'request_state_change',
    description: TOOL_DESCRIPTIONS.request_state_change,
    parameters: z.object({
      target_state: z.enum(['S0', 'S1', 'S2', 'S3']).describe('目标状态：S0=收集信息，S1=推荐活动，S2=执行任务，S3=完成祝贺（终态）'),
      reason: z.string().describe('为什么要切换到这个状态，简短说明理由'),
    }),
    execute: async (args) => {
      // 最高权威：证物轮验收员已判 reject，则无论台词说没说"完成"都不许毕业
      if (args.target_state === 'S3' && memory.selected?.journey) {
        try { ctx.validateCompletion?.(memory.selected); }
        catch (err) { return JSON.stringify({ success: false, error: String(err), hint: '留在当前步骤，补交并验收证物后再完成。' }); }
      }
      if (
        args.target_state === 'S3' &&
        isContentProofTurn && isContentProofTurn() &&
        evidenceReview?.available && evidenceReview.verdict === 'reject'
      ) {
        return JSON.stringify({
          success: false,
          error: `验收员判定证物不通过（${evidenceReview.reason}），不能毕业。`,
          currentState: fsm.current,
          hint: `留在 S2，用你自己的话驳回并说明怎么补：${evidenceReview.whatNeeded || '对照完成标准重新提交最后一步证物'}。玩家补料合格后再申请 S3。`,
        });
      }
      // 毕业护栏：切到 S3 = 判定全部证物达标完成。必须有明确的"完成/达标/恭喜/收工"
      // 判定才允许；仅引用"下一步/最后一步"来布置任务、或在追问补交、或没下完成结论，
      // 一律不许毕业——堵"嘴上还在布置最后一步/让玩家重交，手上却切到 S3 庆祝"的矛盾。
      if (args.target_state === 'S3' && isGraduationReady && !isGraduationReady()) {
        return JSON.stringify({
          success: false,
          error: '你还没有明确宣布玩家把整条任务全部完成（达标/完成/恭喜收工），不能切换到 S3。',
          currentState: fsm.current,
          hint: '二选一：玩家确实把最后一步证物也交达标了，就先用一句话明确宣布完成（如"全部完成，恭喜""收工"），再 request_state_change(target_state="S3", reason="全部步骤完成")；若最后一步还没做或证物不达标（答非所问、数量不够、照片和任务对不上、还在布置最后一步），就留在 S2：该发最后一张卡就 publish_step，该驳回就用文字让玩家重交，绝不提前切 S3。',
        });
      }
      const result = await fsm.requestTransition(args.target_state as FSMState, args.reason);
      if (!result.success) {
        return JSON.stringify({
          success: false,
          error: result.error,
          currentState: fsm.current,
          allowedTransitions: result.allowedTransitions,
          hint: TOOL_HINTS.request_state_change_rejected,
        });
      }

      const from = result.previousState!;
      const to = result.newState!;
      let enterHint = '';
      if (from !== to) {
        const hint = await onStateChange?.(from, to, args.reason);
        if (hint) enterHint = hint;
      }

      return JSON.stringify({
        success: true,
        from,
        to,
        hint: TOOL_HINTS.request_state_change_success(to) + (enterHint ? `\n${enterHint}` : ''),
      });
    },
  });

  const proposeActivities = tool({
    name: 'propose_activities',
    description: TOOL_DESCRIPTIONS.propose_activities,
    parameters: z.object({
      activities: z.array(z.object({
        id: z.string().describe('活动唯一标识，用简短英文/数字如"act1"、"tea_break"'),
        title: z.string().describe('活动标题，简洁有趣，6字以内'),
        hook: z.string().describe('一句话悬念/吸引力描述，30字以内，落在具体东西上、讲清会遇上什么，但不剧透步骤'),
        category: z.enum(['explore', 'organize', 'create', 'connect', 'sense']).describe('这条支线属于哪一类，用于手账集印：explore=探索（走出去发现新东西）/ organize=整理（收拾归置、与物品相处）/ create=创造（动手做一个东西）/ connect=连接（和人、和记忆产生联系）/ sense=感官（调动听觉嗅觉味觉触觉）。一次提出的 2-4 个方案尽量分布在不同类别'),
        tags: z.array(z.string()).describe('2-3个标签，如"室内"、"放松"、"5分钟"、"创意"'),
      })).describe('活动卡片列表，2-4个差异化方案。只填卡片字段——不要带步骤：步骤等玩家选中后在 S2 用 design_activity_steps 设计，未选中的活动不需要步骤'),
    }),
    execute: async (args) => {
      if (fsm.current !== 'S1') {
        return JSON.stringify({
          success: false,
          error: `propose_activities 只能在 S1（推荐活动）阶段调用，当前在 ${fsm.current}。`,
          currentState: fsm.current,
          hint: fsm.current === 'S0'
            ? '先确认空闲时长已用 save_user_info 保存，再 request_state_change(target_state="S1")；切换成功后同一轮里重新调用 propose_activities。'
            : '先 request_state_change 切到 S1，再发活动卡片。',
        });
      }
      if (hasSpoken && !hasSpoken()) {
        return JSON.stringify({
          success: false,
          error: '你这一轮还没有对玩家说过任何话，不能默默发活动卡片。',
          currentState: fsm.current,
          hint: '玩家刚发了言（补充偏好/点跳过/换一批），先用一句话接住 TA 说的内容，同一句自然引向支线卡片（如"不想花钱？这几件都不花钱——支线任务来了，挑一个"），然后再重新调用 propose_activities。全轮就这一句，不要分两段、不要复述条件。',
        });
      }
      let activities: ActivityPlan[];
      try { activities = ctx.mixActivities?.(args.activities as ActivityPlan[]) ?? args.activities as ActivityPlan[]; }
      catch (err) { return JSON.stringify({ success: false, error: String(err), hint: '向玩家说明实际原因，不要假装已经出卡。' }); }
      memory.setProposedActivities(activities);
      emit({ type: 'activities_proposed', activities });
      return JSON.stringify({
        success: true,
        count: activities.length,
        titles: activities.map(a => a.title),
        hint: TOOL_HINTS.propose_activities_success,
      });
    },
  });

  const selectActivity = tool({
    name: 'select_activity',
    description: TOOL_DESCRIPTIONS.select_activity,
    parameters: z.object({
      activityId: z.string().describe('用户选择的活动 id'),
    }),
    execute: async (args) => {
      if (fsm.current !== 'S1') {
        return JSON.stringify({
          success: false,
          error: `select_activity 只能在 S1（推荐活动）阶段调用，当前在 ${fsm.current}。`,
          currentState: fsm.current,
          hint: '先 request_state_change 切到 S1，再确认用户选择的活动。',
        });
      }
      const act = memory.findActivity(args.activityId);
      if (!act) {
        const available = memory.proposedActivitiesList.map(a => ({ id: a.id, title: a.title }));
        return JSON.stringify({
          success: false,
          error: '活动不存在',
          availableActivities: available,
        });
      }
      try { ctx.claimActivity?.(act); }
      catch (err) { return JSON.stringify({ success: false, error: String(err) }); }
      memory.setSelectedActivity(act);
      return JSON.stringify({
        success: true,
        selectedTitle: act.title,
        hint: TOOL_HINTS.select_activity_success(act.title),
      });
    },
  });

  const designActivitySteps = tool({
    name: 'design_activity_steps',
    description: TOOL_DESCRIPTIONS.design_activity_steps,
    parameters: z.object({
      steps: z.array(z.object({
        instruction: z.string().describe('步骤指引，一句话、动词开头，讲清做什么和做多少（约35字以内），别只说"感受一下/随便看看"'),
        hint: z.string().optional().describe('小提示/鼓励语，至多一句'),
        submissionType: z.enum(['text', 'photo']).describe('这一步交什么证物：text=交文字证物（清单/答案/记录）；photo=交现场照片外加一句只有做了才答得出的图说答案。闭眼/深呼吸这类几秒钟内部动作不单独成步，写进相邻证据步的指引里作为铺垫。走到某处/打开/拿出东西这类有场景有物件的就位用 photo 拍现场照。每一步都必须交 text 或 photo 证物'),
        completionCriteria: z.string().describe('完成标准，必须可核对：写清点名要交的证物及其数量/形式/画面，如"列出5种声音、每种一个名词"。禁止"感受一下""随便看看"这类无法验收的话'),
        proofPrompt: z.string().describe('交证物提示，直接展示在卡片上、告诉玩家这一步要交出什么：text 步点名数量+形式（如"列出你听到的5种声音，每种一个词"）；photo 步=拍照+一个具体问题（如"拍整理后的抽屉，并回答：分成了几个区？"）。每步必填'),
        suggestedMinutes: z.number().int().min(1).max(10).optional().describe('这一步的建议节奏（整数分钟，1-10）。按动作估：写清单/命名/抄写等就地小事 2-3 分钟，要走动、拍照、动手做的 4-6 分钟。所有步加起来不得超过玩家空闲时长的 80%——系统会再做一次确定性校正，超了自动按比例压缩。这是宽松的建议节奏，不是考试限时，玩家超时也能照常提交。'),
      })).describe('为选中的支线设计的完整步骤，2-4步；每一步都必须是 text/photo 证据步（最后一步自然也是）；每步给 suggestedMinutes 建议节奏'),
    }),
    execute: async (args) => {
      if (fsm.current !== 'S2') {
        return JSON.stringify({
          success: false,
          error: `design_activity_steps 只能在 S2（执行任务）阶段调用，当前在 ${fsm.current}。`,
          currentState: fsm.current,
          hint: '先按流程 select_activity 确认活动并 request_state_change 切到 S2，再设计步骤。',
        });
      }
      const selected = memory.selected;
      if (!selected) {
        return JSON.stringify({ success: false, error: '没有选中的活动，无法设计步骤' });
      }
      const existingSteps = selected.steps || [];
      if (selected.journey && existingSteps.length) {
        const next = existingSteps.findIndex(s => !s.submittedEvidence);
        return JSON.stringify({ success: true, totalSteps: existingSteps.length, steps: existingSteps, hint: next < 0 ? '全部证物已保存，可以申请完成。' : `长程章节步骤已经定稿，不得替换；直接 publish_step(step_index=${next})，使用对应步骤原文。` });
      }
      if (existingSteps.length > 0) {
        const nextStepIndex = memory.stepIndex + 1;
        if (nextStepIndex >= existingSteps.length) {
          return JSON.stringify({
            success: false,
            error: `「${selected.title}」的步骤已经设计好了（共 ${existingSteps.length} 步），不要重复设计。玩家刚交的已是最后一步（第${memory.stepIndex}步）。`,
            totalSteps: existingSteps.length,
            currentStepIndex: memory.stepIndex,
            nextStepIndex: null,
            hint: '禁止再调 design_activity_steps。验收达标就改调 request_state_change(target_state="S3", reason="全部步骤完成")；证物不达标（照片和这一步要做的事对不上、或图说答案答非所问）就用文字驳回让玩家重交。',
          });
        }
        return JSON.stringify({
          success: false,
          error: `「${selected.title}」的步骤已经设计好了（共 ${existingSteps.length} 步），不要重复设计。玩家刚交的是第${memory.stepIndex}步的证物。`,
          totalSteps: existingSteps.length,
          currentStepIndex: memory.stepIndex,
          nextStepIndex,
          hint: `禁止再调 design_activity_steps。验收通过后直接 publish_step(step_index=${nextStepIndex}) 发下一步；证物不达标（照片和这一步要做的事对不上、或图说答案答非所问）就别发卡，用文字具体指出差在哪、让玩家重交。`,
        });
      }
      // 剥离仅用于入参的 suggestedMinutes，再按玩家空闲时长做确定性校正，
      // 写回每步的 suggestedSeconds
      const drafts = args.steps.map(s => ({ submissionType: s.submissionType, suggestedMinutes: s.suggestedMinutes }));
      // completionCriteria 强制等于展示在卡片上的 proofPrompt：验收标准必须恒等于玩家看到的要求，
      // 杜绝模型把两者写成两套（玩家按卡片完成却被按更高的内部标准驳回）。
      const planned = args.steps.map(({ suggestedMinutes: _suggestedMinutes, proofPrompt, ...rest }) => ({
        ...rest,
        proofPrompt,
        completionCriteria: proofPrompt,
      }));
      const steps = reconcileStepDurations(planned, drafts, memory.collected.freeTime);
      memory.attachStepsToSelected(steps);
      return JSON.stringify({
        success: true,
        activityTitle: selected.title,
        totalSteps: steps.length,
        hint: TOOL_HINTS.design_activity_steps_success(steps.length),
      });
    },
  });

  const publishStep = tool({
    name: 'publish_step',
    description: TOOL_DESCRIPTIONS.publish_step,
    parameters: z.object({
      step_index: z.number().describe('步骤序号，从0开始（第一个步骤为0，第二个为1，以此类推）'),
      instruction: z.string().describe('这一步要做什么的具体指引'),
      hint: z.string().optional().describe('温馨小提示'),
      submission_type: z.enum(['text', 'photo']).describe('这一步交什么证物：text=交文字证物；photo=交现场照片+一句图说答案。每一步都是 text 或 photo'),
      proof_prompt: z.string().describe('交证物提示，展示在卡片上告诉玩家这一步交出什么证据，须与 design_activity_steps 时该步的 proofPrompt 一致：text 点名数量+形式，photo=拍照+一个只有做了才答得出的具体问题。每步必填'),
    }),
    execute: async (args) => {
      if (fsm.current !== 'S2') {
        return JSON.stringify({
          success: false,
          error: `publish_step 只能在 S2（执行任务）阶段调用，当前在 ${fsm.current}。`,
          currentState: fsm.current,
          hint: fsm.current === 'S1'
            ? '玩家选定活动后的完整顺序：先 select_activity(activityId=玩家所选活动 id) 确认，再 request_state_change(target_state="S2")，切换成功后同一轮里先 design_activity_steps 设计步骤、再 publish_step(step_index=0)。不要在聊天文字里描述步骤。'
            : '先完成前置阶段（select_activity 确认活动 → request_state_change 切到 S2），再发步骤卡片。',
        });
      }
      const selected = memory.selected;
      if (!selected) {
        return JSON.stringify({ success: false, error: '没有选中的活动，无法发布步骤' });
      }
      const plannedSteps = selected.steps || [];
      if (plannedSteps.length === 0) {
        return JSON.stringify({
          success: false,
          error: `「${selected.title}」还没有设计步骤——S1 的活动卡片不带步骤，进入 S2 后要先为选中的这一条支线设计步骤。`,
          currentState: fsm.current,
          hint: '立即调用 design_activity_steps(steps=[...]) 按活动设计规范设计 2-4 步（最后一步必须是 text/photo 证据步），成功后再 publish_step(step_index=0) 发第一步卡片。',
        });
      }
      if (hasSpoken && !hasSpoken()) {
        return JSON.stringify({
          success: false,
          error: '你这一轮还没有对玩家说过任何话，不能默默发步骤卡片。',
          currentState: fsm.current,
          hint: '玩家刚发了言（选定活动/提交了证物），先用一句话回应：刚选定活动就说一句接任务、出发的话（不描述步骤内容）；刚交证物就先给肯定或点评（如"过。下一步——"），然后再重新调用 publish_step。',
        });
      }
      // 验收门控（仅 text/photo 证物轮）：发下一步卡 = 判定当前证物达标、推进流程。
      // 权威依据是独立验收员的结构化 verdict：
      //  - reject → 硬拦截，无论台词说什么都发不出卡；
      //  - pass   → 放行（温度门 hasSpoken 已在上方检查）；
      //  - 验收服务不可用 → 降级为台词门：只有台词明确给了"通过/达标/完成"信号才放行，
      //    含糊（追问补交、让重拍重答、没下结论）一律拦下，绝不默认放行。
      if (isContentProofTurn && isContentProofTurn()) {
        const review = evidenceReview;
        if (review?.available && review.verdict === 'reject') {
          return JSON.stringify({
            success: false,
            error: `验收员已判定这一步证物不通过（${review.reason}），不能发下一步卡片。`,
            currentState: fsm.current,
            hint: `不要发卡、也不要换说法强行通过。按验收意见用你自己的话驳回，先肯定做到的部分，再点出差的那一点，明确告诉玩家怎么补：${review.whatNeeded || '对照这一步的完成标准重新提交证物'}。玩家补料合格后才会放行下一步。`,
          });
        }
        if (!review?.available && classifyTurnVoice && classifyTurnVoice() !== 'accepted') {
          return JSON.stringify({
            success: false,
            error: '玩家这轮交了证物，但验收服务暂时不可用，且你还没有明确判定这一步通过，不能发下一步卡片。',
            currentState: fsm.current,
            hint: '二选一：证物确实达标，就先用一句话明确给通过（如"过""达标""可以，下一步"），再重新 publish_step 发下一步卡；证物不达标（照片和任务对不上、图说答案答非所问/没回答卡片上的问题、数量不够），就不要发卡，用文字具体指出差在哪、让玩家重拍或重答。注意：要求玩家"补交/重拍/回答这一步的问题"都属于驳回，驳回时绝对不能发卡。',
          });
        }
      }
      const nextStepIndex = memory.stepIndex + 1;
      if (args.step_index < 0 || args.step_index >= plannedSteps.length) {
        // 越界：返回权威进度，模型可在同一轮 Agent Loop 里据 nextStepIndex 自愈重发
        if (nextStepIndex >= plannedSteps.length) {
          return JSON.stringify({
            success: false,
            error: `步骤序号越界：该活动共${plannedSteps.length}步（序号0-${plannedSteps.length - 1}），你传的是${args.step_index}。玩家刚交的已是最后一步（第${memory.stepIndex}步）。`,
            totalSteps: plannedSteps.length,
            currentStepIndex: memory.stepIndex,
            nextStepIndex: null,
            hint: '全部步骤已完成，禁止再 publish_step。验收达标就改调 request_state_change(target_state="S3", reason="全部步骤完成") 触发祝贺；证物不达标（照片和这一步要做的事对不上、或图说答案答非所问）就用文字具体指出差在哪、让玩家重交，不要放行。',
          });
        }
        return JSON.stringify({
          success: false,
          error: `步骤序号越界：该活动共${plannedSteps.length}步（序号0-${plannedSteps.length - 1}），你传的是${args.step_index}。玩家刚交的是第${memory.stepIndex}步的证物。`,
          totalSteps: plannedSteps.length,
          currentStepIndex: memory.stepIndex,
          nextStepIndex,
          hint: `验收通过后直接 publish_step(step_index=${nextStepIndex}) 发下一步，不要再调 design_activity_steps（步骤早已设计好）；证物不达标（照片和这一步要做的事对不上、或图说答案答非所问）就别发卡，用文字具体指出差在哪、让玩家重交。`,
        });
      }
      if (selected.journey) {
        const firstMissing = plannedSteps.findIndex(s => !s.submittedEvidence);
        if (args.step_index !== firstMissing) return JSON.stringify({ success: false, error: '长程章节需要依次完成已定稿的证物步骤', nextStepIndex: firstMissing });
        const canonical = plannedSteps[args.step_index];
        args.instruction = canonical.instruction;
        args.hint = canonical.hint;
        args.submission_type = canonical.submissionType;
        args.proof_prompt = canonical.proofPrompt!;
      }
      memory.setStepIndex(args.step_index);
      emit({
        type: 'step_published',
        step: {
          journey: selected.journey,
          index: args.step_index,
          instruction: args.instruction,
          hint: args.hint,
          submissionType: args.submission_type,
          submissionPrompt: SUBMISSION_PROMPTS[args.submission_type],
          proofPrompt: args.proof_prompt,
          // 建议节奏以 design_activity_steps 校正后存下的为准，不采信 publish 入参，防止模型两传不一致
          suggestedSeconds: plannedSteps[args.step_index]?.suggestedSeconds ?? 0,
        },
        total: plannedSteps.length,
        activityTitle: selected.title,
      });
      return JSON.stringify({
        success: true,
        stepIndex: args.step_index,
        totalSteps: plannedSteps.length,
        isLastStep: args.step_index === plannedSteps.length - 1,
        hint: TOOL_HINTS.publish_step_success,
      });
    },
  });

  const getSkill = tool({
    name: 'get_skill',
    description: TOOL_DESCRIPTIONS.get_skill,
    parameters: z.object({
      skill_id: z.string().describe('要加载的技能 id，如 "activity-creative-design"（活动设计规范）或 "playbook-s0"/"playbook-s1"/"playbook-s2"/"playbook-s3"（各阶段行动手册）。传空字符串可查看所有可用技能列表。'),
    }),
    execute: async (args) => {
      if (!args.skill_id) {
        const skills = listAvailableSkills();
        return JSON.stringify({
          success: true,
          available_skills: skills.map(s => ({ id: s.id, name: s.name, description: s.description })),
        });
      }
      // 跳阶段取手册白烧一轮往返：S2 手册在切换成功后随 request_state_change 结果自动展开
      if (fsm.current === 'S1' && args.skill_id === 'playbook-s2') {
        return JSON.stringify({
          success: false,
          error: 'playbook-s2 会在进入 S2 后随 request_state_change 的结果自动展开，S1 阶段无需提前加载。',
          currentState: fsm.current,
          hint: '玩家已选定活动：先 select_activity(activityId) 确认，紧接着 request_state_change(target_state="S2")——切换成功后手册会自动展开在工具结果里，同一轮直接 design_activity_steps 再 publish_step 发第一步，不要再调 get_skill。',
        });
      }
      const body = loadFullSkillBody(args.skill_id);
      if (!body) {
        const skills = listAvailableSkills();
        return JSON.stringify({
          success: false,
          error: `技能 "${args.skill_id}" 不存在`,
          available_skills: skills.map(s => s.id),
        });
      }
      emit({ type: 'skill_loaded', skillId: args.skill_id });
      return JSON.stringify({ success: true, skill_id: args.skill_id, content: body });
    },
  });

  const getCurrentEnvTool = tool({
    name: 'get_current_env',
    description: TOOL_DESCRIPTIONS.get_current_env,
    parameters: z.object({}),
    execute: async () => {
      const env = getCurrentEnv ? getCurrentEnv() : null;
      if (!env) {
        return JSON.stringify({
          success: false,
          error: '玩家尚未授权定位（或定位/天气服务暂时不可用），当前没有环境信息。',
          hint: '不要追问玩家在哪里、也不要假装知道天气；像平时一样凭玩家说出口的信息构思支线即可。',
        });
      }
      return JSON.stringify({
        success: true,
        location: {
          province: env.province ?? null,
          city: env.city ?? null,
          district: env.district ?? null,
          lat: Number(env.lat.toFixed(2)),
          lon: Number(env.lon.toFixed(2)),
        },
        weather: env.weather ?? null,
        observedAt: env.observedAt ?? null,
        hint: '这是玩家此刻的真实环境：构思推荐时把天气/位置当现实约束（下雨高温优先室内、晴好再推户外），但绝不能像天气预报一样逐字播报，要自然融进对话里。',
      });
    },
  });

  const getCurrentTimeTool = tool({
    name: 'get_current_time',
    description: TOOL_DESCRIPTIONS.get_current_time,
    parameters: z.object({}),
    execute: async () => {
      const t = getCurrentTime();
      return JSON.stringify({
        success: true,
        iso: t.iso,
        date: t.date,
        weekday: t.weekday,
        time: t.time,
        period: t.period,
        isWeekend: t.isWeekend,
        hint: `现在是${t.date} ${t.weekday} ${t.time}（${t.period}，${t.isWeekend ? '周末' : '工作日'}）。把时段/作息当现实约束安排支线（深夜不推外出、饭点别安排太久、工作日玩碎片、晚上和周末铺长任务）；玩家没问时间就别主动报时。`,
      });
    },
  });

  tools.push(saveUserInfo, requestStateChange, proposeActivities, selectActivity, designActivitySteps, publishStep, getSkill, getCurrentEnvTool, getCurrentTimeTool);
  return tools;
}
