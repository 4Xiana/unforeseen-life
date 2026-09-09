import type { StateConfig } from './types.js';

export const s3Config: StateConfig = {
  id: 'S3',

  onEnter: ({ memory, emit }) => {
    const selected = memory.selected;
    if (selected) {
      emit({ type: 'task_completed', activityTitle: selected.title });
      return {
        injectedInstruction: `已进入 S3，活动「${selected.title}」全部步骤完成，完成动画已触发。先调用 get_skill(skill_id="playbook-s3") 取本阶段行动手册，然后纯文本完成祝贺：真诚温暖、两三句点出这次体验的收获，自然问一句要不要再来一个。祝贺轮不要再调用任何工具；之后玩家若明确想再来一局或重新设定，再按手册调 request_state_change 切换状态。`,
      };
    }
    return;
  },

  onUserInput: (input) => {
    if (input.kind === 'abandon') {
      return { injectedMessage: '我先不玩了，下次再来。' };
    }
    return;
  },
};
