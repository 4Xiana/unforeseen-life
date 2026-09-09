import type { StateConfig } from './types.js';
import {
  buildS1SelectActivityMessage,
  S1_ABANDON_MESSAGE,
} from '../prompts/index.js';
import { loadFullSkillBody } from '../skills/loader.js';

/**
 * S1 入场需要的手册：行动手册 + 素材库 + 设计规范。
 * 服务端直接随转场工具结果一次性展开（预载），省掉模型连续 3 次 get_skill 的往返等待；
 * 内容与 get_skill 返回完全一致，不额外增加模型上下文负担。
 */
const S1_PRELOAD_SKILLS = [
  { id: 'playbook-s1', label: 'S1 行动手册 · 推荐活动' },
  { id: 'quest-library', label: '支线任务素材库' },
  { id: 'activity-creative-design', label: '活动创意设计规范' },
] as const;

export const s1Config: StateConfig = {
  id: 'S1',

  onEnter: ({ memory, emit, hasSpoken }) => {
    if (memory.proposedActivitiesList.length === 0) {
      const info = memory.collected;
      const constraints = [
        `空闲时长：${info.freeTime || '未知'}`,
        info.scene ? `场景：${info.scene}` : '',
        info.energyLevel ? `状态：${info.energyLevel}` : '',
      ].filter(Boolean).join('，');
      const spoken = hasSpoken();
      const speechRule = spoken
        ? '你这轮已经说过承接的话了——禁止再输出任何文字（重复第二句是错误），直接完成工具动作。'
        : 'propose_activities 之前必须先说一句承接的话——先接住玩家上一轮说的内容（补充的偏好/点跳过），开口可以先点一个眼前的画面或玩家此刻的状态（从玩家说的话、所在场景里捡，不编造天气地点），再像把任务板转过来给玩家看：候选说成"几条支线/任务板上新挂了几条"，例如"刚到家？——板上新挂了几条，挑一条顺眼的？"。禁止"开张""上架""安排活儿"这类和支线任务不搭的词，也不说"找了几件小事"这种平淡话；全轮就这一句，铺完画面立刻摆卡、不连着抒情，不复述玩家条件、不分两段，构思阶段不要说话。铺垫的画面只能是场景本身（光线、天气、街道、工位、手边物），卡片里的玩法和物件（如"拍招牌、猜路口、翻抽屉"）绝不在这句提前出现——卡上写什么由卡片自己讲。';

      // 预载手册：同步读盘（有内存缓存），直接拼进转场工具结果，并补发 skill_loaded 事件保持与 get_skill 通道一致
      // loadFullSkillBody 与 get_skill 走同一入口（素材库的结构化种子目录在其中自动追加），两通道同源
      const loaded = S1_PRELOAD_SKILLS
        .map((s) => {
          const body = loadFullSkillBody(s.id);
          if (!body) return '';
          emit({ type: 'skill_loaded', skillId: s.id });
          return `### 已展开：${s.label}（${s.id}）\n\n${body}`;
        })
        .filter(Boolean)
        .join('\n\n---\n\n');

      return {
        injectedInstruction: [
          `已进入 S1 推荐阶段。用户条件：${constraints}。`,
          '行动手册、素材库和设计规范已在下方一次性展开——禁止再调用 get_skill 重复加载它们（只会白白多等几轮），直接严格照做。',
          '立即按序行动：1) 对照玩家档案、借素材库种子构思 2-4 个差异化活动；2) 活动只填卡片字段（id/title/hook/category/tags）——不要写步骤，步骤等玩家选中后在 S2 用 design_activity_steps 设计，未选中的活动不需要步骤，构思完成立即提交；3) ' + speechRule + ' 4) propose_activities 提交卡片。不要只说话不调工具。',
          loaded,
        ].join('\n\n'),
      };
    }
    return;
  },

  onUserInput: (input, { memory }) => {
    if (input.kind === 'select_activity' && input.activityId) {
      const activity = memory.findActivity(input.activityId);
      const title = activity?.title || input.activityId;
      return { injectedMessage: buildS1SelectActivityMessage(title) };
    }
    if (input.kind === 'abandon') {
      return { injectedMessage: S1_ABANDON_MESSAGE };
    }
    return;
  },
};
