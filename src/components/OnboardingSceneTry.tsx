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
    <p className="quick-guide-footnote">先试试看，这次练习不会保存。</p>
    <div className="quick-demo-message" aria-label="你对吱呀说"><p>想学个有趣的小技能，下次和朋友见面时用。</p></div>
    <div className="quick-demo-task">
      <span className="quick-guide-footnote">约10分钟</span>
      <h2>学会一个能表演给朋友的小魔术</h2>
      {phase === 'pick' ? <button className="walk-primary" onClick={() => setPhase('submit')}>我想试试这个 →</button> : <span className="quick-demo-selected">✓ 就做这件事</span>}
    </div>
    {phase !== 'pick' && <div className="quick-demo-proof" aria-live="polite">
      {phase === 'submit' ? <>
        <p id="quick-demo-instruction">先写下数字4，盖住。请朋友心想一个1到10的数，依次乘2、加8、除以2，再减去最初的数。最后揭晓：答案正是你写的4！</p>
        <div className="quick-demo-work" aria-label="练习示例"><blockquote>我用7试了一遍：7 → 14 → 22 → 11 → 4。换个数字练熟，下次就能表演给朋友看。</blockquote></div>
        <p className="quick-guide-footnote">需要帮忙时，随时点「问问吱呀」。</p>
        <button data-demo-current aria-describedby="quick-demo-instruction" className="walk-primary" onClick={() => { setPhase('saved'); onComplete(); }}>试着留下这次练习 →</button>
      </>
        : <div data-demo-current tabIndex={-1} className="quick-demo-saved" role="status"><strong>✓ 一次小小的探索，完成啦</strong><p>以后的小收获，都能在「我的手册 → 日常记录」里找到。</p></div>}
    </div>}
  </section>;
}
