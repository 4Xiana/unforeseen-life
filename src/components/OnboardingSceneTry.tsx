import { useEffect, useRef, useState } from 'react';

/** Local rehearsal: no model calls, form entry, or changes to real records. */
export function OnboardingSceneTry({ scene: _scene, onComplete }: { scene: 'home' | 'friends'; onComplete: () => void }) {
  const [phase, setPhase] = useState<'pick' | 'submit' | 'saved'>('pick');
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (phase === 'pick') return;
    const target = root.current?.querySelector<HTMLElement>('[data-demo-current]');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [phase]);
  return <section className="quick-demo" ref={root} aria-label="支线玩法演示">
    <p className="quick-guide-footnote">互动示例 · 不会写入你的正式记录</p>
    <ol className="quick-demo-track" aria-label="支线流程">
      {['聊聊想法', '挑条支线', '做完留痕'].map((label, index) => <li key={label} className={index <= (phase === 'pick' ? 1 : 2) ? 'current' : ''}><span aria-hidden>{index + 1}</span>{label}</li>)}
    </ol>
    <div className="quick-demo-message"><span>你</span><p>想在家试点有创意的事。</p></div>
    <div className="quick-demo-task">
      <span className="quick-guide-eyebrow">吱呀的推荐 · 创造 · 约10分钟</span>
      <h2>给桌上的小物办个展</h2>
      {phase === 'pick' && <p>两件普通小物，也能凑出一个有趣的故事。</p>}
      {phase === 'pick' ? <button className="walk-primary" onClick={() => setPhase('submit')}>就选这条支线 →</button> : <span className="quick-demo-selected">✓ 已选择</span>}
    </div>
    {phase !== 'pick' && <div className="quick-demo-proof" aria-live="polite">
      <h2>选好了，在任务页跟着做</h2>
      <p>步骤和提交入口都在这里。卡住时，点「问问吱呀」，聊完回到这一步。</p>
      <p id="quick-demo-instruction">挑两件手边的小物，摆在一起。给展览起个名字，写一句它们为什么在一起。</p>
      <div className="quick-demo-work"><span>示例作品</span><blockquote>《下班了》：钥匙和合上的笔记本，一个结束奔波，一个收起待办，一起休息。</blockquote></div>
      {phase === 'submit' ? <button data-demo-current aria-describedby="quick-demo-instruction" className="walk-primary" onClick={() => { setPhase('saved'); onComplete(); }}>提交这份示例作品 →</button>
        : <div data-demo-current tabIndex={-1} className="quick-demo-saved" role="status"><strong>✓ 一条支线完成了</strong><p>正式完成的作品会留在「我的手册 → 日常记录」，随时可以回看。</p></div>}
    </div>}
  </section>;
}
