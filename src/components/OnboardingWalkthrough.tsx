import { useEffect, useRef, useState } from 'react';
import { GuideNarration } from './GuideNarration';

const activities = [
  { title: '给桌上的小物办个展', instruction: '挑两件手边的小物，摆成一场微型展览。给展览起个名字，再写一句展签，说说它们为什么被放在一起。', example: '展名：《今晚暂停营业》。我把钥匙放在合上的笔记本旁：一个结束了今天的奔波，一个收起了今天的待办，现在一起休息。', response: '钥匙和笔记本都有了休息的理由，这场小展览也留下了今晚的心情。', mark: '▧' },
  { title: '给手边的小物取个名字', instruction: '挑一件每天会用到的小物，给它取个名字，写一句这个名字的由来。', example: '我把台灯叫作“小月亮”，因为每天夜里它都会陪着我看一会儿书。', response: '每天都在的小物，也可以有一个属于你的名字。', mark: '✎' },
  { title: '找一种窗外的声音', instruction: '在窗边听一会儿，写下你听见了什么，以及它让你想到的画面。', example: '风吹过树叶沙沙响，像有人在轻轻翻一本很厚的书。', response: '原来窗外的声音，也能让你想起一个画面。', mark: '♫' },
  { title: '写一句给明天的话', instruction: '想想明天的自己，写一句具体的提醒或祝愿，告诉自己为什么。', example: '明天午休去楼下走走吧，今天一整天坐着，想让眼睛看看远处的树。', response: '你给明天的自己，留了一个可以做到的小约定。', mark: '✉' },
];
const phrases = ['我有15分钟，在家想放松一下', '今天有点累，想做件轻松的小事'];

/** A local rehearsal. Nothing here calls the model or writes personal records. */
export function OnboardingWalkthrough({ step, onComplete, onPhrase }: {
  step: number;
  onComplete: (step: number, complete: boolean) => void;
  onPhrase: (phrase: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [phrase, setPhrase] = useState('');
  const [sent, setSent] = useState(false);
  const [reply, setReply] = useState(false);
  const [batch, setBatch] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [evidence, setEvidence] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState('');
  const [bookOpen, setBookOpen] = useState(false);
  const [shelf, setShelf] = useState(2);
  const activity = activities[choice ?? 0];
  useEffect(() => {
    onComplete(step, (step === 1 && reply) || (step === 2 && choice !== null) || (step === 3 && !!submitted) || (step === 4 && bookOpen));
  }, [step, reply, choice, submitted, bookOpen, onComplete]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // Replacing a clicked send/submit button must not leave keyboard focus on body.
      if (document.activeElement === document.body) root.current?.focus({ preventScroll: true });
      root.current?.querySelector<HTMLElement>('.walk-focus')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, !!phrase, sent, reply, choice, batch, submitted, bookOpen, shelf]);
  function choose(index: number) {
    if (index !== choice) { setEvidence(''); setSubmitted(''); }
    setChoice(index);
  }
  function submit() {
    if (!evidence.trim()) { setError('先写下你的发现，或点「填入示例记录」试一试。'); return; }
    setError(''); setSubmitted(evidence.trim());
  }
  return <div ref={root} className="walkthrough" tabIndex={-1}>
    <div className="walk-stage-label">演示内容，不会存入个人记录</div>
    {step === 1 && <>
      {!sent ? <GuideNarration lines={[
        '就从下班后的这 15 分钟开始：你在家，有点累，想找件轻松又有趣的事。',
        '把地点、空闲时间和心情告诉吱呀就好，不用先替自己想好活动。',
        '点一句开场话，或写下自己的情况，再点「发送」。这里先用演示走一遍。',
      ]}>
        {!phrase && <div className="app-guide-options walk-focus">
          {phrases.map(text => <button key={text} aria-pressed={phrase === text} onClick={() => { setPhrase(text); onPhrase(text); }}>{text}</button>)}
        </div>}
        <form className={`walk-composer ${phrase ? 'walk-focus' : ''}`} onSubmit={e => { e.preventDefault(); if (phrase.trim()) setSent(true); }}>
          <label className="sr-only" htmlFor="guide-chat-input">试着告诉吱呀</label>
          <input id="guide-chat-input" value={phrase} placeholder="也可以写下你此刻的情况" onChange={e => { setPhrase(e.target.value); onPhrase(e.target.value); }} />
          <button type="submit" disabled={!phrase.trim()}>发送 ↑</button>
        </form>
      </GuideNarration> : <>
        <details className="walk-history"><summary>刚才说的话</summary><div className="app-guide-bubble">{phrase}</div></details>
        <GuideNarration label="吱呀 · 演示回复" onReady={() => setReply(true)} lines={[
          '忙了一天，就从手边的小物玩起吧。不用出门，也不用准备材料。',
          '可以给它们办个小展览，或给一件日用品取个名字。点「下一页」，选一个你想试的。',
        ]} />
      </>}
      <details className="walk-history"><summary>也想用语音聊聊？</summary><p>首页按住语音按钮说话，松开发送。进入聊天后点「沉浸」，可以边说边听。</p></details>
    </>}
    {step === 2 && <GuideNarration lines={choice === null ? [
      '这两件事都适合在家玩十几分钟：给小物办个展，或给日用品取个新名字。',
      '点一张感兴趣的卡片。都不想做？可以点「换一批」。',
    ] : [
      `你选了「${activity.title}」。`,
      activity.instruction,
      '照着这一步在现实里玩一会儿，再留下你的作品。点「下一页」，先体验怎么提交。',
    ]}>
      <div className={`app-guide-choices ${choice === null ? 'walk-focus' : 'walk-soft'}`} key={`cards-${batch}`}>
        {activities.slice(batch * 2, batch * 2 + 2).map((card, i) => <button key={card.title} className="walk-arrive" style={{ animationDelay: `${i * 120}ms` }} aria-pressed={choice === batch * 2 + i} onClick={() => choose(batch * 2 + i)}>
          <span aria-hidden>{card.mark}</span><strong>{card.title}</strong><small>{choice === batch * 2 + i ? '✓ 已选中' : '约 15 分钟 · 在家'}</small>
        </button>)}
      </div>
      <button className="app-guide-text-button" onClick={() => { setBatch(v => 1 - v); setChoice(null); setSubmitted(''); setEvidence(''); }}>换一批 ↻</button>
    </GuideNarration>}
    {step === 3 && <>
      <div className={`app-guide-proof ${submitted ? 'walk-soft' : ''}`}>
        <span className="app-guide-stamp">演示任务 · 第 1 步</span><h2>{activity.title}</h2>
      </div>
      {!submitted ? <GuideNarration lines={[
        activity.instruction,
        '做完后，写下你做了什么、发现了什么，或留下刚才创作的文字，再点「提交记录」。',
        '现在先练习一下：点「填入示例记录」，就能体验提交过程。',
      ]}>
        <div className="walk-evidence walk-focus">
          <label htmlFor="guide-evidence">这一步，你发现了什么？</label>
          <textarea id="guide-evidence" value={evidence} rows={3} placeholder="把看到、听到或做出的具体内容写下来…" onChange={e => { setEvidence(e.target.value); setError(''); }} />
          {error && <p role="alert">{error}</p>}
          <div className="walk-evidence-actions"><button className="app-guide-text-button" onClick={() => setEvidence(activity.example)}>填入示例记录</button><button className="walk-primary" onClick={submit}>提交记录 →</button></div>
        </div>
      </GuideNarration> : <GuideNarration lines={[
        '这段发现，已经放进演示的记录页了。',
        '点「下一页」打开「我的手册」，就能找到刚才这段文字。',
      ]}><div className="walk-receipt walk-focus walk-arrive">
        <span className="walk-receipt-stamp" aria-hidden>✓</span><strong>演示：这份发现已放进记录页</strong><blockquote>{submitted}</blockquote>
        <button className="app-guide-text-button" onClick={() => setSubmitted('')}>返回修改记录</button>
      </div></GuideNarration>}
      <details className="walk-history"><summary>正式任务怎样确认完成？</summary><p>卡片会说明需要文字、照片还是位置。提交后，吱呀会确认是否符合要求；缺少细节时，会告诉你补充什么。原始内容都会保留。</p></details>
    </>}
    {step === 4 && <>
      {!bookOpen ? <GuideNarration lines={[
        '过几天想回看这晚的小作品，或接着做上次的心愿，都可以打开「我的手册」。',
        '首页和聊天页都有这个入口。现在点一下，看看你的记录在哪里。',
      ]}>
        <button className="walk-book-button walk-focus" onClick={() => setBookOpen(true)}><span aria-hidden>▤</span>我的手册 <b aria-hidden>↗</b></button>
      </GuideNarration> : <div className="walk-open-book walk-arrive">
        <div className="walk-book-title">我的手册<span>演示</span></div>
        <GuideNarration lines={shelf === 2 ? [
          '下班后的小创作、周末散步的发现，会连同文字、照片一起留在「日常记录」里。',
          '下面就是刚才的发现。再点「心愿计划」，看看长期想做的事怎么安排。',
        ] : shelf === 1 ? [
          '想重新捡起画画，却只有零碎时间？在「心愿计划」里，分成几章慢慢做。',
          '每一章接着上一章的成果，没有每日打卡。再点「喜好」，看看推荐如何更合心意。',
        ] : [
          '喜欢安静、暂时不想拍照，都可以记在「喜好」里。',
          '吱呀推荐时会参考它们，你也随时能改。下一步可以填写自己的喜好。',
        ]}>
        <div className="app-guide-shelves walk-focus" role="group" aria-label="认识手册栏目">
          {['喜好', '心愿计划', '日常记录'].map((label, i) => <button key={label} className={(shelf === 2 && i === 1) || (shelf === 1 && i === 0) ? 'walk-tab-target' : ''} aria-pressed={shelf === i} onClick={() => setShelf(i)}>{label}</button>)}
        </div>
        <div className="walk-book-page walk-arrive" key={`shelf-${shelf}`}>
          {shelf === 2 ? <><span className="walk-paper-date">刚刚 · 体验记录</span><h2>{activity.title}</h2><blockquote>{submitted || activity.example}</blockquote></>
            : shelf === 1 ? <><h2>心愿：重新捡起画画</h2><ol className="walk-chapters">{['画一件手边的小物', '试着画一处光影', '选几张画，做成一本小册'].map((text, i) => <li key={text} className="walk-arrive" style={{ animationDelay: `${i * 130}ms` }}><span>{i + 1}</span>{text}</li>)}</ol></>
            : <><h2>让推荐慢慢懂你</h2><div className="walk-preference-tags"><span>喜欢安静</span><span>每次 15 分钟</span><span>雷点：不拍照</span></div></>}
        </div>
        </GuideNarration>
      </div>}
    </>}
  </div>;
}
