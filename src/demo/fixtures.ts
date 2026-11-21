import { FITTING_PAIRS } from '../../server/agent/profile/fitting-pairs';
import { fitPreferences } from '../../server/agent/profile/preference-model';
import type { Goal, GoalInput, GoalPlan } from '../../server/goals-types';
import type { InspirationTask } from '../../server/inspiration-types';
import type { QuestThread } from '../../server/quest-thread-types';
import type { ActivityPlan, DesiredOutcome, HandbookView, PairAnswer, QuestCategory, QuestRecord, UserProfile } from '../types';

export type DemoQuestRecord = QuestRecord & { desiredOutcomes: DesiredOutcome[] };
export interface DemoInspiration {
  id: string; createdAt: string; enabled: boolean; rawInput: string;
  sourceUrl?: string; sourceText: string; sourceNotice?: string; task: InspirationTask;
}

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
/** Local illustrations are evidence samples. They never fetch external image services. */
export function demoEvidenceImage(title = '今天的小小发现', color = '#728c70', variant = 0): string {
  const art = variant % 3 === 0
    ? '<path d="M80 221 Q160 127 240 221 T400 221" fill="none" stroke="#779679" stroke-width="28"/><path d="M0 284 Q150 192 320 276 T640 252V400H0Z" fill="#b3c0a4"/><path d="M0 323 Q180 235 360 323 T640 300V400H0Z" fill="#78917a"/><path d="M278 400Q325 320 356 294" fill="none" stroke="#ede4cb" stroke-width="34"/>'
    : variant % 3 === 1
      ? '<rect x="157" y="93" width="320" height="228" rx="6" fill="#fffaf0" transform="rotate(-6 320 200)"/><path d="M212 148h202M212 170h170M212 192h190" stroke="#9aa796" stroke-width="6" stroke-linecap="round"/><path d="M266 256c-44-33 4-65 24-31 20-34 68-2 24 31l-24 20Z" fill="#d69d88"/><path d="M390 223l-20 70" stroke="#738370" stroke-width="12" stroke-linecap="round"/>'
      : '<path d="M140 270Q185 220 230 270T320 270T410 270T500 270" fill="none" stroke="#fff8e9" stroke-width="8" stroke-linecap="round"/><path d="M130 195v-16m30 43v-70m30 91V134m30 110v-94m30 73v-51m30 28v-11m30 31v-54m30 73V141m30 109V121m30 113v-64m30 51v-22m30 8v-50m30 61v-33" stroke="#768d7c" stroke-width="10" stroke-linecap="round"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#e8e5d6"/><circle cx="520" cy="85" r="44" fill="#e4bd82"/>${art}<rect x="20" y="20" width="230" height="36" rx="18" fill="${xml(color)}"/><text x="38" y="44" font-family="sans-serif" font-size="17" fill="white">${xml(title.slice(0, 12))}</text><text x="610" y="378" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3b5142">吱呀 · 演示作品</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEMO_PHOTO_URL = demoEvidenceImage('我的声音小地图', '#728c70', 2);
export const DEMO_SUBMISSION_TEXT = '我听到了窗外的鸟鸣、杯子轻碰桌面的声音，还有远处的脚步声。最想留下鸟鸣，它让我慢了下来。';

export function demoStepSample(instruction: string) {
  const [title, text, variant] = /硬币|魔术|手法/.test(instruction)
    ? ['朋友的小惊喜', '我练习了硬币消失的手法，放慢动作后自然多了。想在周末聚会时表演给朋友看。', 1] as const
    : /朋友|欣赏|便签|卡片/.test(instruction)
      ? ['想送给你的话', '我想告诉朋友：谢谢你上次认真听我讲完，那天我觉得自己被接住了。', 1] as const
      : /街|散步|路线|角落|照片|细节/.test(instruction)
        ? ['路上的小发现', '我发现街角的树影像一条河，把这次发现叫作「通向天空的小路」。下次还想换个时间来看看。', 0] as const
        : /声音|地图|小诗/.test(instruction)
          ? ['窗边的慢时光', /起个名字|感受|四行|小诗/.test(instruction) ? '窗边的慢时光：水壶唱起晨歌，杯子接住清醒，窗外有一只鸟，替今天按下开始。' : DEMO_SUBMISSION_TEXT, 2] as const
          : /颜色|色彩/.test(instruction)
            ? ['今天的三种颜色', '雾蓝是清晨的安静，暖橙是午后的阳光，墨绿是傍晚散步时的树影。', 0] as const
            : ['今天的小小收获', '我从身边的小事开始尝试，留下今天的小小收获，也找到了下次想继续的一步。', 1] as const;
  return { text, photoUrl: demoEvidenceImage(title, '#728c70', variant) };
}

export function createDemoProfile(clientId: string, now = Date.now()): UserProfile {
  const pairVotes = Object.fromEntries(FITTING_PAIRS.map((pair, index) => [pair.id, (index % 7 === 0 ? 'tie' : index % 3 === 0 ? 'B' : 'A') as PairAnswer]));
  return {
    clientId, createdAt: new Date(now - 25 * 86400000).toISOString(), updatedAt: new Date(now).toISOString(),
    onboarded: true, mbti: 'INFP', activityPreference: 'quiet', desiredOutcomes: ['relax', 'surprise', 'express', 'connect', 'grow'],
    energy: '慢', novelty: 2, social: 'solo', budget: 'free', mechs: ['定点观察', '留痕收尾', '视角重赋'],
    interests: '喜欢散步、声音、手写小卡片，也想学会一点能分享给朋友的新本领。', avoids: '高强度运动、昂贵材料、向陌生人搭话',
    pairVotes, fitting: fitPreferences(pairVotes), fittingUpdatedAt: new Date(now).toISOString(),
  };
}

const history: { title: string; category: QuestCategory; outcomes: DesiredOutcome[]; tags: string[]; text: string }[] = [
  { title: '给自己留一首歌的时间', category: 'sense', outcomes: ['relax'], tags: ['声音', '独处'], text: '把手机翻过去，听完了一整首歌。前奏里的雨声特别温柔。' },
  { title: '发现回家路上的小花园', category: 'explore', outcomes: ['surprise', 'relax'], tags: ['散步', '观察'], text: '平时路过的巷子里，原来藏着一小片迷迭香。' },
  { title: '写一张不用寄出的明信片', category: 'create', outcomes: ['express', 'connect'], tags: ['手写', '回忆'], text: '写给大学时一起看日落的朋友：还记得那天的橘子汽水吗？' },
  { title: '和朋友交换一件小确幸', category: 'connect', outcomes: ['connect'], tags: ['朋友', '分享'], text: '我讲了早晨的鸟鸣，朋友讲了今天收到的一句鼓励。' },
  { title: '听见房间里的三种声音', category: 'sense', outcomes: ['relax', 'grow'], tags: ['声音', '观察'], text: '冰箱的低鸣、窗外的树叶声和杯沿的叮声。安静里也有很多层次。' },
  { title: '用三种颜色记下今天', category: 'create', outcomes: ['express'], tags: ['色彩', '记录'], text: '雾蓝是早晨，暖橙是午后，墨绿是傍晚散步。' },
  { title: '换个角度拍一棵树', category: 'explore', outcomes: ['surprise', 'express'], tags: ['散步', '摄影'], text: '从树根往上看，树枝像一条通向天空的河。' },
  { title: '学会一个硬币小魔术', category: 'create', outcomes: ['grow', 'connect'], tags: ['魔术', '朋友'], text: '练习了硬币消失的手法。朋友最惊讶的，其实是我终于敢表演了。' },
  { title: '给书桌腾出一块空白', category: 'organize', outcomes: ['relax'], tags: ['整理', '独处'], text: '只留下台灯、一本书和水杯。坐下时肩膀也跟着松了一点。' },
  { title: '给朋友画一张声音明信片', category: 'create', outcomes: ['express', 'connect', 'grow'], tags: ['声音', '手写', '朋友'], text: '把鸟鸣画成三个上扬的音符，旁边写上：这是今天想送给你的清晨。' },
  { title: '跟着好奇走进一条支路', category: 'explore', outcomes: ['surprise'], tags: ['散步', '观察'], text: '拐进有猫脚印的小巷，发现了一家只卖三种面包的小店。' },
  { title: '认真夸奖一个熟悉的人', category: 'connect', outcomes: ['connect', 'express'], tags: ['朋友', '分享'], text: '告诉朋友：你每次认真听我说话的时候，我都觉得自己被接住了。' },
  { title: '给一片叶子画轮廓', category: 'create', outcomes: ['relax', 'grow'], tags: ['观察', '手写'], text: '慢慢描完叶脉，才发现左右并不完全对称。' },
  { title: '把日常声音排成小诗', category: 'create', outcomes: ['express', 'grow'], tags: ['声音', '记录'], text: '水壶唱起晨歌／杯子接住清醒／窗外有一只鸟／替今天按下开始。' },
  { title: '把小魔术表演给朋友看', category: 'connect', outcomes: ['grow', 'surprise', 'connect'], tags: ['魔术', '朋友'], text: '朋友真的没看出来！我把这个小惊喜留在了晚饭后。' },
];

export function createDemoQuests(now = Date.now()): DemoQuestRecord[] {
  return history.map((item, index) => {
    const date = new Date(now - (history.length - index) * 86400000).toISOString();
    return {
      id: `demo-quest-${index + 1}`, title: item.title, category: item.category, desiredOutcomes: item.outcomes,
      tags: item.tags, steps: 2, evidence: item.text, date,
      stepDetails: [
        { instruction: `尝试「${item.title}」，留意让你停下来的一刻。`, submissionType: 'photo', evidence: { type: 'photo', photoUrl: demoEvidenceImage(item.title, '#728c70', index), text: item.text, at: date } },
        { instruction: '给这次体验留一句话。', submissionType: 'text', evidence: { type: 'text', text: item.text, at: date } },
      ],
    };
  });
}

export function createDemoHandbook(clientId: string, now = Date.now()): HandbookView {
  return refreshDemoHandbook({ clientId, quests: createDemoQuests(now).reverse(), badges: [
    { id: 'first-quest', name: '第一次出发', desc: '完成你的第一条支线', earned: true, progress: 1, target: 1, unlockedAt: new Date(now - 15 * 86400000).toISOString() },
    { id: 'five-flavors', name: '五味生活', desc: '试过五种不同的玩法', earned: true, progress: 5, target: 5, unlockedAt: new Date(now - 8 * 86400000).toISOString() },
    { id: 'ten-quests', name: '好奇心收藏家', desc: '完成十条支线', earned: true, progress: 10, target: 10, unlockedAt: new Date(now - 5 * 86400000).toISOString() },
    { id: 'twenty-quests', name: '生活探险家', desc: '完成二十条支线', earned: false, progress: 15, target: 20 },
  ], stats: { total: 0, weekCount: 0, earnedCount: 0, byCategory: { explore: 0, organize: 0, create: 0, connect: 0, sense: 0 } } }, now);
}

export function refreshDemoHandbook(view: HandbookView, now = Date.now()): HandbookView {
  const byCategory = { explore: 0, organize: 0, create: 0, connect: 0, sense: 0 };
  for (const quest of view.quests) byCategory[quest.category]++;
  view.stats = { total: view.quests.length, weekCount: view.quests.filter(q => now - Date.parse(q.date) < 7 * 86400000).length, earnedCount: view.badges.filter(b => b.earned).length, byCategory };
  return view;
}

export function createDemoThreads(now = Date.now()): QuestThread[] {
  const date = new Date(now).toISOString();
  return [
    { id: 'demo-thread-sounds', title: '把日常听成一首诗', description: '从听见声音，到留下作品，再把它分享给朋友。', questIds: ['demo-quest-1', 'demo-quest-5', 'demo-quest-10', 'demo-quest-14'], createdAt: date, updatedAt: date },
    { id: 'demo-thread-courage', title: '把小小勇气送出去', description: '从独自练习，到试着表达，再到和朋友分享惊喜。', questIds: ['demo-quest-3', 'demo-quest-8', 'demo-quest-12', 'demo-quest-15'], createdAt: date, updatedAt: date },
  ];
}

export function createDemoActivities(round = 0): ActivityPlan[] {
  const items: ActivityPlan[] = [
    { id: 'demo-activity-sound', title: '做一张声音小地图', hook: '闭上眼，熟悉的房间会出现一张新地图。', tags: ['10 分钟', '在家', '声音', '零花费'], category: 'sense', steps: [
      { instruction: '安静听一会儿，找出身边三种不同的声音。', hint: '可以是窗外的鸟鸣、水杯的碰撞，或远处的脚步。', submissionType: 'text', completionCriteria: '记录三种声音', proofPrompt: '你听见了什么？', suggestedSeconds: 0 },
      { instruction: '把这三种声音在纸上画成符号，按它们的位置排成一张小地图。', hint: '不必会画画，圆点、波浪和箭头就够了。', submissionType: 'photo', completionCriteria: '留下一张声音小地图', proofPrompt: '拍下你的声音小地图', suggestedSeconds: 0 },
      { instruction: '给这张地图起个名字，再留下一句此刻的感受。', hint: '比如「窗边的慢时光」：原来安静也可以这么热闹。', submissionType: 'text', completionCriteria: '地图名字与一句感受', proofPrompt: '地图叫什么名字？', suggestedSeconds: 0 },
    ] },
    { id: 'demo-activity-friend', title: '给朋友一份小小惊喜', hook: '把平时没说出口的欣赏，变成一张小卡片。', tags: ['5 分钟', '手写', '朋友', '零花费'], category: 'connect', steps: [
      { instruction: '想起一位朋友，写下一件你欣赏他的小事。', hint: '选具体的一次经历，就像当面聊天那样写。', submissionType: 'text', completionCriteria: '一件具体欣赏的小事', proofPrompt: '你想对他说什么？' },
      { instruction: '把这句话写在便签上，给它画一个小小的符号。', hint: '可以送出去，也可以先收好，等合适的时候。', submissionType: 'photo', completionCriteria: '留下便签或卡片的照片', proofPrompt: '留下这份小心意' },
    ] },
    { id: 'demo-activity-angle', title: '拍下熟悉角落的新面孔', hook: '换一个视角，看看每天路过的地方藏着什么。', tags: ['8 分钟', '摄影', '观察', '零花费'], category: 'explore', steps: [
      { instruction: '选一个熟悉又安全的角落，靠近一点或换个角度，拍下一个平时没注意的细节。', submissionType: 'photo', completionCriteria: '一张日常角落的新视角照片', proofPrompt: '你发现了什么新细节？' },
      { instruction: '给照片起一个有趣的名字，说说它让你想到了什么。', submissionType: 'text', completionCriteria: '照片名称和联想', proofPrompt: '给这次发现留一句话' },
    ] },
    { id: 'demo-activity-magic', title: '学会一个能分享的小魔术', hook: '练一个硬币消失的小手法，为相聚准备一点惊喜。', tags: ['10 分钟', '魔术', '练习', '零花费'], category: 'create', steps: [
      { instruction: '找一枚硬币，对着镜子练习从一只手自然地移到另一只手，留意视线和手指的配合。', submissionType: 'text', completionCriteria: '记下一处练习发现', proofPrompt: '哪一个动作还需要放慢？' },
      { instruction: '给这次魔术练习留一张照片，再记下想表演给谁看。', submissionType: 'photo', completionCriteria: '留下练习记录', proofPrompt: '记下这次练习' },
    ] },
    { id: 'demo-activity-colors', title: '用三种颜色记下今天', hook: '不用画得像，让颜色替今天说几句话。', tags: ['5 分钟', '色彩', '记录', '零花费'], category: 'create', steps: [
      { instruction: '选三种颜色，分别对应今天的三个时刻，写下你为什么选它们。', submissionType: 'text', completionCriteria: '三种颜色与对应的时刻', proofPrompt: '今天是什么颜色？' },
      { instruction: '把三种颜色排在纸上，拍下这张属于今天的小画。', submissionType: 'photo', completionCriteria: '留下一张色彩记录', proofPrompt: '收好今天的颜色' },
    ] },
    { id: 'demo-activity-walk', title: '画一条想再走一次的路', hook: '把熟悉的散步路线，变成一张藏着发现的地图。', tags: ['15 分钟', '散步', '观察', '零花费'], category: 'explore', steps: [
      { instruction: '回想最近一次散步，记下沿途三个让你想停留的地方。', submissionType: 'text', completionCriteria: '三处散步发现', proofPrompt: '哪三处值得再去？' },
      { instruction: '把这三个地方连成一条路线，画下来并拍照留存。', submissionType: 'photo', completionCriteria: '一张散步路线图', proofPrompt: '留下这条想再走的路' },
    ] },
  ];
  const offset = (round % 2) * 3;
  return items.slice(offset, offset + 3);
}

export const DEMO_GOAL_INPUT: GoalInput = {
  wish: '做一本自己的日常声音小册', motivation: '重新发现生活里那些被忽略的小声音', preferences: '安静、观察、文字和简单涂鸦', avoid: '不录下他人的私密谈话', minutes: 10, scene: 'any',
};

export function createDemoGoalPlan(input: GoalInput = DEMO_GOAL_INPUT): GoalPlan {
  const isSound = /声音/.test(input.wish);
  const isMagic = /魔术/.test(input.wish);
  const isWalk = /散步|城市|街区/.test(input.wish);
  const titles = isSound ? ['收集熟悉的声音', '画一张声音小地图', '把声音写成一页小册'] : isMagic ? ['看懂一个硬币小魔术', '练习自然的手法', '给朋友表演一次'] : isWalk ? ['发现一条熟悉的街', '画一张散步路线图', '留下第一篇城市观察'] : ['试一小步', '找到自己的做法', '留下第一个小成果'];
  const instructions = isSound ? ['安静听一会儿，记下三种声音和它们的位置。', '把上次的声音画成三个符号，放在一张小地图上。', '从前两次的发现里选一处，写成一段四行的小诗。'] : isMagic ? ['观察一个硬币魔术，记下视线和手指配合的关键。', '对着镜子练习硬币手法，记下一处变自然的动作。', '把硬币魔术表演给朋友看，记下他的反应。'] : isWalk ? ['回想熟悉街区的三个细节，选一处开始观察。', '把上次发现的街角连成一张散步路线图。', '选取一次散步的细节，写下第一篇城市观察日记。'] : [`写下「${input.wish}」最想尝试的一小步。`, '尝试上次选的小事，记下你想继续改进的一点。', '整理前两次的发现，留下第一个属于自己的小成果。'];
  return { title: input.wish || DEMO_GOAL_INPUT.wish, outcome: isSound ? '把三次日常发现，变成一本属于自己的声音小册。' : `把「${input.wish}」拆成三次轻松的尝试。`, chapters: titles.map((title, index) => ({
    id: `chapter-${index + 1}`, title, purpose: ['从熟悉的生活开始观察。', '把上次的发现变成看得见的作品。', '整理前两次的收获，形成一份能分享的小作品。'][index],
    connection: index ? `接着「${titles[index - 1]}」留下的发现，继续向前一步。` : '先收集素材，为后面的创作打底。',
    outcome: title, minutes: input.minutes || 10, scene: input.scene || 'any', category: isMagic ? index === 2 ? 'connect' : 'create' : isWalk ? 'explore' : index ? 'create' : 'sense',
    steps: [
      { instruction: instructions[index], submissionType: 'text', completionCriteria: '留下一份具体的观察或创作', proofPrompt: '把这次的小发现写下来' },
      { instruction: `给「${title}」留下的作品起个名字，拍照留存。`, hint: '你可以继续完善，也可以先留下此刻的样子。', submissionType: 'photo', completionCriteria: '留下一张作品照片', proofPrompt: '拍下你的作品' },
    ],
  })) };
}

export function createDemoGoals(now = Date.now()): Goal[] {
  const date = (days: number) => new Date(now - days * 86400000).toISOString();
  const active: Goal = { id: 'demo-goal-sounds', input: { ...DEMO_GOAL_INPUT }, plan: createDemoGoalPlan(), status: 'active', createdAt: date(9), records: [], rewards: [] };
  active.records = [{ chapterId: active.plan.chapters[0].id, sessionId: 'demo-past-sounds', at: date(5), steps: active.plan.chapters[0].steps.map(step => ({ ...step, submittedEvidence: { type: step.submissionType, text: DEMO_SUBMISSION_TEXT, ...(step.submissionType === 'photo' ? { photoUrl: DEMO_PHOTO_URL } : {}), at: date(5) } })) }];
  active.rewards = [{ id: 'first', name: '第一片拼图', description: '为自己的声音小册收好了第一份素材。', at: date(5) }];
  const input = { ...DEMO_GOAL_INPUT, wish: '把周末散步变成城市观察日记', motivation: '多认识一点生活的城市', scene: 'outdoors' as const };
  const draft: Goal = { id: 'demo-goal-city', input, plan: createDemoGoalPlan(input), status: 'draft', createdAt: date(1), records: [], rewards: [] };
  const completedInput = { ...DEMO_GOAL_INPUT, wish: '学会一个能表演给朋友的小魔术', motivation: '为相聚制造一点惊喜' };
  const completed: Goal = { id: 'demo-goal-magic', input: completedInput, plan: createDemoGoalPlan(completedInput), status: 'completed', createdAt: date(20), records: [], rewards: [] };
  completed.plan.chapters.forEach((chapter, index) => { chapter.title = ['看懂一个硬币小魔术', '练习自然的手法', '给朋友表演一次'][index]; });
  completed.records = completed.plan.chapters.map((chapter, index) => ({ chapterId: chapter.id, sessionId: `demo-past-magic-${index}`, at: date(12 - index * 3), steps: chapter.steps.map(step => ({ ...step, submittedEvidence: { type: step.submissionType, text: '手法变得自然了，朋友的笑声就是最好的奖励。', ...(step.submissionType === 'photo' ? { photoUrl: demoEvidenceImage('朋友的小惊喜', '#9d817e', 1) } : {}), at: date(12 - index * 3) } })) }));
  completed.rewards = ['first', 'half', 'complete'].map((id, index) => ({ id, name: ['第一片拼图', '渐渐成形', '愿望成册'][index], description: '从独自练习到第一次表演，你真的做到了。', at: date(12 - index * 3) }));
  return [active, draft, completed];
}

export function createDemoInspirations(now = Date.now()): DemoInspiration[] {
  return [
    { title: '用三片叶子做一张秋日拼贴', description: '散步时观察三片落叶，用它们的形状和颜色排成一张小画。', tags: ['散步', '手作'], category: 'create' as const, scene: 'outdoors' as const },
    { title: '给朋友做一份声音盲盒', description: '选三种日常声音，让朋友猜猜它们来自哪里，再交换彼此的答案。', tags: ['声音', '朋友'], category: 'connect' as const, scene: 'any' as const },
    { title: '为房间画一张光影地图', description: '找到午后光线停留的三个位置，把它们画成简单的轮廓。', tags: ['观察', '摄影'], category: 'sense' as const, scene: 'home' as const },
  ].map((task, index) => ({ id: `demo-inspiration-${index + 1}`, createdAt: new Date(now - index * 86400000).toISOString(), enabled: index !== 2, rawInput: task.description, sourceText: task.description, task: { ...task, hook: '把喜欢的小事，变成下一次可以出发的支线。', minutes: 10, people: 1, cost: 0, energy: 'low', materials: '使用身边现有的材料就好。' } }));
}
