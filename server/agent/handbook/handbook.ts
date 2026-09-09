import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// ── 支线手账：跨会话持久化玩家完成过的支线（集印册 + 成就墙）─────────────────

export type QuestCategory = 'explore' | 'organize' | 'create' | 'connect' | 'sense';

export const CATEGORY_META: Record<QuestCategory, { label: string; hint: string }> = {
  explore: { label: '探索', hint: '走出去、发现新东西' },
  organize: { label: '整理', hint: '收拾、归置、与物品相处' },
  create: { label: '创造', hint: '动手做一个东西' },
  connect: { label: '连接', hint: '和人、和记忆产生联系' },
  sense: { label: '感官', hint: '调动听觉嗅觉味觉触觉' },
};

export const CATEGORY_IDS = Object.keys(CATEGORY_META) as QuestCategory[];

export interface QuestRecord {
  id: string;
  title: string;
  category: QuestCategory;
  tags: string[];
  steps: number;
  evidence?: string;
  date: string;
}

export interface Handbook {
  clientId: string;
  createdAt: string;
  quests: QuestRecord[];
}

// ── 成就徽章（由支线记录确定性派生，不单独存状态）────────────────────────────

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
}

export interface BadgeState extends BadgeDef {
  earned: boolean;
  progress: number;
  target: number;
  unlockedAt?: string;
}

interface BadgeSpec extends BadgeDef {
  kind: 'total' | 'all-categories' | 'category';
  target: number;
  category?: QuestCategory;
}

const BADGE_SPECS: BadgeSpec[] = [
  { id: 'first-step', name: '初次出发', desc: '完成第一条支线', kind: 'total', target: 1 },
  { id: 'three', name: '小有所获', desc: '完成 3 条支线', kind: 'total', target: 3 },
  { id: 'ten', name: '闲不住的人', desc: '完成 10 条支线', kind: 'total', target: 10 },
  { id: 'all-five', name: '五类集齐', desc: '五类支线各做过一条', kind: 'all-categories', target: 5 },
  { id: 'explorer', name: '探索家', desc: '完成 3 条「探索」类支线', kind: 'category', target: 3, category: 'explore' },
  { id: 'tidier', name: '收纳家', desc: '完成 3 条「整理」类支线', kind: 'category', target: 3, category: 'organize' },
  { id: 'maker', name: '创造者', desc: '完成 3 条「创造」类支线', kind: 'category', target: 3, category: 'create' },
  { id: 'connector', name: '联结者', desc: '完成 3 条「连接」类支线', kind: 'category', target: 3, category: 'connect' },
  { id: 'sensor', name: '感受家', desc: '完成 3 条「感官」类支线', kind: 'category', target: 3, category: 'sense' },
];

function countByCategory(quests: QuestRecord[]): Record<QuestCategory, number> {
  const counts = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])) as Record<QuestCategory, number>;
  for (const q of quests) {
    if (q.category in counts) counts[q.category] += 1;
  }
  return counts;
}

/** 某枚徽章是被第几条支线"触发"的——返回那条支线的时间，用于解锁时间与排序 */
function badgeUnlockDate(spec: BadgeSpec, quests: QuestRecord[]): string | undefined {
  const ordered = [...quests].sort((a, b) => a.date.localeCompare(b.date));
  if (spec.kind === 'total') {
    return ordered.length >= spec.target ? ordered[spec.target - 1].date : undefined;
  }
  if (spec.kind === 'all-categories') {
    const firstSeen = new Map<QuestCategory, string>();
    for (const q of ordered) {
      if (!(q.category in firstSeen)) firstSeen.set(q.category, q.date);
      if (firstSeen.size === 5) return q.date;
    }
    return undefined;
  }
  const cat = spec.category!;
  const matched = ordered.filter((q) => q.category === cat);
  return matched.length >= spec.target ? matched[spec.target - 1].date : undefined;
}

export function deriveBadges(quests: QuestRecord[]): BadgeState[] {
  const byCat = countByCategory(quests);
  const distinctCats = CATEGORY_IDS.filter((c) => byCat[c] > 0).length;
  return BADGE_SPECS.map((spec) => {
    const progress =
      spec.kind === 'total' ? quests.length
      : spec.kind === 'all-categories' ? distinctCats
      : byCat[spec.category!];
    const unlockedAt = badgeUnlockDate(spec, quests);
    return {
      id: spec.id,
      name: spec.name,
      desc: spec.desc,
      earned: !!unlockedAt,
      progress: Math.min(progress, spec.target),
      target: spec.target,
      unlockedAt,
    };
  });
}

export interface HandbookStats {
  total: number;
  weekCount: number;
  byCategory: Record<QuestCategory, number>;
  earnedCount: number;
}

export interface HandbookView {
  clientId: string;
  quests: QuestRecord[];
  badges: BadgeState[];
  stats: HandbookStats;
}

function weekCount(quests: QuestRecord[]): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return quests.filter((q) => new Date(q.date).getTime() >= cutoff).length;
}

export function deriveView(hb: Handbook): HandbookView {
  const badges = deriveBadges(hb.quests);
  return {
    clientId: hb.clientId,
    quests: [...hb.quests].sort((a, b) => b.date.localeCompare(a.date)),
    badges,
    stats: {
      total: hb.quests.length,
      weekCount: weekCount(hb.quests),
      byCategory: countByCategory(hb.quests),
      earnedCount: badges.filter((b) => b.earned).length,
    },
  };
}

// ── JSON 文件存储（写穿 + 内存缓存，单机本地持久化）─────────────────────────

const DATA_PATH = path.resolve(process.cwd(), 'data', 'handbook.json');

let cache: Record<string, Handbook> | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, Handbook>> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    cache = JSON.parse(raw) as Record<string, Handbook>;
  } catch {
    cache = {};
  }
  return cache!;
}

async function persist() {
  const snapshot = JSON.stringify(cache, null, 2);
  writeChain = writeChain.then(async () => {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, snapshot, 'utf-8');
  });
  return writeChain;
}

export async function getHandbook(clientId: string): Promise<Handbook> {
  const store = await load();
  if (!store[clientId]) {
    store[clientId] = { clientId, createdAt: new Date().toISOString(), quests: [] };
  }
  return store[clientId];
}

export async function getView(clientId: string): Promise<HandbookView> {
  return deriveView(await getHandbook(clientId));
}

export interface RecordQuestInput {
  title: string;
  category: QuestCategory;
  tags: string[];
  steps: number;
  evidence?: string;
}

export async function recordQuest(
  clientId: string,
  input: RecordQuestInput,
): Promise<{ view: HandbookView; newBadges: BadgeState[] }> {
  const store = await load();
  if (!store[clientId]) {
    store[clientId] = { clientId, createdAt: new Date().toISOString(), quests: [] };
  }
  const before = new Set(deriveBadges(store[clientId].quests).filter((b) => b.earned).map((b) => b.id));

  const rec: QuestRecord = {
    id: randomUUID(),
    title: input.title,
    category: input.category,
    tags: input.tags ?? [],
    steps: input.steps,
    evidence: input.evidence?.slice(0, 60),
    date: new Date().toISOString(),
  };
  store[clientId].quests.push(rec);
  await persist();

  const view = deriveView(store[clientId]);
  const newBadges = view.badges.filter((b) => b.earned && !before.has(b.id));
  return { view, newBadges };
}

// ── 喂给小闲的"记得玩家"摘要（注入运行时上下文）────────────────────────────

export function buildHandbookBrief(view: HandbookView): string {
  const { stats, quests, badges } = view;
  const lines: string[] = [];
  if (stats.total === 0) {
    lines.push('玩家的支线手账还是空白的——这是 TA 第一次出发，没有历史记录。');
    return lines.join('\n');
  }
  lines.push(`玩家的支线手账：已经完成 ${stats.total} 条支线（最近 7 天 ${stats.weekCount} 条），点亮 ${stats.earnedCount} 枚成就。`);
  const catPart = CATEGORY_IDS
    .map((c) => `${CATEGORY_META[c].label}${stats.byCategory[c]}`)
    .join('、');
  lines.push(`各类型收集进度：${catPart}。`);
  const recent = quests.slice(0, 3).map((q) => `「${q.title}」(${CATEGORY_META[q.category].label})`).join('、');
  lines.push(`最近做过：${recent}。`);
  const next = badges.filter((b) => !b.earned).sort((a, b) => (b.target - b.progress) - (a.target - a.progress))[0];
  if (next) {
    lines.push(`离 TA 最近的一枚成就是「${next.name}」（${next.desc}），目前 ${next.progress}/${next.target}，可以在祝贺时自然地给个奔头，但不要催、不要像发指标。`);
  }
  return lines.join('\n');
}
