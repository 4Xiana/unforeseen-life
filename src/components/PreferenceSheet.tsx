import { useEffect, useRef, useState } from 'react';
import { getClientId } from '../handbook';
import type {
  UserProfile,
  SaveProfileInput,
  EnergyPref,
  NoveltyPref,
  SocialPref,
  BudgetPref,
  MechanismPref,
  QuestPair,
} from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: UserProfile | null;
  pairs: QuestPair[];
  onSave: (input: SaveProfileInput) => Promise<void> | void;
  embedded?: boolean;
  guided?: boolean;
  onSaved?: () => void;
}

// ── 情景快题：每题锚定种子库一个真实筛/排轴，选项给画面而非抽象标签 ──────────

const ENERGY_OPTIONS: { id: Exclude<EnergyPref, 'any'>; emoji: string; label: string; sub: string }[] = [
  { id: '坐', emoji: '🪑', label: '待着不动', sub: '坐着就好' },
  { id: '慢', emoji: '🚶', label: '慢慢溜达', sub: '走走停停' },
  { id: '动', emoji: '🏃', label: '动起来', sub: '出点小汗' },
];

const NOVELTY_OPTIONS: { id: Exclude<NoveltyPref, 0>; emoji: string; label: string; sub: string }[] = [
  { id: 1, emoji: '🟢', label: '经典稳妥', sub: '做完就舒服' },
  { id: 2, emoji: '🌿', label: '有点新鲜', sub: '带点小意外' },
  { id: 3, emoji: '🌶️', label: '脑洞大开', sub: '可能有点社死' },
];

const SOCIAL_OPTIONS: { id: Exclude<SocialPref, 'any'>; emoji: string; label: string; sub: string }[] = [
  { id: 'solo', emoji: '🎧', label: '一个人', sub: '安安静静' },
  { id: 'pair', emoji: '👯', label: '拉个伴', sub: '两个人一起' },
  { id: 'group', emoji: '🎈', label: '人多热闹', sub: '顺便认识新人' },
];

const BUDGET_OPTIONS: { id: Exclude<BudgetPref, 'any'>; emoji: string; label: string; sub: string }[] = [
  { id: 'free', emoji: '🪙', label: '零成本', sub: '一分不花最好' },
  { id: 'low', emoji: '☕', label: '小额可以', sub: '材料/门票/交通费' },
];

const MECHANISM_OPTIONS: { id: MechanismPref; short: string; hint: string }[] = [
  { id: '收集图鉴', short: '收集图鉴', hint: '定主题集齐 N 个' },
  { id: '随机委托', short: '随机运气', hint: '抛硬币，把决定交出去' },
  { id: '视角重赋', short: '视角重赋', hint: '给旧物编个新身份' },
  { id: '规则限制', short: '规则限制', hint: '给平常事加条奇怪规则' },
  { id: '定点观察', short: '定点观察', hint: '守一个地方记录变化' },
  { id: '触感心流', short: '触感心流', hint: '重复手部动作，脑子关机' },
  { id: '盲盒猜谜', short: '盲盒猜谜', hint: '蒙上感官靠猜' },
  { id: '角色扮演', short: '角色扮演', hint: '换个身份做平常事' },
  { id: '连接动作', short: '连接动作', hint: '一次微小的人际接触' },
  { id: '留痕收尾', short: '留痕收尾', hint: '做出能回看的东西' },
];

// ── 真实任务 PK 卡：展示任务名 + 真实玩法 + 时长/场景标签 ───────────────────

interface QuestTaskCardProps {
  title: string;
  text: string;
  min: number;
  scenes: string[];
  energy: string;
  active: boolean;
  onClick: () => void;
}

function QuestTaskCard({ title, text, min, scenes, energy, active, onClick }: QuestTaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full shrink-0 rounded-3xl border-2 px-4 py-3.5 flex flex-col gap-1.5 transition-all duration-200 active:scale-[0.98] ${
        active
          ? 'border-moss bg-moss/[10%]'
          : 'border-paper-edge/70 bg-card hover:border-fog-light'
      }`}
    >
      <span className="font-display text-ink text-[15.5px] leading-tight text-left">{title}</span>
      <span className="text-ink-2 text-[12.5px] leading-[1.7] text-left">{text}</span>
      <span className="text-[10.5px] text-fog text-left mt-0.5">
        ⏱ 约 {min} 分钟 · {scenes.join('/')} · {energy}
      </span>
    </button>
  );
}

interface CardOptProps {
  emoji: string;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}

function ScenarioCard({ emoji, label, sub, active, onClick }: CardOptProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 min-w-0 rounded-2xl border-2 px-2 py-2.5 flex flex-col items-center gap-0.5 transition-all duration-200 active:scale-[0.97] ${
        active
          ? 'border-moss bg-moss/[10%]'
          : 'border-paper-edge/70 bg-card hover:border-fog-light'
      }`}
    >
      <span className="text-[17px] leading-none">{emoji}</span>
      <span className={`text-[12.5px] leading-tight ${active ? 'text-ink' : 'text-ink-2'}`}>
        {label}
      </span>
      <span className="text-[10.5px] leading-tight text-fog">{sub}</span>
    </button>
  );
}

function GroupLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mb-2">
      <p className="font-hand text-fog text-[13px]">{children}</p>
      {hint && <span className="text-[10.5px] text-fog/60">{hint}</span>}
    </div>
  );
}

export function PreferenceSheet({ open, onClose, initial, pairs, onSave, embedded = false, guided = false, onSaved }: Props) {
  const [page, setPage] = useState<'form' | 'pairs'>('form');
  const [energy, setEnergy] = useState<EnergyPref>('any');
  const [novelty, setNovelty] = useState<NoveltyPref>(0);
  const [social, setSocial] = useState<SocialPref>('any');
  const [budget, setBudget] = useState<BudgetPref>('any');
  const [mechs, setMechs] = useState<MechanismPref[]>([]);
  const [interests, setInterests] = useState('');
  const [avoids, setAvoids] = useState('');
  const [pairVotes, setPairVotes] = useState<Record<string, 'A' | 'B'>>({});
  const [pairIdx, setPairIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [guideStep, setGuideStep] = useState(0);
  const [guideStarted, setGuideStarted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const guideHeading = useRef<HTMLParagraphElement>(null);
  const introHeading = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>();
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const draftKey = `xian-preference-draft:${getClientId()}`;

  // 每次打开时，用已存档案初始化（首次打开即空表单）
  useEffect(() => {
    if (!open) return;
    let draft: Partial<SaveProfileInput> & { guideStep?: number; guideStarted?: boolean } = {};
    if (!initial?.onboarded) {
      try { draft = JSON.parse(sessionStorage.getItem(draftKey) || '{}') || {}; } catch { /* no draft */ }
    }
    setPage('form');
    setEnergy(draft.energy ?? initial?.energy ?? 'any');
    setNovelty(draft.novelty ?? initial?.novelty ?? 0);
    setSocial(draft.social ?? initial?.social ?? 'any');
    setBudget(draft.budget ?? initial?.budget ?? 'any');
    setMechs(draft.mechs ?? initial?.mechs ?? []);
    setInterests(draft.interests ?? initial?.interests ?? '');
    setAvoids(draft.avoids ?? initial?.avoids ?? '');
    setPairVotes(draft.pairVotes ?? initial?.pairVotes ?? {});
    setGuideStep(Math.max(0, Math.min(5, draft.guideStep ?? 0)));
    setGuideStarted(draft.guideStarted ?? ((draft.guideStep ?? 0) > 0));
    setPairIdx(0);
    setHydrated(true);
  }, [open, initial]);
  useEffect(() => {
    if (!hydrated || initial?.onboarded) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ energy, novelty, social, budget, mechs, interests, avoids, pairVotes, guideStep, guideStarted })); } catch { /* private mode */ }
  }, [hydrated, initial, draftKey, energy, novelty, social, budget, mechs, interests, avoids, pairVotes, guideStep, guideStarted]);
  useEffect(() => {
    if (guided) {
      setPage('form');
      (guideStarted ? guideHeading.current : introHeading.current)?.focus({ preventScroll: true });
    }
    return () => clearTimeout(advanceTimer.current);
  }, [open, guided, guideStep, guideStarted]);

  const moveGuide = (next: number) => {
    clearTimeout(advanceTimer.current);
    setGuideStep(next);
  };
  const selectScenario = (select: () => void) => {
    select();
    if (!guided || !guideStarted) return;
    clearTimeout(advanceTimer.current);
    // Keep the selected card visible briefly; repeated clicks update the choice.
    advanceTimer.current = setTimeout(() => setGuideStep(s => Math.min(4, s + 1)), 260);
  };

  if (!open) return null;

  const toggleMech = (m: MechanismPref) => {
    setMechs((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const submit = async (votes: Record<string, 'A' | 'B'>) => {
    if (saving) return;
    setFeedback('');
    setSaving(true);
    try {
      await onSave({
        energy,
        novelty,
        social,
        budget,
        mechs,
        interests: interests.trim(),
        avoids: avoids.trim(),
        pairVotes: votes,
      });
      try { sessionStorage.removeItem(draftKey); } catch { /* private mode */ }
      savedCallback.current?.();
      if (embedded) setFeedback('喜好已经记下了，下次推荐会参考它。');
      else onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '暂时没能保存，请再试一次。');
    } finally {
      setSaving(false);
    }
  };

  // pair-wise：点选即记录；不是最后一对立即翻下一页
  const answerPair = (side: 'A' | 'B') => {
    const pair = pairs[pairIdx];
    const nextVotes = { ...pairVotes, [pair.id]: side };
    setPairVotes(nextVotes);
    if (pairIdx < pairs.length - 1) setPairIdx(pairIdx + 1);
  };

  const answeredCount = pairs.filter((p) => pairVotes[p.id]).length;
  const allPairsAnswered = answeredCount === pairs.length;
  const pair = pairs[pairIdx];

  return (
    <div className={[embedded ? 'preferences-embedded' : 'viewport-overlay fixed inset-0 z-50', guided ? 'preferences-guided' : ''].join(' ')}>
      {/* 遮罩 */}
      {!embedded && <div
        className="absolute inset-0 bg-ink/30 animate-fade-in"
        onClick={saving ? undefined : onClose}
      />}

      {/* 底部弹层 */}
      <div className={embedded ? 'preferences-container' : 'absolute inset-x-0 bottom-0 flex justify-center'}>
        <div role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-label="喜好档案" className="preference-sheet w-full max-w-sm flex flex-col bg-paper rounded-t-[28px] shadow-paper animate-slide-up overflow-hidden">
          {/* 抓手条 */}
          {!embedded && <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
            <span className="w-10 h-1 rounded-full bg-fog-light/70" />
          </div>}

          {/* 头部 */}
          <div hidden={guided && !guideStarted} className="shrink-0 px-4 sm:px-5 pt-1 pb-3 flex items-start justify-between gap-2">
            {guided ? <div className="preference-guide-heading">
              <p ref={guideHeading} tabIndex={-1} aria-live="polite">喜好 · {guideStep + 1} / 6 <span>{guideStep === 5 ? '再留一点自己的线索' : guideStep < 4 ? '选好就进入下一题，也可以留白' : '凭感觉选，也可以留白'}</span></p>
              <div className="preference-guide-progress" aria-hidden>{Array.from({ length: 6 }, (_, i) => <i key={i} className={i <= guideStep ? 'filled' : ''} />)}</div>
            </div> : <div>
              <h2 className="font-display text-ink text-[20px] leading-none">
                让吱呀更懂你
              </h2>
              <p className="text-fog text-[12.5px] mt-1.5">
                {page === 'form'
                  ? '跟着感觉点 5 下，约半分钟，随时能改'
                  : '两件事只能选一个，凭第一感觉点'}
              </p>
            </div>}
            {!embedded && <button
              type="button"
              aria-label="关闭"
              onClick={saving ? undefined : onClose}
              className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-fog hover:text-ink active:scale-95"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>}
          </div>
          {feedback && <p role="status" className="px-5 pb-3 text-[13px] text-moss-deep">{feedback}</p>}

          {guided && !guideStarted ? <>
            <section className="preference-guide-intro">
              <p className="preference-intro-eyebrow">先认识你的喜好</p>
              <h2 ref={introHeading} tabIndex={-1}>让支线更合你的心意</h2>
              <p>同样是下班后的十五分钟，有人想安静地做点手工，有人更想出门走走。</p>
              <p>接下来，选一选你喜欢的节奏和玩法，也可以告诉吱呀你的兴趣与雷点。它会记进喜好档案，让以后的推荐更贴近你。</p>
              <small>凭感觉选就好，不确定可以留白，之后随时能改。</small>
            </section>
            <div className="preference-guide-actions">
              <button className="preference-guide-next" onClick={() => setGuideStarted(true)}>开始选一选 →</button>
            </div>
          </> : page === 'form' ? (
            <>
              {/* ── 第一页：5 道情景快题 ── */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 sm:px-5 pb-2">
                <div className="preference-question" hidden={guided && guideStep !== 0}>
                <GroupLabel>1. 没安排的时间，你身体更想？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {ENERGY_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={energy === o.id}
                      onClick={() => selectScenario(() => setEnergy(o.id))}
                    />
                  ))}
                </div>
                </div>
                <div className="preference-question" hidden={guided && guideStep !== 1}>
                <GroupLabel>2. 哪种支线更让你心动？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {NOVELTY_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={novelty === o.id}
                      onClick={() => selectScenario(() => setNovelty(o.id))}
                    />
                  ))}
                </div>
                </div>
                <div className="preference-question" hidden={guided && guideStep !== 2}>
                <GroupLabel>3. 你更想要的状态？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {SOCIAL_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={social === o.id}
                      onClick={() => selectScenario(() => setSocial(o.id))}
                    />
                  ))}
                </div>
                </div>
                <div className="preference-question" hidden={guided && guideStep !== 3}>
                <GroupLabel>4. 为这段支线花点小钱？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {BUDGET_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={budget === o.id}
                      onClick={() => selectScenario(() => setBudget(o.id))}
                    />
                  ))}
                </div>
                </div>
                <div className="preference-question" hidden={guided && guideStep !== 4}>
                <GroupLabel hint="可多选，不选就都试试">5. 哪种玩法听起来最好玩？</GroupLabel>
                <div className="flex flex-wrap gap-2 mb-5">
                  {MECHANISM_OPTIONS.map((m) => {
                    const active = mechs.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMech(m.id)}
                        aria-pressed={active}
                        title={m.hint}
                        className={`px-3 py-1.5 rounded-full border text-[12.5px] transition-all duration-200 active:scale-95 ${
                          active
                            ? 'border-moss bg-moss/[12%] text-ink'
                            : 'border-fog-light bg-card text-fog'
                        }`}
                      >
                        {m.short}
                      </button>
                    );
                  })}
                </div>
                </div>
                <div className="preference-question" hidden={guided && guideStep !== 5}>
                <GroupLabel>兴趣爱好（选填）</GroupLabel>
                <input
                  type="text"
                  aria-label="兴趣爱好（选填）"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="比如：爱做饭、喜欢民谣、沉迷手账…"
                  className="w-full bg-card border-2 border-paper-edge/80 rounded-2xl px-4 py-2.5 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50 mb-4"
                />

                <GroupLabel>雷点（选填）</GroupLabel>
                <input
                  type="text"
                  aria-label="雷点（选填）"
                  value={avoids}
                  onChange={(e) => setAvoids(e.target.value)}
                  placeholder="比如：怕虫子、社恐不想和人互动、不爱运动…"
                  className="w-full bg-card border-2 border-paper-edge/80 rounded-2xl px-4 py-2.5 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50 mb-2"
                />
                </div>
              </div>

              {guided ? <div className="preference-guide-actions">
                <button disabled={saving} onClick={() => {
                  clearTimeout(advanceTimer.current);
                  if (guideStep === 0) setGuideStarted(false);
                  else moveGuide(guideStep - 1);
                }}>{guideStep === 0 ? '← 返回介绍' : '← 上一题'}</button>
                <button className="preference-guide-next" disabled={saving} onClick={() => guideStep < 5 ? moveGuide(guideStep + 1) : void submit(pairVotes)}>{saving ? '正在保存…' : guideStep < 4 ? '留白，下一题 →' : guideStep === 4 ? '下一题 →' : '保存喜好，去写心愿 →'}</button>
              </div> : <div className="shrink-0 px-5 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  disabled={!pairs.length || saving}
                  onClick={() => setPage('pairs')}
                  className="w-full rounded-full py-3 text-[15px] text-card bg-moss hover:bg-moss-deep shadow-btn active:scale-[0.98] transition-all"
                >
                  {pairs.length ? `继续：${pairs.length} 组时间对比` : '时间对比加载中…'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => submit(pairVotes)}
                  className="w-full mt-1.5 text-[12.5px] text-fog hover:text-ink py-1 transition-colors"
                >
                  跳过对比，直接保存
                </button>
              </div>}
            </>
          ) : (
            <>
              {/* ── 第二页：时间爬坡·真实任务 PK，每页只比一对，选完即下一页 ── */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-4 sm:px-5">
                {/* 进度：当前时长档 + 第 x/N */}
                <div className="shrink-0 flex items-center justify-between mb-1">
                  <span className="text-[12px] text-fog">
                    {pair.timeShort} · 第 {pairIdx + 1} / {pairs.length} 档
                  </span>
                  <button
                    type="button"
                    onClick={() => (pairIdx > 0 ? setPairIdx(pairIdx - 1) : setPage('form'))}
                    className="text-[12px] text-fog hover:text-ink"
                  >
                    {pairIdx > 0 ? '‹ 上一档' : '‹ 返回'}
                  </button>
                </div>
                <div className="shrink-0 flex gap-1 mb-1 overflow-x-auto" role="tablist" aria-label="选择时长档">
                  {pairs.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-label={`跳到${p.when}`}
                      aria-selected={i === pairIdx}
                      onClick={() => setPairIdx(i)}
                      className="pair-tab h-11 flex-1 min-w-0 flex items-center justify-center"
                    >
                      <span className={`block w-full h-2 rounded-full transition-colors ${
                        pairVotes[p.id]
                          ? i === pairIdx
                            ? 'bg-moss ring-2 ring-moss/30'
                            : 'bg-moss'
                          : i === pairIdx
                            ? 'bg-orange ring-2 ring-orange/30'
                            : 'bg-paper-edge/60 hover:bg-fog-light'
                      }`} />
                    </button>
                  ))}
                </div>

                <p className="shrink-0 text-center font-hand text-ink text-[14.5px] leading-[1.7] mb-4">
                  如果{pair.when}，<br />这两件事你更倾向于做哪个？
                </p>

                <div key={pair.id} className="shrink-0 flex flex-col gap-2.5 animate-fade-in pb-1">
                  <QuestTaskCard
                    {...pair.a}
                    active={pairVotes[pair.id] === 'A'}
                    onClick={() => answerPair('A')}
                  />

                  <div className="shrink-0 flex items-center gap-3 py-0.5">
                    <span className="flex-1 h-px bg-paper-edge/60" />
                    <span className="text-[11.5px] text-fog/70">VS</span>
                    <span className="flex-1 h-px bg-paper-edge/60" />
                  </div>

                  <QuestTaskCard
                    {...pair.b}
                    active={pairVotes[pair.id] === 'B'}
                    onClick={() => answerPair('B')}
                  />
                </div>
              </div>

              <div className="shrink-0 px-5 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => submit(pairVotes)}
                  disabled={!allPairsAnswered || saving}
                  className="w-full rounded-full py-3 text-[15px] text-card bg-moss hover:bg-moss-deep shadow-btn active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {allPairsAnswered
                    ? '完成，保存我的喜好'
                    : `已完成 ${answeredCount}/${pairs.length} 对`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
