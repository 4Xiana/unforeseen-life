import type { StateConfig } from './types.js';
import {
  buildS2SubmitTextMessage,
  buildS2SubmitPhotoMessage,
  buildStepPaceNote,
  S2_ABANDON_MESSAGE,
  S2_SWITCH_ACTIVITY_MESSAGE,
} from '../prompts/index.js';
import { loadSkillBody } from '../skills/loader.js';

/**
 * S2 入场预载：行动手册 + 活动设计规范（步骤由 design_activity_steps 在此阶段设计，
 * 设计规范是必需的）。同样为省掉连续 get_skill 往返。
 */
const S2_PRELOAD_SKILLS = [
  { id: 'playbook-s2', label: 'S2 行动手册 · 执行任务' },
  { id: 'activity-creative-design', label: '活动创意设计规范' },
] as const;

export const s2Config: StateConfig = {
  id: 'S2',

  onEnter: ({ memory, emit, hasSpoken }) => {
    const selected = memory.selected;
    if (!selected) return;

    const speechRule = hasSpoken()
      ? '你这轮已经说过开场的话了——禁止再输出任何文字（重复第二句是错误），直接调工具发卡片。'
      : '必须先说一句接任务、出发的话（玩家刚选定活动，不能默默发步骤卡）。这句只负责"接了、出发"的气氛，可以卖小关子（如"这条归你了——第一步简单到你会笑，走"）；但严禁提前透露任何步骤内容——连概括、连暗示都不行：不说第一步做什么，也不漏玩法动作和玩法词（"抓颜色/找颜色/拍照/闭眼/听声音/数几种/拍招牌/猜路口/翻抽屉"这类具体玩法一个字不提，颜色、声音、照片、招牌、抽屉等卡片上的物件名和玩法名也不出现在这句里——这句只讲"接了、出发"的气氛和玩家本人，不讲这条支线是玩什么的，卡片自己会讲），同时不复述活动标题或悬念（卡片上写过的不重复念），更不许把步骤的 instruction、提示、交证物要求写进聊天文字；步骤卡片是唯一载体，把卡片内容念成文字是严重错误。台词里也不出现动词开头的指令句和物件罗列（不说"先把桌上的小物件拢一拢""便签、笔、耳机都先找出来"这种祈使句和顿号清单——那是步骤卡的写法，不是聊天话）。聊天文字里也不许出现链接、图片、markdown 符号。';

    const loaded = S2_PRELOAD_SKILLS
      .map((s) => {
        const body = loadSkillBody(s.id);
        if (body) emit({ type: 'skill_loaded', skillId: s.id });
        return body ? `### 已展开：${s.label}（${s.id}）\n\n${body}` : '';
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    return {
      injectedInstruction: [
        `已进入 S2 执行阶段，选中支线「${selected.title}」。${selected.hook}`,
        '行动手册和活动设计规范已在下方一次性展开——禁止再调用 get_skill 重复加载它们，直接严格照做。',
        `立即按序行动：1) 按设计规范为这一条支线 design_activity_steps 设计 2-4 个步骤（每一步都必须是 text/photo 证据步；这是静默内部动作，台词里不提）；2) ${speechRule}再 publish_step(step_index=0) 发出第一步卡片。必须实际调工具，不能只说话就结束回合。`,
        loaded,
      ].join('\n\n'),
    };
  },

  onUserInput: (input, helpers) => {
    // 玩家提交的是"当前步"（publish_step 已把 stepIndex 指到该步）：取它的建议节奏
    const paceNote = (() => {
      const steps = helpers.memory.selected?.steps;
      const suggested = steps?.[helpers.memory.stepIndex]?.suggestedSeconds;
      return buildStepPaceNote(input.elapsedSeconds, suggested);
    })();
    if (input.kind === 'submit_text') {
      return { injectedMessage: buildS2SubmitTextMessage(input.text || '', paceNote) };
    }
    if (input.kind === 'submit_photo') {
      return { injectedMessage: buildS2SubmitPhotoMessage(input.description || '我上传了照片', paceNote) };
    }
    if (input.kind === 'abandon') {
      return { injectedMessage: S2_ABANDON_MESSAGE };
    }
    if (input.kind === 'select_activity') {
      return { injectedMessage: S2_SWITCH_ACTIVITY_MESSAGE };
    }
    return;
  },
};
