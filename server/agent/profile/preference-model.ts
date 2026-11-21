import type { Seed } from '../skills/quest-library/seeds.js';
import { FITTING_PAIRS, FITTING_VERSION, type PairAnswer, type PreferenceFitting } from './fitting-pairs.js';

const axes = [
  { id: 'cat', label: '玩法口味', values: { explore: '探索发现', organize: '整理秩序', create: '动手创造', connect: '情感连接', sense: '感官体验' } },
  { id: 'energy', label: '活动节奏', values: { 坐: '安静坐着', 慢: '慢慢活动', 动: '动起来' } },
  { id: 'nov', label: '新鲜程度', values: { '1': '熟悉稳妥', '2': '一点新鲜', '3': '脑洞玩法' } },
  { id: 'people', label: '独处与陪伴', values: { 独: '独自享受', 双: '两人同行', 众: '多人一起' } },
  { id: 'scenes', label: '场景偏好', values: { 家: '家里', 户外: '户外', 工位: '工位附近' } },
  { id: 'mech', label: '玩法机制', values: { 随机委托: '随机探索', 收集图鉴: '主题收集', 视角重赋: '想象故事', 规则限制: '小小挑战', 定点观察: '细节观察', 触感心流: '动手放松', 盲盒猜谜: '猜谜发现', 角色扮演: '角色代入', 连接动作: '交流连接', 留痕收尾: '作品留痕' } },
];
const features = axes.flatMap(axis => Object.entries(axis.values).map(([value, label]) => ({ key: `${axis.id}:${value}`, axis: axis.id, value, label })));
function vector(seed: Seed): number[] {
  return features.map(feature => {
    const value = seed[feature.axis as keyof Seed];
    return Array.isArray(value) ? (value.includes(feature.value as never) ? 1 / value.length : 0) : String(value) === feature.value ? 1 : 0;
  });
}

/** Linear Bradley–Terry preference fit, L2-regularized to keep small/noisy samples modest.
 * P(A > B) = sigmoid(w · (features(A) - features(B))). Ties use target .5;
 * skips provide no preference evidence. Scores are relative utilities, not accuracy percentages.
 */
export function fitPreferences(votes: Record<string, PairAnswer> = {}): PreferenceFitting {
  const answered = FITTING_PAIRS.filter(pair => ['A', 'B', 'tie', 'skip'].includes(votes[pair.id]));
  const rows = answered.filter(pair => votes[pair.id] !== 'skip').map(pair => {
    const a = vector(pair.a), b = vector(pair.b);
    return { x: a.map((v, i) => v - b[i]), y: votes[pair.id] === 'A' ? 1 : votes[pair.id] === 'B' ? 0 : .5 };
  });
  const weights = features.map(() => 0);
  for (let iteration = 0; rows.length && iteration < 300; iteration++) {
    const gradient = weights.map(w => .12 * w);
    for (const row of rows) {
      const utility = row.x.reduce((sum, v, i) => sum + v * weights[i], 0);
      const error = 1 / (1 + Math.exp(-utility)) - row.y;
      row.x.forEach((v, i) => { gradient[i] += error * v / rows.length; });
    }
    weights.forEach((_, i) => { weights[i] -= .4 * gradient[i]; });
  }
  return {
    version: FITTING_VERSION, total: FITTING_PAIRS.length, reviewed: answered.length,
    decisive: answered.filter(pair => votes[pair.id] === 'A' || votes[pair.id] === 'B').length,
    ties: answered.filter(pair => votes[pair.id] === 'tie').length,
    skipped: answered.filter(pair => votes[pair.id] === 'skip').length,
    complete: answered.length === FITTING_PAIRS.length,
    dimensions: axes.map(axis => ({ id: axis.id, label: axis.label, signals: features.flatMap((feature, i) => {
      if (feature.axis !== axis.id) return [];
      const comparisons = rows.filter(row => Math.abs(row.x[i]) > .001).length;
      return comparisons ? [{ label: feature.label, weight: Math.round(weights[i] * 1000) / 1000, comparisons }] : [];
    }).sort((a, b) => b.weight - a.weight) })),
  };
}

export function renderFittingBrief(fit: PreferenceFitting): string {
  if (!fit.reviewed) return '';
  const lines = [`# 玩法对比拟合（已看 ${fit.reviewed}/${fit.total} 组，其中明确二选一 ${fit.decisive} 组、差不多 ${fit.ties} 组、跳过 ${fit.skipped} 组）`];
  for (const dimension of fit.dimensions) {
    const liked = dimension.signals.filter(s => s.weight > .06 && s.comparisons >= 2).slice(0, 3);
    const less = dimension.signals.filter(s => s.weight < -.06 && s.comparisons >= 2).slice(-2);
    if (liked.length || less.length) lines.push(`- ${dimension.label}：${liked.length ? `相对更常选 ${liked.map(s => s.label).join('、')}` : '尚无明显偏向'}${less.length ? `；相对较少选 ${less.map(s => s.label).join('、')}` : ''}。`);
  }
  lines.push('这些是有限问卷中的相对偏好线索，不是人格结论，也不代表绝对不喜欢。跳过不能当作不喜欢；明确雷点、预算及当次时间/地点/人数优先，不能被拟合覆盖。保留适量不同玩法供玩家选择。');
  return lines.join('\n');
}
