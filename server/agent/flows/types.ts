import type { FSMState } from '../memory/types.js';
import type { WorkingMemory } from '../memory/working-memory.js';
import type { EmitEvent } from '../llm/runner-provider.js';
import type { AtomTool } from '../tools/atom-tools.js';

export interface StructuredInput {
  kind: 'text' | 'select_activity' | 'submit_check' | 'submit_text' | 'submit_photo' | 'abandon';
  text?: string;
  activityId?: string;
  description?: string;
  /** 玩家提交的现场照片（data URL），仅 submit_photo 轮携带；只附加在当轮用户消息上，不进文字历史 */
  imageDataUrl?: string;
  /** 玩家本轮定位坐标（浏览器 Geolocation），用于解析城市/天气并默认注入上下文；未授权定位时缺省 */
  geo?: { lat: number; lon: number; accuracy?: number };
}

export interface UserInputPreprocessResult {
  /**
   * 把本次 UI 交互包装成的自然语言描述，会替换喂给 LLM 的 userMessage。
   * 仅用于"陈述用户做了什么"，不得包含指令、决策或 memory 写入。
   */
  injectedMessage?: string;
}

export interface StateConfig {
  id: FSMState;
  /**
   * 输入预处理钩子：仅负责把 UI 点击等结构化交互"包装"成自然语言陈述。
   * 约束：不得做信息提取、不得写 memory、不得做决策（切状态/发指令）。
   */
  onUserInput?: (
    input: StructuredInput,
    helpers: {
      memory: WorkingMemory;
      emit: EmitEvent;
    }
  ) => UserInputPreprocessResult | void | Promise<UserInputPreprocessResult | void>;
  /**
   * 状态进入钩子：在 request_state_change 成功切换（from !== to）后触发。
   * 可派发事件（如 task_completed），返回的 injectedInstruction 会作为
   * "下一步即时提示"追加到 request_state_change 的工具结果里，引导模型继续。
   */
  onEnter?: (helpers: {
    memory: WorkingMemory;
    emit: EmitEvent;
    reason?: string;
    /** 本轮模型是否已经对玩家说过话（用于避免"入场注入要求说话"与已说的承接句重复） */
    hasSpoken: () => boolean;
  }) => { injectedInstruction?: string } | void | Promise<{ injectedInstruction?: string } | void>;
}

/**
 * 喂给模型的多模态内容片段（Responses 风格 part，SDK 在 chat completions 模式下会转成 image_url）。
 * input_image.image 支持 data URL 或公网 URL。
 */
export type ChatContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image: string };

export interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string | ChatContentPart[];
}

/** system prompt 的分层装载信息（用于 trace 观测按需装载） */
export interface ContextLayerInfo {
  name: string;
  chars: number;
}

export interface ContextLayers {
  core: ContextLayerInfo;
  snapshot: ContextLayerInfo;
}

export interface LLMInvokeParams {
  /** 本轮用户消息（仅用于 trace 记录；模型输入以 inputItems 为准） */
  userMessage: string;
  /** SDK 原生对话输入：历史消息 + 本轮用户消息 */
  inputItems: ChatMessageItem[];
  instructions: string;
  /** instructions 的分层装载信息（仅用于 trace 观测） */
  contextLayers?: ContextLayers;
  tools: AtomTool[];
  maxTurns?: number;
  /** 调用标签，用于看板区分（'main' 或护栏续跑 'guard-nudge-N'） */
  label?: string;
  streamTextCallback?: (text: string) => void;
  toolCallCallback?: (toolName: string) => void;
  steppingCallback?: (text: string) => void;
  thinkingCallback?: (phase: 'start' | 'end') => void;
}

export interface LLMInvokeResult {
  /** 经过清洗的、真正展示给用户的可见文本 */
  visibleOutput: string;
  success: boolean;
  errorMessage?: string;
  toolCalls: string[];
}
