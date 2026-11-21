import type { Seed } from '../skills/quest-library/seeds.js';

export const FITTING_VERSION = 'v1';
export type PairAnswer = 'A' | 'B' | 'tie' | 'skip';
export interface FittingDimension {
  id: string;
  label: string;
  signals: { label: string; weight: number; comparisons: number }[];
}
export interface PreferenceFitting {
  version: string;
  total: number;
  reviewed: number;
  decisive: number;
  ties: number;
  skipped: number;
  complete: boolean;
  dimensions: FittingDimension[];
}

// Matched scenarios: each pair holds duration and budget constant. No real action is required.
// The two cards primarily vary one property; metadata also records unavoidable secondary differences.
const card = (title: string, text: string, tags: Partial<Seed> = {}) => ({ title, text, ...tags });
type Card = ReturnType<typeof card>;
function pair(section: string, slug: string, a: Card, b: Card, shared: Partial<Seed> = {}) {
  const seed = (side: string, c: Card): Seed => ({
    id: `fit-${slug}-${side}`, group: 'home', min: 15, budget: '0', scenes: ['家'], people: ['独'],
    energy: '坐', nov: 1, cat: 'sense', mech: '定点观察', ...shared, ...c,
  });
  return { id: `fit-${slug}`, section, when: `同样有 ${shared.min || 15} 分钟，更想做哪件事？`, timeShort: `${shared.min || 15} 分钟`, axis: section, a: seed('a', a), b: seed('b', b) };
}
export const FITTING_PAIRS = [
  pair('玩法口味', 'notice-or-tidy', card('听见房间', '坐一会儿，记下房间里三种声音和它们的来源。'), card('收拾一个抽屉', '把一个小抽屉分类放好，留下一张前后对照。', { cat: 'organize', mech: '触感心流' })),
  pair('玩法口味', 'make-or-sort', card('画一张小卡片', '给自己画一张只有两种颜色的心情卡。', { cat: 'create', mech: '留痕收尾' }), card('整理手机相册', '选出最近的十张照片，分进一个新相册。', { cat: 'organize', mech: '收集图鉴' })),
  pair('玩法口味', 'explore-or-sense', card('发现一条支路', '走进一条不熟悉的小路，记下三处新发现。', { cat: 'explore', mech: '随机委托' }), card('收集沿途声音', '沿熟悉的路慢走，记下三种让你停下来的声音。'), { scenes: ['户外'], energy: '慢' }),
  pair('玩法口味', 'connect-or-create', card('交换一个回忆', '和同伴各讲一段最近让自己笑出来的小事。', { cat: 'connect', mech: '连接动作' }), card('合写一个故事', '和同伴轮流写一句话，拼成一个六句小故事。', { cat: 'create', mech: '留痕收尾' }), { people: ['双'] }),
  pair('玩法口味', 'observe-or-write', card('窗边观察', '坐在窗边，记录眼前正在发生的三件小事。'), card('写一首小诗', '用今天遇到的三个词，写一首四行小诗。', { cat: 'create', mech: '留痕收尾' }), { scenes: ['工位'], min: 10 }),
  pair('活动节奏', 'sit-or-walk', card('长椅看树', '坐在公园长椅上，记录树叶的颜色、形状和动静。', { energy: '坐' }), card('慢走看树', '沿公园小路慢走，记录树叶的颜色、形状和动静。', { energy: '慢' }), { scenes: ['户外'] }),
  pair('活动节奏', 'gentle-or-dance', card('坐着舒展', '坐着放松肩颈与手指，记下一处变轻松的感觉。', { energy: '坐' }), card('跟歌动一动', '选几首喜欢的歌，跟着节奏自由活动身体。', { energy: '动' }), { min: 10, mech: '触感心流' }),
  pair('活动节奏', 'stroll-or-brisk', card('悠悠散步', '和同伴慢慢走一圈，挑一个喜欢的角落停一停。', { energy: '慢' }), card('轻快走一圈', '和同伴用舒适的快步走一圈，感受身体热起来。', { energy: '动' }), { scenes: ['户外'], people: ['双'], mech: '规则限制' }),
  pair('活动节奏', 'desk-or-roam', card('桌上色彩小展', '用桌上现有的小物，摆出三种颜色的小展览。', { energy: '坐' }), card('屋内色彩小展', '在家走走找找，把三种颜色的小物摆成小展览。', { energy: '慢' }), { cat: 'create', mech: '留痕收尾' }),
  pair('活动节奏', 'rest-or-stairs', card('手指放个假', '坐着做几组轻柔手指伸展，给自己留个休息记号。', { energy: '坐' }), card('楼梯走一走', '在方便安全的楼梯慢走几层，不赶时间，累了就停。', { energy: '慢' }), { min: 10, scenes: ['工位'], mech: '触感心流' }),
  pair('新鲜程度', 'label-or-persona', card('给物品写标签', '选三样小物，给它们各写一句准确、简洁的介绍。'), card('给物品起昵称', '选三样小物，根据它们的特点，各起一个有趣的昵称。', { nov: 2 }), { cat: 'create', mech: '视角重赋' }),
  pair('新鲜程度', 'photo-or-angle', card('拍下喜欢的角落', '用自己习惯的角度，拍三张喜欢的房间角落。'), card('换个奇怪角度', '蹲低或靠近物体，拍三张让人猜不出位置的房间角落。', { nov: 3 }), { cat: 'create', mech: '规则限制' }),
  pair('新鲜程度', 'real-or-imagined-color', card('记录今天的颜色', '找三种颜色，写下它们常用的名字和出现的位置。'), card('发明颜色名字', '找三种颜色，给它们起只有自己懂的新名字。', { nov: 3 }), { cat: 'create', mech: '视角重赋' }),
  pair('新鲜程度', 'known-or-random', card('重走喜欢的路线', '沿喜欢的路线走一小圈，记录今天最舒服的一个地方。'), card('让方向带点随机', '在熟悉安全的路口随机选方向，记录途中一个意外发现。', { nov: 3 }), { scenes: ['户外'], energy: '慢', cat: 'explore', mech: '随机委托' }),
  pair('新鲜程度', 'diary-or-cup', card('写下今天的小事', '用自己的视角写四句话，记下今天的一件小事。'), card('假装你是一只杯子', '用桌上杯子的视角写四句话，说说它今天见到了什么。', { nov: 3 }), { cat: 'create', mech: '视角重赋' }),
  pair('独处与陪伴', 'colors-alone-or-pair', card('一个人找颜色', '独自慢走，找齐五种颜色，做一张色彩清单。', { people: ['独'] }), card('两个人找颜色', '和同伴慢走，各找颜色，一起做一张色彩清单。', { people: ['双'] }), { scenes: ['户外'], energy: '慢', cat: 'explore', mech: '收集图鉴' }),
  pair('独处与陪伴', 'song-alone-or-pair', card('自己听一首歌', '安静听一首喜欢的歌，写下最喜欢的一句歌词。', { people: ['独'] }), card('和同伴听一首歌', '一起听一首歌，各自说说最喜欢的一句歌词。', { people: ['双'] })),
  pair('独处与陪伴', 'story-pair-or-group', card('两个人接故事', '和一位朋友轮流说一句话，拼成一个有结尾的故事。', { people: ['双'] }), card('几个人接故事', '和几位朋友轮流说一句话，拼成一个有结尾的故事。', { people: ['众'] }), { cat: 'create', mech: '留痕收尾' }),
  pair('独处与陪伴', 'photos-alone-or-group', card('独自挑三张照片', '挑三张最近的照片，给它们写下小标题。', { people: ['独'] }), card('和朋友分享三张照', '和几位朋友各挑最近的照片，互相讲讲背后的小事。', { people: ['众'] }), { cat: 'connect', mech: '连接动作' }),
  pair('独处与陪伴', 'fold-alone-or-pair', card('自己折一只纸船', '找一张废纸，自己慢慢折一只纸船。', { people: ['独'] }), card('和同伴折纸船', '和同伴各折一只纸船，互相看看对方的小作品。', { people: ['双'] }), { cat: 'create', mech: '触感心流' }),
  pair('场景偏好', 'sounds-home-or-park', card('收集家里的声音', '在家安静听一会儿，写下三种声音的来源。', { scenes: ['家'] }), card('收集公园的声音', '在附近公园听一会儿，写下三种声音的来源。', { scenes: ['户外'] })),
  pair('场景偏好', 'colors-desk-or-street', card('工位颜色清单', '在工位附近慢慢找，记下五种颜色和对应物品。', { scenes: ['工位'] }), card('街边颜色清单', '沿附近街道慢慢找，记下五种颜色和对应物品。', { scenes: ['户外'] }), { energy: '慢', cat: 'explore', mech: '收集图鉴' }),
  pair('场景偏好', 'sketch-home-or-park', card('家里画个小角落', '坐在家里，画下眼前一个角落，不用画得像。', { scenes: ['家'] }), card('公园画个小角落', '坐在公园，画下眼前一个角落，不用画得像。', { scenes: ['户外'] }), { cat: 'create', mech: '留痕收尾' }),
  pair('场景偏好', 'cloud-window-or-outside', card('窗边看云', '从家里窗边看云，给三朵云各起一个名字。', { scenes: ['家'] }), card('户外看云', '在户外找个舒服的位置，给三朵云各起一个名字。', { scenes: ['户外'] }), { mech: '视角重赋' }),
  pair('场景偏好', 'tidy-home-or-desk', card('整理家里的一角', '把家里的一个小抽屉分好类，记录最满意的变化。', { scenes: ['家'] }), card('整理工位的一角', '把工位的一个小抽屉分好类，记录最满意的变化。', { scenes: ['工位'] }), { cat: 'organize', mech: '触感心流' }),
  pair('玩法机制', 'random-or-rule', card('交给随机选', '在熟悉安全的范围里随机选一条支路，记录一个新发现。', { mech: '随机委托' }), card('给路线加条规则', '在熟悉安全的范围里只选有树荫的路，记录一个新发现。', { mech: '规则限制' }), { scenes: ['户外'], energy: '慢', cat: 'explore' }),
  pair('玩法机制', 'guess-or-repeat', card('闭眼猜小物', '闭眼摸摸布袋里的安全小物，猜猜它是什么，再核对答案。', { mech: '盲盒猜谜' }), card('慢慢叠一张纸', '把一张废纸反复折出整齐的纹路，留意手指和纸面的触感。', { mech: '触感心流' })),
  pair('玩法机制', 'invent-or-observe', card('给小物编故事', '选一件桌上小物，给它编一段三句话的小故事。', { mech: '视角重赋' }), card('给小物做观察', '选一件桌上小物，认真记录三处以前没注意过的细节。', { mech: '定点观察' })),
  pair('玩法机制', 'collect-or-caption', card('凑一组颜色图鉴', '在附近找五样同色的小物，拍成一组颜色图鉴。', { mech: '收集图鉴' }), card('留下一张小照片', '在附近选最喜欢的一样小物，拍照并配一句图说。', { mech: '留痕收尾' }), { scenes: ['户外'], energy: '慢', cat: 'create' }),
  pair('玩法机制', 'role-or-connect', card('未来的你来写信', '假装是一年后的自己，给现在的自己写三句鼓励。', { mech: '角色扮演' }), card('给朋友写感谢', '给一位朋友写三句具体的感谢，是否发送由你决定。', { mech: '连接动作' }), { cat: 'connect' }),
].map((pair, index) => index % 2 ? { ...pair, a: pair.b, b: pair.a } : pair);
