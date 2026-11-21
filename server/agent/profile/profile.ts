import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../../data-path.js';
import type { SeedMechanism, Seed } from '../skills/quest-library/seeds.js';
import { QUEST_PAIRS, LEGACY_PAIRS } from './quest-pairs.js';
import { FITTING_PAIRS, type PairAnswer, type PreferenceFitting } from './fitting-pairs.js';
import { fitPreferences, renderFittingBrief } from './preference-model.js';

// ── 玩家喜好档案：跨会话长期记忆 ──
// 问题轴与种子库（seeds.ts）的筛/排标签严格对齐，避免问"抽象分类"锚不准：
// 体力 / 新奇度 / 人群 / 预算 / 玩法机制；时间与场景是每局 S0 现采的，不进长期记忆。

export type EnergyPref = '坐' | '慢' | '动' | 'any';
export type SocialPref = 'solo' | 'pair' | 'group' | 'any';
export type BudgetPref = 'free' | 'low' | 'any';
/** 0 = 都行 / 未指定；1 经典稳妥；2 有点新鲜；3 脑洞陌生化 */
export type NoveltyPref = 0 | 1 | 2 | 3;

export interface UserProfile {
  clientId: string;
  createdAt: string;
  updatedAt: string;
  /** 是否完成过首次喜好引导（用于首访红点/提示，保存即置 true） */
  onboarded: boolean;
  /** 体力档：坐 / 慢走慢节奏 / 中高强度 / 都行 */
  energy: EnergyPref;
  /** 新奇度档：0 都行；1 稳妥；2 新鲜；3 脑洞 */
  novelty: NoveltyPref;
  /** 人群档：一个人安静 / 拉一个伴 / 人多热闹 */
  social: SocialPref;
  /** 预算档：零成本 / 小额可以 / 都行 */
  budget: BudgetPref;
  /** 偏好的玩法机制（多选，直接对种子 mech 标签加权） */
  mechs: SeedMechanism[];
  /** 兴趣爱好（自由填写原文） */
  interests: string;
  /** 雷点 / 不想要的（自由填写原文，推荐时务必绕开） */
  avoids: string;
  /** Pairwise 对比：明确选择、平局和跳过分别保存。 */
  pairVotes: Record<string, PairAnswer>;
  fitting?: PreferenceFitting;
  fittingUpdatedAt?: string;
}

export interface SaveProfileInput {
  energy: EnergyPref;
  novelty: NoveltyPref;
  social: SocialPref;
  budget: BudgetPref;
  mechs: SeedMechanism[];
  interests?: string;
  avoids?: string;
  pairVotes?: Record<string, PairAnswer>;
}

export const ENERGY_LABELS: Record<Exclude<EnergyPref, 'any'>, string> = {
  坐: '待着不动（坐）',
  慢: '慢慢溜达（慢）',
  动: '动起来出汗（动）',
};

export const SOCIAL_LABELS: Record<Exclude<SocialPref, 'any'>, string> = {
  solo: '一个人安安静静',
  pair: '拉一个伴一起',
  group: '人多热闹、认识新人',
};

export const BUDGET_LABELS: Record<Exclude<BudgetPref, 'any'>, string> = {
  free: '零成本',
  low: '小额花费可以',
};

export const NOVELTY_LABELS: Record<Exclude<NoveltyPref, 0>, string> = {
  1: '经典稳妥',
  2: '有点新鲜',
  3: '脑洞大开',
};

/** 玩法机制选项：短标签 + 一句画面感说明，前端据此渲染 chips */
export const MECHANISM_OPTIONS: { id: SeedMechanism; short: string; hint: string }[] = [
  { id: '收集图鉴', short: '收集图鉴', hint: '定主题集齐 N 个' },
  { id: '随机委托', short: '随机运气', hint: '抛硬币/随机，把决定交出去' },
  { id: '视角重赋', short: '视角重赋', hint: '给路人或旧物编个新身份' },
  { id: '规则限制', short: '规则限制', hint: '给平常事加一条奇怪约束' },
  { id: '定点观察', short: '定点观察', hint: '守一个地方记录变化细节' },
  { id: '触感心流', short: '触感心流', hint: '重复手部动作让脑子关机' },
  { id: '盲盒猜谜', short: '盲盒猜谜', hint: '蒙上一种感官靠猜' },
  { id: '角色扮演', short: '角色扮演', hint: '换个身份做平常事' },
  { id: '连接动作', short: '连接动作', hint: '发起一次微小的人际接触' },
  { id: '留痕收尾', short: '留痕收尾', hint: '做出一件能回看的东西' },
];

const VALID_ENERGY = ['坐', '慢', '动', 'any'] as EnergyPref[];
const VALID_SOCIAL = ['solo', 'pair', 'group', 'any'] as SocialPref[];
const VALID_BUDGET = ['free', 'low', 'any'] as BudgetPref[];
const VALID_NOVELTY: NoveltyPref[] = [0, 1, 2, 3];
const VALID_MECHS = MECHANISM_OPTIONS.map((m) => m.id);

/** 清洗并收敛前端上送的字段，剔除非法枚举、限制长度 */
export function normalizeProfileInput(raw: {
  energy?: unknown;
  novelty?: unknown;
  social?: unknown;
  budget?: unknown;
  mechs?: unknown;
  interests?: unknown;
  avoids?: unknown;
  pairVotes?: unknown;
}): SaveProfileInput {
  const energy = VALID_ENERGY.includes(raw.energy as EnergyPref)
    ? (raw.energy as EnergyPref)
    : 'any';
  const social = VALID_SOCIAL.includes(raw.social as SocialPref)
    ? (raw.social as SocialPref)
    : 'any';
  const budget = VALID_BUDGET.includes(raw.budget as BudgetPref)
    ? (raw.budget as BudgetPref)
    : 'any';
  const novelty = VALID_NOVELTY.includes(raw.novelty as NoveltyPref)
    ? (raw.novelty as NoveltyPref)
    : 0;
  const mechs = Array.isArray(raw.mechs)
    ? [...new Set(
        raw.mechs.filter(
          (m): m is SeedMechanism =>
            typeof m === 'string' && (VALID_MECHS as string[]).includes(m),
        ),
      )]
    : [];
  const cleanStr = (v: unknown) =>
    typeof v === 'string' ? v.trim().slice(0, 200) : '';

  // 只接受已知题目及四种字面答案，不能把数组等类型强转为答案。
  const pairVotes: Record<string, PairAnswer> = {};
  if (raw.pairVotes && typeof raw.pairVotes === 'object') {
    for (const [k, v] of Object.entries(raw.pairVotes as Record<string, unknown>)) {
      if (typeof v === 'string' && ['A', 'B', 'tie', 'skip'].includes(v) && QUEST_PAIRS.some((q) => q.id === k)) {
        pairVotes[k] = v as PairAnswer;
      }
    }
  }

  return { energy, novelty, social, budget, mechs, interests: cleanStr(raw.interests), avoids: cleanStr(raw.avoids), pairVotes: raw.pairVotes === undefined ? undefined : pairVotes };
}

function defaultProfile(clientId: string): UserProfile {
  const now = new Date().toISOString();
  return {
    clientId,
    createdAt: now,
    updatedAt: now,
    onboarded: false,
    energy: 'any',
    novelty: 0,
    social: 'any',
    budget: 'any',
    mechs: [],
    interests: '',
    avoids: '',
    pairVotes: {},
  };
}

// ── JSON 文件存储（写穿 + 内存缓存，与 handbook 同一范式）─────────────────────

const DATA_PATH = path.join(DATA_DIR, 'profile.json');

let cache: Record<string, UserProfile> | null = null;
let loading: Promise<Record<string, UserProfile>> | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, UserProfile>> {
  if (cache) return cache;
  if (!loading) loading = (async () => {
    try {
      cache = JSON.parse(await fs.readFile(DATA_PATH, 'utf-8')) as Record<string, UserProfile>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      cache = {};
    }
    return cache!;
  })().finally(() => { loading = null; });
  return loading;
}

// Serialize read/modify/write together; failed disk writes never publish a new in-memory profile.
async function updateProfileStore(clientId: string, update: (existing: UserProfile | undefined) => UserProfile) {
  const operation = writeChain.then(async () => {
    const store = await load();
    const next = update(store[clientId]);
    const snapshot = { ...store, [clientId]: next };
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(`${DATA_PATH}.tmp`, JSON.stringify(snapshot, null, 2), 'utf-8');
    await fs.rename(`${DATA_PATH}.tmp`, DATA_PATH);
    cache = snapshot;
    return { ...next, fitting: fitPreferences(next.pairVotes) };
  });
  writeChain = operation.then(() => {}, () => {});
  return operation;
}

/** 取档案：不存在时返回默认值（不提前落盘，等用户真正保存时再写） */
export async function getProfile(clientId: string): Promise<UserProfile> {
  const store = await load();
  const profile = store[clientId] ?? defaultProfile(clientId);
  return { ...profile, fitting: fitPreferences(profile.pairVotes) };
}

/** 新建或更新档案（首访引导保存即 onboarded=true） */
export async function saveProfile(
  clientId: string,
  input: SaveProfileInput,
): Promise<UserProfile> {
  return updateProfileStore(clientId, existing => {
    const now = new Date().toISOString();
    const next: UserProfile = {
      clientId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      onboarded: true,
      energy: input.energy,
      novelty: input.novelty,
      social: input.social,
      budget: input.budget,
      mechs: input.mechs,
      interests: input.interests ?? '',
      avoids: input.avoids ?? '',
      pairVotes: input.pairVotes ?? existing?.pairVotes ?? {},
      fittingUpdatedAt: existing?.fittingUpdatedAt,
    };
    return next;
  });
}

/** Fitting updates only comparison data; it cannot replace explicit basic preferences. */
export async function saveProfileFitting(clientId: string, rawVotes: unknown): Promise<UserProfile> {
  if (!rawVotes || typeof rawVotes !== 'object' || Array.isArray(rawVotes)) throw new Error('请完成问卷后再保存，拿不准的可以跳过。');
  const raw = rawVotes as Record<string, unknown>;
  if (!FITTING_PAIRS.every(pair => typeof raw[pair.id] === 'string' && ['A', 'B', 'tie', 'skip'].includes(raw[pair.id] as string))) throw new Error('还有未回答的题目，可以选择跳过后再保存。');
  const votes = Object.fromEntries(FITTING_PAIRS.map(pair => [pair.id, raw[pair.id] as PairAnswer]));
  return updateProfileStore(clientId, stored => {
    const existing = stored ?? defaultProfile(clientId);
    const pairVotes = { ...existing.pairVotes, ...votes };
    const next = { ...existing, onboarded: true, updatedAt: new Date().toISOString(), fittingUpdatedAt: new Date().toISOString(), pairVotes };
    return next;
  });
}

// ── 喂给吱呀的"玩家喜好"摘要（注入每轮运行时上下文，口径直指种子标签）──────────

export function buildProfileBrief(p: UserProfile): string {
  if (!p.onboarded) return '';
  const lines: string[] = ['# 玩家喜好档案（跨次记得的长期画像，选卡务必按这些标签对齐）'];

  lines.push(
    `- 体力档：${p.energy === 'any' ? '未指定，按现场体力给' : ENERGY_LABELS[p.energy]}。`,
  );
  lines.push(
    `- 新奇度：${p.novelty === 0 ? '未指定，nov1~3 都可以给' : `优先 nov=${p.novelty}（${NOVELTY_LABELS[p.novelty]}）`}。`,
  );
  lines.push(
    `- 人群偏好：${p.social === 'any' ? '未指定' : SOCIAL_LABELS[p.social]}。`,
  );
  lines.push(
    `- 预算：${p.budget === 'any' ? '未指定' : BUDGET_LABELS[p.budget]}。`,
  );

  if (p.mechs.length > 0) {
    lines.push(`- 喜欢的玩法机制：${p.mechs.join('、')}——出卡优先命中这些 mech。`);
  }
  if (p.interests) lines.push(`- 兴趣爱好：${p.interests}（可据此找对题的支线）。`);
  if (p.avoids) {
    lines.push(`- 明确雷点 / 不想要：${p.avoids}——推荐务必绕开，别推这类。`);
  }

  // 时间爬坡·真实任务二选一：按"10 分钟→一整天"列出 TA 在每个时长档的取舍
  const votedPairs = LEGACY_PAIRS.filter((q) => p.pairVotes[q.id] === 'A' || p.pairVotes[q.id] === 'B');
  if (votedPairs.length > 0) {
    const choices = votedPairs.map((q) => {
      const chosen: Seed = p.pairVotes[q.id] === 'A' ? q.a : q.b;
      const dropped: Seed = p.pairVotes[q.id] === 'A' ? q.b : q.a;
      return `${q.timeShort}：「${chosen.title}」＞「${dropped.title}」`;
    });
    lines.push(`- 时间爬坡真实二选一（注意不同时长下的口味变化）：${choices.join('；')}。`);

    // 被选任务标签汇总：同类/同机制/同体力/同新奇度的支线加权
    const chosenSeeds = votedPairs.map((q) =>
      p.pairVotes[q.id] === 'A' ? q.a : q.b,
    );
    const tally = (vals: string[]) => {
      const m = new Map<string, number>();
      vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([v, n]) => `${v}×${n}`)
        .join('、');
    };
    lines.push(
      `- 被选任务标签信号（命中的支线加权）：类型 ${tally(chosenSeeds.map((s) => s.cat))}；机制 ${tally(chosenSeeds.map((s) => s.mech))}；体力 ${tally(chosenSeeds.map((s) => s.energy))}；新奇度 ${tally(chosenSeeds.map((s) => String(s.nov)))}。`,
    );
  }

  const fitted = renderFittingBrief(fitPreferences(p.pairVotes));
  if (fitted) lines.push(fitted);

  lines.push('（这是长期喜好；与本局临时的时间/地点/天气冲突时，两者都要兼顾。）');
  return lines.join('\n');
}
