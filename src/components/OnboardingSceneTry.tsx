import { useEffect, useRef, useState } from 'react';
import { appUrl } from '../paths';

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
        <figure data-demo-current tabIndex={-1} className="quick-demo-tutorial" aria-label="戒指魔术教程预览">
          <img src={appUrl('onboarding/ring-magic-tutorial.png')} width={454} height={258} alt="戒指魔术教程封面：演示者展示手势，画面标注3个戒指魔术和时长2分49秒。" />
          <figcaption className="quick-guide-footnote">教程预览图</figcaption>
        </figure>
        <p id="quick-demo-instruction">试试戒指魔术，先从一个手势练起。</p>
        <p className="quick-guide-footnote">需要帮忙时，随时点「问问吱呀」。</p>
        <button aria-describedby="quick-demo-instruction" className="walk-primary" onClick={() => { setPhase('saved'); onComplete(); }}>试着留下这次练习 →</button>
      </>
        : <div data-demo-current tabIndex={-1} className="quick-demo-saved" role="status"><strong>✓ 一次小小的探索，完成啦</strong><p>以后的小收获，都能在「我的手册 → 日常记录」里找到。</p></div>}
    </div>}
  </section>;
}
