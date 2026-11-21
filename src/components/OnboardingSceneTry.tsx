import { useEffect, useRef, useState } from 'react';

const scenes = {
  home: {
    prompt: '周末一个人在家，有15分钟，想做点有趣的事',
    reply: '就用手边的小物，办一场只属于你的展览吧。',
    title: '给桌上的小物办个展',
    step: '挑两件手边的物品，摆在一起。给展览起个名字，写一句它们为什么在一起。',
    example: '《今晚暂停营业》：钥匙和合上的笔记本，一个结束了奔波，一个收起了待办，现在一起休息。',
    label: '你的展名和展签',
  },
  friends: {
    prompt: '和朋友排队等车，还有5分钟，想一起玩点什么',
    reply: '来一轮默契猜物吧，站在原地也能玩。',
    title: '三个线索，猜猜我选了什么',
    step: '选一个你们都能看见的物件，先不说答案。给朋友三个线索，让对方猜；车来了就随时结束。',
    example: '线索：长长的、有靠背、等累了可以坐。答案：站台的长椅。',
    label: '你的三个线索和答案',
  },
};

/** A fixed, local example of the product flow. It never calls the agent or saves user data. */
export function OnboardingSceneTry({ scene, onComplete }: { scene: keyof typeof scenes; onComplete: () => void }) {
  const content = scenes[scene];
  const [phase, setPhase] = useState<'chat' | 'card' | 'make' | 'saved'>('chat');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // Replacing the active action keeps focus inside the guide.
      if (document.activeElement === document.body) root.current?.focus({ preventScroll: true });
      root.current?.querySelector<HTMLElement>('[data-scene-current]')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      if (phase === 'saved') root.current?.closest('.app-guide-page')?.querySelector('.app-guide-controls')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  return <section className="scene-try" ref={root} tabIndex={-1} aria-label={scene === 'home' ? '周末在家试用' : '和朋友等车试用'}>
    <p className="scene-try-note">对话演示</p>
    <div className="scene-conversation" role="log" aria-label="示例对话" aria-live="polite">
      {phase !== 'chat' && <div className="scene-message is-user">
        <span className="scene-speaker">你</span><p>{content.prompt}</p>
      </div>}
      {phase !== 'chat' && <div className="scene-message is-agent walk-arrive">
        <span className="scene-speaker">吱呀</span>
        <p>{content.reply}</p>
        {phase === 'card' ? <div className="scene-try-card">
          <strong>{content.title}</strong>
          <button data-scene-current className="scene-try-claim scene-click-hint" onClick={() => setPhase('make')}><span className="scene-action-label">认领任务</span></button>
        </div> : <p className="scene-selected">✓ 已认领：{content.title}</p>}
      </div>}
      {(phase === 'make' || phase === 'saved') && <>
        <div className="scene-message is-agent walk-arrive">
          <span className="scene-speaker">吱呀</span><p>{content.step}</p>
        </div>
      </>}
      {phase === 'saved' && <>
        <div className="scene-message is-user walk-arrive"><span className="scene-speaker">你 · 示例作品</span><blockquote>{content.example}</blockquote></div>
        <div data-scene-current className="scene-message is-agent scene-try-record walk-arrive">
          <span className="scene-speaker">吱呀</span><p>这份小作品，已留在本次演示里。正式使用时，可以到「我的手册」回看。</p>
        </div>
      </>}
    </div>
    {phase === 'chat' && <div className="scene-try-composer bg-card border border-paper-edge/80 shadow-paper-md p-1.5 pl-2 flex gap-1 items-end">
      <textarea
        aria-label="和吱呀说说你的想法"
        value={content.prompt}
        readOnly
        rows={3}
        className="flex-1 bg-transparent text-ink px-3 py-2.5 focus:outline-none min-w-0"
      />
      <button
        data-scene-current
        aria-label="发送消息"
        title="点击发送，看看吱呀的推荐"
        className="scene-try-send p-3 bg-moss text-ink rounded-full hover:bg-moss-deep hover:text-card transition-colors shrink-0 shadow-btn"
        onClick={() => setPhase('card')}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M3 9L15 3L12 15L9 10L3 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 10L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </button>
    </div>}
    {phase === 'make' && <div data-scene-current className="scene-try-form walk-arrive">
      <label htmlFor={`scene-record-${scene}`}>{content.label} · 已填好示例</label>
      <textarea id={`scene-record-${scene}`} value={content.example} readOnly rows={4} />
      <button className="walk-primary scene-click-hint" onClick={() => { setPhase('saved'); onComplete(); }}><span className="scene-action-label">发送示例作品 ↑</span></button>
    </div>}
  </section>;
}
