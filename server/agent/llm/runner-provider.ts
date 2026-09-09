import { OpenAI } from 'openai';
import { randomUUID } from 'crypto';
import type { Tool, AgentInputItem } from '@openai/agents';
import { Agent, Runner } from '@openai/agents';
import { OpenAIProvider } from '@openai/agents-openai';
import type { AtomTool } from '../tools/atom-tools.js';
import type { LLMInvokeParams, LLMInvokeResult, ChatContentPart } from '../flows/types.js';
import type { SessionTracer } from '../tracer/tracer.js';
import { TOOL_STEPPING_TEXT } from '../prompts/index.js';

export type EmitEvent = (event: Record<string, unknown>) => void;

const STOP_AFTER_TOOLS = ['propose_activities', 'publish_step'];

/** 多模态 content 压成纯文本：图片 part 用占位符代替（用于 trace/日志，不参与模型输入） */
function contentToText(content: string | ChatContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.map((p) => (p.type === 'input_text' ? p.text : '[现场照片]')).join(' ');
}

function contentChars(content: string | ChatContentPart[]): number {
  if (typeof content === 'string') return content.length;
  return content.reduce((n, p) => n + (p.type === 'input_text' ? p.text.length : 0), 0);
}

function getEnv() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  const modelName = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const useChatCompletions = process.env.OPENAI_USE_CHAT_COMPLETIONS === 'true' || !!baseURL;
  return { apiKey, baseURL, modelName, useChatCompletions };
}

function ms(start: number): string {
  return `${(Date.now() - start).toFixed(0)}ms`;
}

export class LLMRunnerProvider {
  private runner: Runner;
  private useChatCompletions: boolean;
  private baseURL?: string;
  private tracer: SessionTracer | null;

  constructor(tracer?: SessionTracer) {
    const { apiKey, baseURL, modelName, useChatCompletions } = getEnv();
    this.baseURL = baseURL;
    this.useChatCompletions = useChatCompletions;
    this.tracer = tracer ?? null;
    if (baseURL) {
      const client = new OpenAI({ apiKey, baseURL });
      const provider = new OpenAIProvider({
        useResponses: false,
        openAIClient: client,
      });
      this.runner = new Runner({ modelProvider: provider, model: modelName });
    } else {
      this.runner = new Runner({ model: modelName });
    }
  }

  async invoke(params: LLMInvokeParams, tracer?: SessionTracer | null): Promise<LLMInvokeResult> {
    const activeTracer = tracer ?? this.tracer;
    const t0 = Date.now();

    const instructions = params.instructions;
    const tools = params.tools as Tool[];
    const toolCallsList: string[] = [];
    const callId = randomUUID();
    const label = params.label || 'main';

    const agent = new Agent({
      name: '小闲',
      instructions,
      tools,
      toolUseBehavior: { stopAtToolNames: STOP_AFTER_TOOLS },
    });

    const sdkInput = params.inputItems.map((m) =>
      m.role === 'assistant'
        ? { role: 'assistant' as const, content: m.content, status: 'completed' as const }
        : { role: 'user' as const, content: m.content }
    );
    const maxTurns = params.maxTurns ?? 10;
    const toolNames = tools.map(t => (t as { name?: string }).name || '?').join(',') || 'none';

    // trace 用消息快照：role + content（长内容截断，避免 trace 内存膨胀）；图片 part 压成占位符
    const TRACE_MSG_LIMIT = 2000;
    const traceMessages = params.inputItems.map((m) => {
      const content = contentToText(m.content);
      return content.length > TRACE_MSG_LIMIT
        ? { role: m.role, chars: content.length, truncated: true, content: content.slice(0, TRACE_MSG_LIMIT) + `…[截断 ${content.length - TRACE_MSG_LIMIT} 字]` }
        : { role: m.role, chars: content.length, content };
    });
    const messagesChars = params.inputItems.reduce((sum, m) => sum + contentChars(m.content), 0);
    const layerSummary = params.contextLayers
      ? Object.values(params.contextLayers).map(l => `${l.name.split(' ')[0]}=${l.chars}`).join(' ')
      : '-';
    console.log(`[LLM] invoke start | label=${label} | tools=${toolNames} | stopAfter=${STOP_AFTER_TOOLS.join(',')} | maxTurns=${maxTurns} | messages=${sdkInput.length}(${messagesChars}字) | instrLen=${instructions.length} | layers[${layerSummary}]`);

    activeTracer?.log('llm_call_start', {
      callId,
      label,
      maxTurns,
      toolNames: tools.map(t => (t as { name?: string }).name || '?'),
      stopAtToolNames: STOP_AFTER_TOOLS,
      messageCount: sdkInput.length,
      messagesChars,
      messages: traceMessages,
      contextLayers: params.contextLayers ?? null,
      instructionsLen: instructions.length,
      userMessage: params.userMessage,
      instructions,
    });

    const sanitizeText = (text: string): string => {
      let cleaned = text;
      cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
      cleaned = cleaned.replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/g, '');
      cleaned = cleaned.replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, '');
      cleaned = cleaned.replace(/\]<\]minimax\[>\[/g, '');
      cleaned = cleaned.replace(/\]<\]minimax\?>/g, '');
      cleaned = cleaned.replace(/\[\[minimax\]\]/g, '');
      return cleaned;
    };

    const safeTextCallback = params.streamTextCallback
      ? (text: string) => {
          const cleaned = sanitizeText(text);
          if (cleaned) params.streamTextCallback!(cleaned);
        }
      : undefined;

    const toolCallCallback = params.toolCallCallback;
    const steppingCallback = params.steppingCallback;
    const thinkingCallback = params.thinkingCallback;

    try {
      thinkingCallback?.('start');
      const tBeforeRun = Date.now();
      const stream = await this.runner.run(agent, sdkInput as unknown as AgentInputItem[], {
        stream: true,
        maxTurns,
      });
      console.log(`[LLM] stream created after ${ms(t0)} (SDK setup ${ms(tBeforeRun)})`);

      let currentText = '';
      let inThinkBlock = false;
      let thinkBuffer = '';
      let thinkChars = 0;
      let streamDone = false;
      let lastEventTime = 0;
      let outputStarted = false;
      let thinkingEmitted = true;
      let steppingActive = false;
      let firstRawEvent = 0;
      let firstVisibleText = 0;
      let eventCount = 0;
      let rawEventCount = 0;
      let toolCallCount = 0;
      let turnCount = 0;
      // 模型生成重型工具调用（如 propose_activities 的 3~4 张完整活动卡）时，
      // 参数生成阶段会长时间无任何流式事件，30s 会误杀正常生成；放宽到 75s。
      const IDLE_AFTER_ANY_EVENT_MS = 75000;

      const emitThinkingEnd = () => {
        if (thinkingEmitted) {
          thinkingEmitted = false;
          thinkingCallback?.('end');
        }
      };

      const emitStepping = (text: string) => {
        steppingActive = true;
        steppingCallback?.(text);
      };

      const clearStepping = () => {
        if (steppingActive) {
          steppingActive = false;
          steppingCallback?.('');
        }
      };

      const consumePromise = (async () => {
        for await (const event of stream) {
          if (streamDone) break;
          eventCount++;
          lastEventTime = Date.now();
          if (event.type === 'raw_model_stream_event') {
            rawEventCount++;
            if (!firstRawEvent) {
              firstRawEvent = Date.now();
              const dataType = (event.data as Record<string, unknown>)?.type;
              console.log(`[LLM] first raw event after ${ms(t0)} (ttfb=${firstRawEvent - tBeforeRun}ms) | dataType=${dataType}`);
            }
            const delta = this.extractTextDelta(event);
            const isFinished = this.extractIsFinished(event);

            if (delta) {
              let filtered = this.filterThinkTags(delta, (state) => {
                inThinkBlock = state.inBlock;
                thinkBuffer = state.buffer;
              }, { inBlock: inThinkBlock, buffer: thinkBuffer });

              if (inThinkBlock) {
                thinkChars += delta.length;
              }

              if (filtered && !outputStarted) {
                const trimmed = filtered.replace(/^[\s\n\r]+/, '');
                if (trimmed.length > 0) {
                  firstVisibleText = Date.now();
                  outputStarted = true;
                  emitThinkingEnd();
                  clearStepping();
                  console.log(`[LLM] ★ FIRST visible text after ${ms(t0)} | thinkGap=${firstVisibleText - (firstRawEvent || t0)}ms | thinkChars=${thinkChars} | rawEvents=${rawEventCount} | text="${trimmed.slice(0, 50)}"`);
                  currentText += trimmed;
                  safeTextCallback?.(trimmed);
                }
              } else if (filtered && outputStarted) {
                clearStepping();
                currentText += filtered;
                safeTextCallback?.(filtered);
              }
            }
            if (isFinished) {
              turnCount++;
              console.log(`[LLM] finish_reason turn=${turnCount} after ${ms(t0)} | visibleLen=${currentText.length} | thinkTotal=${thinkChars} | inThink=${inThinkBlock} (SDK will continue if tools were called)`);
            }
          } else if (event.type === 'run_item_stream_event') {
            const ename = event.name;
            if (ename === 'tool_called') {
              toolCallCount++;
              const item = event.item as unknown as Record<string, unknown>;
              const toolName =
                (item?.name as string) ||
                (item?.toolName as string) ||
                ((item?.tool as Record<string, unknown>)?.name as string) ||
                ((item?.input as Record<string, unknown>)?.name as string) ||
                'unknown';
              console.log(`[LLM] 🔧 tool_called [${toolCallCount}] "${toolName}" after ${ms(t0)} | visibleLen=${currentText.length}`);
              toolCallsList.push(toolName);
              toolCallCallback?.(toolName);
              emitThinkingEnd();
              // request_state_change 的等待文案按目标状态定制：等待期全程展示主题化进度，
              // 不再让 S1/S2 入场后的长等待回退成裸 typing dots
              let stepText = TOOL_STEPPING_TEXT[toolName];
              if (toolName === 'request_state_change') {
                const target = (() => {
                  const raw = (item?.arguments ?? item?.input ?? (item?.tool as Record<string, unknown> | undefined)?.arguments) as unknown;
                  try {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    return (parsed as Record<string, unknown> | null)?.target_state as string | undefined;
                  } catch { return undefined; }
                })();
                if (target === 'S1') stepText = '翻翻支线任务板…';
                else if (target === 'S2') stepText = '铺开支线，准备出发…';
                else if (target === 'S3') stepText = '收官，在手账上盖个戳…';
              }
              if (stepText) {
                // 对外可见的业务动作：stepping 态（转圈 icon + 说明）
                emitStepping(stepText);
              } else {
                // get_skill 等内部翻阅动作：不展示工具说明，回到等待态（typing dots）
                clearStepping();
                thinkingEmitted = true;
                thinkingCallback?.('start');
              }
            } else {
              console.log(`[LLM] item: ${ename} after ${ms(t0)} | visibleLen=${currentText.length}`);
            }
          } else {
            console.log(`[LLM] event: ${event.type} after ${ms(t0)}`);
          }
        }
        console.log(`[LLM] consume loop ended after ${ms(t0)} | events=${eventCount} | raw=${rawEventCount} | visibleLen=${currentText.length} | reason=${streamDone ? 'done/timeout' : 'iterator-done'}`);
      })();

      const idleCheckPromise = (async () => {
        while (!streamDone) {
          await new Promise(r => setTimeout(r, 200));
          if (lastEventTime > 0 && Date.now() - lastEventTime > IDLE_AFTER_ANY_EVENT_MS) {
            console.log(`[LLM] IDLE TIMEOUT after ${ms(t0)} | no event for ${IDLE_AFTER_ANY_EVENT_MS}ms | visibleLen=${currentText.length}`);
            streamDone = true;
            break;
          }
        }
      })();

      await Promise.race([consumePromise, idleCheckPromise]);
      streamDone = true;
      const tBeforeCompleted = Date.now();
      try { await stream.completed; } catch (e) { console.log(`[LLM] stream.completed threw: ${e instanceof Error ? e.message : String(e)}`); }
      console.log(`[LLM] stream.completed resolved in ${ms(tBeforeCompleted)} | total=${ms(t0)} | finalOutputLen=${(stream.finalOutput || '').length}`);

      const visibleOutput = sanitizeText(this.stripThinkTags(currentText)).trim();
      const totalMs = Date.now() - t0;
      console.log(`[LLM] invoke done | total=${ms(t0)} | visibleLen=${visibleOutput.length} | thinkChars=${thinkChars} | turns=${turnCount} | tools=${toolCallCount}`);

      activeTracer?.log('llm_call_end', {
        callId,
        label,
        totalMs,
        ttfbMs: firstRawEvent ? firstRawEvent - tBeforeRun : null,
        firstVisibleTextMs: firstVisibleText ? firstVisibleText - t0 : null,
        thinkChars,
        visibleOutputLen: visibleOutput.length,
        toolCalls: toolCallCount,
        turns: turnCount,
        rawEvents: rawEventCount,
        success: true,
        idleTimeout: streamDone && visibleOutput.length === 0,
        toolCallNames: toolCallsList,
        finalOutput: visibleOutput,
        visibleOutput,
      });

      emitThinkingEnd();
      clearStepping();

      return { visibleOutput, success: true, toolCalls: toolCallsList };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const totalMs = Date.now() - t0;
      console.log(`[LLM] invoke ERROR after ${ms(t0)}: ${message}`);
      activeTracer?.log('llm_call_end', {
        callId,
        label,
        totalMs,
        success: false,
        errorMessage: message,
        toolCalls: toolCallsList,
        finalOutput: '',
        visibleOutput: '',
      });
      activeTracer?.log('error', { phase: 'llm_invoke', error: message });

      thinkingCallback?.('end');
      steppingCallback?.('');

      return { visibleOutput: '', success: false, errorMessage: message, toolCalls: toolCallsList };
    }
  }

  private extractTextDelta(event: { data: unknown }): string | null {
    const data = event.data as Record<string, unknown>;
    if (!data) return null;
    if (data.type === 'response.output_text.delta') {
      return (data as { delta?: string }).delta || null;
    }
    if (data.type === 'output_text_delta') {
      return (data as { delta?: string }).delta || null;
    }
    if (this.useChatCompletions) {
      const choices = (data as { choices?: unknown[] }).choices;
      if (Array.isArray(choices) && choices.length > 0) {
        const choice = choices[0] as Record<string, unknown>;
        const delta = choice.delta as { content?: string } | undefined;
        if (delta?.content && typeof delta.content === 'string') {
          return delta.content;
        }
      }
    }
    if (typeof (data as { delta?: unknown }).delta === 'string') {
      return (data as { delta: string }).delta;
    }
    return null;
  }

  private extractIsFinished(event: { data: unknown }): boolean {
    const data = event.data as Record<string, unknown>;
    if (!data) return false;
    if (this.useChatCompletions) {
      const choices = (data as { choices?: unknown[] }).choices;
      if (Array.isArray(choices) && choices.length > 0) {
        const choice = choices[0] as Record<string, unknown>;
        if (choice.finish_reason && choice.finish_reason !== null) {
          return true;
        }
      }
    }
    return data.type === 'response.completed' || data.type === 'message.completed';
  }

  private filterThinkTags(
    delta: string,
    updateState: (state: { inBlock: boolean; buffer: string }) => void,
    state: { inBlock: boolean; buffer: string }
  ): string {
    // 兼容 MiniMax 的 <mm:think> 变体：统一归一成 <think>/</think> 再交给状态机
    delta = delta.replace(/<mm:think>/gi, '<think>').replace(/<\/mm:think>/gi, '</think>');
    let { inBlock, buffer } = state;
    let output = '';
    let i = 0;
    while (i < delta.length) {
      if (inBlock) {
        const closeIdx = delta.indexOf('</think>', i);
        if (closeIdx !== -1) {
          inBlock = false;
          buffer = '';
          i = closeIdx + 8;
        } else {
          buffer += delta.slice(i);
          if (buffer.length > 1000) buffer = buffer.slice(-500);
          i = delta.length;
        }
      } else {
        const openIdx = delta.indexOf('<think', i);
        const strayClose = delta.indexOf('</think>', i);
        // 闭合标签出现在开标签之前（或根本没有开标签）= 孤立残片，直接跳过
        if (strayClose !== -1 && (openIdx === -1 || strayClose < openIdx)) {
          output += delta.slice(i, strayClose);
          i = strayClose + 8;
          continue;
        }
        if (openIdx !== -1) {
          output += delta.slice(i, openIdx);
          const closeIdx = delta.indexOf('</think>', openIdx);
          if (closeIdx !== -1) {
            i = closeIdx + 8;
          } else {
            inBlock = true;
            buffer = delta.slice(openIdx);
            i = delta.length;
          }
        } else {
          output += delta.slice(i);
          i = delta.length;
        }
      }
    }
    updateState({ inBlock, buffer });
    return output;
  }

  private stripThinkTags(text: string): string {
    return text
      .replace(/<(?:mm:)?think[^>]*>[\s\S]*?<\/(?:mm:)?think>/g, '')
      .replace(/<\/?(?:mm:)?think>/g, '')
      .trim();
  }
}
