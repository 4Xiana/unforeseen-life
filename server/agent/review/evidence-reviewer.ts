/**
 * 证物验收员（Evidence Reviewer）。
 *
 * 定位：S2 每一步，玩家提交文字/照片证物后，在主对话（吱呀）之前先做一次
 * 独立、非流式、强制结构化的核对。它不是面向用户的角色，只产出权威判定：
 * - evidenceSeen：回读"实际看到的证物内容"，强制证明真读（禁止空泛）；
 * - criteriaChecked：逐条对照玩家可见的交证物要求 proofPrompt 的命中/缺失；
 * - verdict：pass / reject。
 *
 * coordinator 拿到 verdict 后：把结论注入吱呀的本轮上下文，并作为 publish_step /
 * S3 毕业的硬门控——reject 时无论吱呀嘴上说什么都发不出下一步。
 *
 * 复用同一 OpenAI 兼容配置（默认 deepseek-chat，已实测支持图片输入），
 * 不引入新依赖/新密钥。任何失败都由调用方降级（绝不默认放行）。
 */
import { OpenAI } from 'openai';
import type { ActivityStep } from '../memory/types.js';
import type { GeoPoint } from '../env/env-service.js';

export interface CriterionCheck {
  /** 完成标准中的一个可核对条目 */
  criterion: string;
  hit: boolean;
  /** 命中或缺失的具体依据（必须落在证物里看得见的东西上） */
  note: string;
}

export interface EvidenceReview {
  /** reviewer 是否成功给出有效判定；false 时调用方退回严格自核（不放行） */
  available: boolean;
  verdict: 'pass' | 'reject';
  /** 回读证物：文字具体写了哪几条 / 照片里看到什么具体内容 */
  evidenceSeen: string;
  criteriaChecked: CriterionCheck[];
  reason: string;
  /** reject 时玩家具体要补什么、怎么补；pass 时为空串 */
  whatNeeded: string;
  /** 定位与玩家声称的地点是否一致；无定位或无法判断时 undefined */
  geoConsistent?: boolean;
}

export interface ReviewEvidenceParams {
  step: ActivityStep;
  kind: 'submit_text' | 'submit_photo';
  /** 玩家文字：submit_text 的记录，或 submit_photo 的图说答案 */
  text?: string;
  /** submit_photo 的现场照片（data URL） */
  imageDataUrl?: string;
  geo?: GeoPoint;
  /** 玩家此前提到的场景/地点（如"在家""在公司"），用于定位一致性核对 */
  claimedPlace?: string;
}

const REVIEW_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_evidence_review',
    description: '提交对玩家本步骤证物的核对结果。必须先实际回读证物内容，再逐条对照展示给玩家的交证物要求。',
    parameters: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['pass', 'reject'], description: '证物是否真正满足完成标准' },
        evidence_seen: {
          type: 'string',
          description:
            '你从证物中实际读到的具体内容：文字证物逐条列出关键条目；照片证物描述画面里看得见的东西（对象/数量/颜色/分区等）。禁止"内容完整""符合要求"这类空泛话。',
        },
        criteria_checked: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              criterion: { type: 'string', description: '交证物要求中的一个可核对条目' },
              hit: { type: 'boolean', description: '证物是否满足该条' },
              note: { type: 'string', description: '命中或缺失的具体依据' },
            },
            required: ['criterion', 'hit', 'note'],
          },
        },
        reason: { type: 'string', description: '通过/驳回的核心理由' },
        what_needed: {
          type: 'string',
          description: 'reject 时，玩家具体要补什么、怎么补；pass 时填空字符串',
        },
        geo_consistent: {
          type: 'boolean',
          description: '提交时定位与玩家声称的地点是否一致；无法判断时填 true（不因定位误伤）',
        },
      },
      required: ['verdict', 'evidence_seen', 'criteria_checked', 'reason', 'what_needed', 'geo_consistent'],
    },
  },
};

const SYSTEM_PROMPT = [
  '你是一个严格但不刁难的「证物验收员」。玩家正在完成一个生活支线任务，你要核对 TA 为当前这一步提交的证物是否真正满足完成标准。',
  '',
  '核对要求：',
  '1. 先真正读取证物：文字证物逐条数清写了什么；照片证物认真看图、描述画面里实际存在的东西。禁止只凭"我做完了/挺好的"这类声明判定。',
  '2. 逐条对照展示给玩家的「交证物要求 proofPrompt」：数量要数（要 5 个就必须有 5 个，少一个驳回）；内容要具体（拒绝空泛形容词，要有名词/名字/数字/完整句子）；要对题（让列声音却写抒情、答案与画面或问题对不上，算答非所问）。验收只能以玩家卡片上实际看到的交证物要求为基准，绝不要求 proofPrompt 没点名的额外内容。',
  '3. 照片证物：① 画面是否是这一步要的现场；② 图说答案是否真的在回答 proofPrompt 的具体问题，且与图里看得见的东西对得上。哪怕照片清楚、句子通顺，只要答非所问就驳回。',
  '4. 定位是附加佐证：提交时坐标对应的地点若与玩家声称的场景明显矛盾（如声称在家，坐标却在很远的外地），判 geo_consistent=false 并作为驳回依据；无法判断时填 true，不要因定位误伤。',
  '5. 尺度：像认真的朋友，不苛刻也绝不放水。只有证物本身确实达标才 pass，否则一律 reject，并在 what_needed 里说清具体怎么补。',
].join('\n');

function buildUserText(params: ReviewEvidenceParams): string {
  const { step, kind, text, geo, claimedPlace } = params;
  const lines: string[] = [
    '# 当前步骤',
    `- 动作指引：${step.instruction}`,
  ];
  if (step.proofPrompt) {
    lines.push(`- 交证物要求（展示在玩家卡片上，验收的唯一基准）：${step.proofPrompt}`);
  }
  lines.push(`- 验收标准备注：${step.completionCriteria}`);
  lines.push('  （该备注应与上面的交证物要求等价；若有任何出入，一律以玩家卡片上的交证物要求为准，不得要求它没点名的东西。）');
  lines.push('', '# 玩家提交的证物');
  if (kind === 'submit_text') {
    lines.push('- 类型：文字记录');
    lines.push(`- 文字内容：\n${text?.trim() || '（空）'}`);
  } else {
    lines.push('- 类型：现场照片（图片在本条消息中，请直接看图）');
    lines.push(`- 图说答案：${text?.trim() || '（未提供）'}`);
  }
  lines.push('', '# 附加信息');
  if (claimedPlace) lines.push(`- 玩家此前提到的场景：${claimedPlace}`);
  if (geo) {
    lines.push(`- 提交时定位：坐标 (${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)})，精度约 ${geo.accuracy ? Math.round(geo.accuracy) : '未知'} 米`);
  } else {
    lines.push('- 提交时定位：未提供');
  }
  return lines.join('\n');
}

/** 从模型响应里提取并校验结构化判定；无法提取返回 null */
function parseReview(args: unknown): EvidenceReview | null {
  if (typeof args !== 'string' && typeof args !== 'object') return null;
  let raw: Record<string, unknown>;
  try {
    raw = typeof args === 'string' ? JSON.parse(args) : (args as Record<string, unknown>);
  } catch {
    return null;
  }
  if (raw.verdict !== 'pass' && raw.verdict !== 'reject') return null;
  const checked = Array.isArray(raw.criteria_checked) ? raw.criteria_checked : [];
  return {
    available: true,
    verdict: raw.verdict,
    evidenceSeen: typeof raw.evidence_seen === 'string' ? raw.evidence_seen : '',
    criteriaChecked: checked
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        criterion: String(c.criterion ?? ''),
        hit: Boolean(c.hit),
        note: String(c.note ?? ''),
      })),
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    whatNeeded: typeof raw.what_needed === 'string' ? raw.what_needed : '',
    geoConsistent: typeof raw.geo_consistent === 'boolean' ? raw.geo_consistent : undefined,
  };
}

/**
 * 核对玩家本步骤证物。成功返回结构化判定；任何失败返回 available:false
 * （调用方退回吱呀严格自核，绝不默认放行）。
 */
export async function reviewEvidence(params: ReviewEvidenceParams): Promise<EvidenceReview> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  const model = process.env.OPENAI_MODEL || 'deepseek-chat';
  const client = new OpenAI({ apiKey, baseURL, timeout: 60000 });

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: buildUserText(params) },
  ];
  if (params.kind === 'submit_photo' && params.imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: params.imageDataUrl } });
  }

  const runCall = async () =>
    client.chat.completions.create({
      model,
      tools: [REVIEW_TOOL],
      tool_choice: 'required',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    });

  // 最多尝试两次：结构化解析失败（模型未按工具调用/参数残缺）时重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await runCall();
      const msg = resp.choices?.[0]?.message;
      // 新版 SDK 的 tool_calls 是联合类型，只有 type==='function' 才有 .function
      const toolCall = msg?.tool_calls?.find((c) => {
        const tc = c as unknown as { type?: string; function?: { name?: string } };
        return tc.type === 'function' && tc.function?.name === 'submit_evidence_review';
      }) as unknown as { function?: { arguments?: string } } | undefined;
      const toolArgs = toolCall?.function?.arguments;
      if (toolArgs) {
        const parsed = parseReview(toolArgs);
        if (parsed) return parsed;
      }
      // 兜底：模型没走工具但直接给了 JSON
      if (msg?.content) {
        const match = msg.content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = parseReview(match[0]);
          if (parsed) return parsed;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[review] evidence reviewer error (attempt ${attempt + 1}): ${message}`);
      if (attempt === 1) break;
    }
  }

  return {
    available: false,
    verdict: 'reject',
    evidenceSeen: '',
    criteriaChecked: [],
    reason: '验收服务暂时不可用',
    whatNeeded: '',
  };
}
