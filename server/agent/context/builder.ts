import type { WorkingMemory } from '../memory/working-memory.js';
import type { ContextLayers } from '../flows/types.js';
import { CORE_INSTRUCTIONS, COLLECTED_INFO_LABELS } from '../prompts/index.js';
import { renderTimeBrief } from '../env/time-service.js';

/**
 * Context 分层装载结果（对应 OpenAI Agents SDK 的 context engineering 模式）：
 * - core：静态核心，身份/运行方式/输出规范/阶段推进通用规则/安全（跨轮不变）
 * - snapshot：运行时快照，用户画像/候选活动/执行进度（每轮从 memory 渲染、按状态裁剪）
 * 阶段行动手册（playbook-sN，含各阶段流程与语言风格）和专业技能都是技能文档，
 * 不内置在 system prompt 中——Agent 统一通过 get_skill 工具按需加载（见 skills/ 目录）。
 * 对话历史不属于 system prompt——通过 SDK 原生消息数组（runner.run 的 input）传递。
 */
export interface AssembledContext {
  full: string;
  layers: ContextLayers;
}

export function assembleContext(memory: WorkingMemory, handbookBrief?: string, envBrief?: string | null): AssembledContext {
  const snapshot = buildRuntimeSnapshot(memory, handbookBrief, envBrief);

  const full = [CORE_INSTRUCTIONS, '', snapshot]
    .filter(Boolean)
    .join('\n');

  return {
    full,
    layers: {
      core: { name: 'core 静态核心指令', chars: CORE_INSTRUCTIONS.length },
      snapshot: { name: 'snapshot 运行时快照', chars: snapshot.length },
    },
  };
}

function buildRuntimeSnapshot(memory: WorkingMemory, handbookBrief?: string, envBrief?: string | null): string {
  const snap = memory.snapshot();
  const lines: string[] = ['# 运行时上下文'];

  const STATE_LABELS: Record<string, string> = {
    S0: '收集信息',
    S1: '推荐活动',
    S2: '执行任务',
    S3: '完成祝贺',
  };
  lines.push(`当前阶段：${snap.fsmState}（${STATE_LABELS[snap.fsmState] || ''}）。本阶段的行动手册（目标、流程、分支处理、语言风格）不内置在指令中——需要时调用 get_skill(skill_id="playbook-${snap.fsmState.toLowerCase()}") 获取并严格按其行动。`);

  // 当前时间（系统时钟，每轮重组装时实时渲染、无需授权）：让推荐天然感知时段/作息
  lines.push('');
  lines.push(renderTimeBrief());

  // 玩家此刻的环境（定位 + 天气，每轮随定位刷新）：默认注入，让推荐天然知道"在哪儿、什么天"
  if (envBrief) {
    lines.push('');
    lines.push(envBrief);
  }

  // 玩家的支线手账（跨会话记忆）：让小闲记得 TA 做过什么、集了多少、离哪个成就最近
  if (handbookBrief) {
    lines.push('');
    lines.push('# 玩家的支线手账（你替 TA 攒着的小册子，跨次记得）');
    lines.push(handbookBrief);
  }

  const infoKeys = Object.keys(snap.collectedInfo) as (keyof typeof snap.collectedInfo)[];
  const infoLines = infoKeys
    .filter((k) => snap.collectedInfo[k] !== undefined && snap.collectedInfo[k] !== '')
    .map((k) => `  - ${COLLECTED_INFO_LABELS[k] || k}：${snap.collectedInfo[k]}`);
  lines.push('用户画像（已收集信息）：');
  lines.push(infoLines.length > 0 ? infoLines.join('\n') : '  - 暂未收集到任何信息');

  if (snap.fsmState === 'S1' || snap.fsmState === 'S2') {
    if (snap.proposedActivities.length > 0) {
      lines.push(`候选活动：${snap.proposedActivities.length} 个`);
      for (const a of snap.proposedActivities) {
        lines.push(`  - id=${a.id} | ${a.title} | ${a.hook} | ${(a.steps || []).length}步 | 标签:${a.tags.join(',')}`);
      }
    } else {
      lines.push('候选活动：暂无');
    }
  }

  if (snap.fsmState === 'S2') {
    if (snap.selectedActivity) {
      const selectedSteps = snap.selectedActivity.steps || [];
      lines.push(`当前选中活动：${snap.selectedActivity.title}（共 ${selectedSteps.length} 步）`);
      lines.push(`当前进度：第 ${snap.currentStepIndex + 1} 步 / 共 ${selectedSteps.length} 步`);
      const currentStep = selectedSteps[snap.currentStepIndex];
      if (currentStep) {
        lines.push(`当前步骤指引：${currentStep.instruction}`);
        lines.push(`完成条件：${currentStep.completionCriteria}`);
      }
    } else {
      lines.push('当前选中活动：无');
    }
  }

  if (snap.fsmState === 'S3' && snap.selectedActivity) {
    lines.push(`已完成活动：${snap.selectedActivity.title}（共 ${(snap.selectedActivity.steps || []).length} 步，全部完成）`);
  }

  return lines.join('\n');
}
