import { SEEDS, type Seed } from '../skills/quest-library/seeds.js';

// ── Pair-wise 真实任务对比·时间爬坡 ────────────────────────────────────────
// 不用抽象维度提问（那与结构化页重复）：按时间从短到长设 6 个档位，
// 每档给两件该时长能完成、但反差极大的真实支线，问 TA"如果有这么多时间，更想做哪个"。
// 配对原则：时长（问题前提）与预算必须一致；其余维度（场景/体力/人群/类型/机制）
// 反差越大越好——反差够大，二选一才能直观暴露出 TA 在不同时长下的口味曲线。
// axis 只用于服务端 brief 标注，不展示给用户。

interface RawPair {
  id: string;
  /** 问题用时长从句：如 "只有 10 分钟" / "有一个下午" */
  when: string;
  /** brief/标注用短标签：如 "10 分钟" */
  timeShort: string;
  aId: string;
  bId: string;
  /** 这对主要在探测什么（内部用） */
  axis: string;
}

const RAW_PAIRS: RawPair[] = [
  // 10 分钟·免费：坐着动脑写字（有作品） vs 光脚动身体（纯触感）
  { id: 'q1', when: '只有 10 分钟', timeShort: '10 分钟', aId: 'receipt-poem', bId: 'barefoot-ground', axis: '动脑写 vs 动身体' },
  // 30 分钟·免费：在家整理建立秩序（可控） vs 出门把方向交给硬币（随机）
  { id: 'q2', when: '有 30 分钟', timeShort: '30 分钟', aId: 'drawer-ritual', bId: 'coin-navigation', axis: '室内秩序 vs 户外随机' },
  // 1 小时·免费：一个人走路集章（独·静） vs 一群人在家开演唱会（众·闹）
  { id: 'q3', when: '有 1 个小时', timeShort: '1 小时', aId: 'city-stamp-book', bId: 'living-room-concert', axis: '独走收集 vs 众闹表演' },
  // 2 小时·小额：场馆里一个人被动看片 vs 店里和众人主动开口唱
  { id: 'q4', when: '有 2 个小时', timeShort: '2 小时', aId: 'cinema-classic', bId: 'karaoke-oldies', axis: '被动看 vs 主动唱' },
  // 1 个下午·小额：户外爬山动起来（挑战） vs 在家坐着拼图（安静）
  { id: 'q5', when: '有一个下午', timeShort: '1 个下午', aId: 'hike-summit-share', bId: 'puzzle-rainy-day', axis: '山野挑战 vs 室内安静' },
  // 1 整天·小额：出门远征横穿一城（向外） vs 宅家深耕一件大工程（向内）
  { id: 'q6', when: '有一整天', timeShort: '1 整天', aId: 'full-day-cross-city', bId: 'full-day-home-project', axis: '向外远征 vs 向内宅家' },
];

export interface QuestPair {
  id: string;
  when: string;
  timeShort: string;
  axis: string;
  a: Seed;
  b: Seed;
}

const seedById = new Map<string, Seed>(SEEDS.map((s) => [s.id, s]));

/** 反差维度：主场景 / 体力 / 人群无交集 / 类型 / 机制，统计两侧在几项上不同 */
function contrastDimensions(a: Seed, b: Seed) {
  const peopleOverlap = a.people.some((p) => b.people.includes(p));
  return [
    a.scenes[0] !== b.scenes[0],
    a.energy !== b.energy,
    !peopleOverlap,
    a.cat !== b.cat,
    a.mech !== b.mech,
  ].filter(Boolean).length;
}

function hydrate(raw: RawPair): QuestPair {
  const a = seedById.get(raw.aId);
  const b = seedById.get(raw.bId);
  if (!a || !b) throw new Error(`quest-pairs: unknown seed (${raw.aId}/${raw.bId})`);
  // 时长是问题前提、预算影响"去不去得了"，两者必须一致
  if (a.min !== b.min) {
    throw new Error(`quest-pairs ${raw.id} 时长不一致：${a.id}(${a.min}) vs ${b.id}(${b.min})`);
  }
  if (a.budget !== b.budget) {
    throw new Error(`quest-pairs ${raw.id} 预算不一致：${a.id} vs ${b.id}`);
  }
  // 反差度校验：少于 2 个维度不同，用户会觉得两件事雷同、选择不暴露偏好
  if (contrastDimensions(a, b) < 2) {
    throw new Error(`quest-pairs ${raw.id} 反差不足（用户会觉得雷同）：${a.id} vs ${b.id}`);
  }
  return { id: raw.id, when: raw.when, timeShort: raw.timeShort, axis: raw.axis, a, b };
}

export const QUEST_PAIRS: QuestPair[] = RAW_PAIRS.map(hydrate);

/** 只取前端渲染需要的种子字段（避免把整个种子结构下发） */
export function pairSeedForClient(s: Seed) {
  return {
    id: s.id,
    title: s.title,
    text: s.text,
    min: s.min,
    scenes: s.scenes,
    energy: s.energy,
    budget: s.budget,
  };
}

export function questPairsForClient() {
  return QUEST_PAIRS.map((p) => ({
    id: p.id,
    when: p.when,
    timeShort: p.timeShort,
    a: pairSeedForClient(p.a),
    b: pairSeedForClient(p.b),
  }));
}

export function getPair(id: string): QuestPair | undefined {
  return QUEST_PAIRS.find((p) => p.id === id);
}
