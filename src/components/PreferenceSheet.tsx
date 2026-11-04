import { useEffect, useState } from 'react';
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
      className={`w-full rounded-3xl border-2 px-4 py-3.5 flex flex-col gap-1.5 transition-all duration-200 active:scale-[0.98] ${
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

export function PreferenceSheet({ open, onClose, initial, pairs, onSave }: Props) {
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

  // 每次打开时，用已存档案初始化（首次打开即空表单）
  useEffect(() => {
    if (!open) return;
    setPage('form');
    setEnergy(initial?.energy ?? 'any');
    setNovelty(initial?.novelty ?? 0);
    setSocial(initial?.social ?? 'any');
    setBudget(initial?.budget ?? 'any');
    setMechs(initial?.mechs ?? []);
    setInterests(initial?.interests ?? '');
    setAvoids(initial?.avoids ?? '');
    setPairVotes(initial?.pairVotes ?? {});
    setPairIdx(0);
  }, [open, initial]);

  if (!open) return null;

  const toggleMech = (m: MechanismPref) => {
    setMechs((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const submit = async (votes: Record<string, 'A' | 'B'>) => {
    if (saving) return;
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
      onClose();
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
    <div className="fixed inset-0 z-50">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-ink/30 animate-fade-in"
        onClick={saving ? undefined : onClose}
      />

      {/* 底部弹层 */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="w-full max-w-sm max-h-[88dvh] flex flex-col bg-paper rounded-t-[28px] shadow-paper animate-slide-up overflow-hidden">
          {/* 抓手条 */}
          <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
            <span className="w-10 h-1 rounded-full bg-fog-light/70" />
          </div>

          {/* 头部 */}
          <div className="shrink-0 px-5 pt-1 pb-3 flex items-start justify-between">
            <div>
              <h2 className="font-display text-ink text-[20px] leading-none">
                让吱呀更懂你
              </h2>
              <p className="text-fog text-[12.5px] mt-1.5">
                {page === 'form'
                  ? '跟着感觉点 5 下，约半分钟，随时能改'
                  : '两件事只能选一个，凭第一感觉点'}
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={saving ? undefined : onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-fog hover:text-ink active:scale-95"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {page === 'form' ? (
            <>
              {/* ── 第一页：5 道情景快题 ── */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 pb-2">
                <GroupLabel>1. 没安排的时间，你身体更想？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {ENERGY_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={energy === o.id}
                      onClick={() => setEnergy(o.id)}
                    />
                  ))}
                </div>

                <GroupLabel>2. 哪种支线更让你心动？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {NOVELTY_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={novelty === o.id}
                      onClick={() => setNovelty(o.id)}
                    />
                  ))}
                </div>

                <GroupLabel>3. 你更想要的状态？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {SOCIAL_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={social === o.id}
                      onClick={() => setSocial(o.id)}
                    />
                  ))}
                </div>

                <GroupLabel>4. 为这段支线花点小钱？</GroupLabel>
                <div className="flex gap-2 mb-5">
                  {BUDGET_OPTIONS.map((o) => (
                    <ScenarioCard
                      key={o.id}
                      {...o}
                      active={budget === o.id}
                      onClick={() => setBudget(o.id)}
                    />
                  ))}
                </div>

                <GroupLabel hint="可多选，不选就都试试">5. 哪种玩法听起来最好玩？</GroupLabel>
                <div className="flex flex-wrap gap-2 mb-5">
                  {MECHANISM_OPTIONS.map((m) => {
                    const active = mechs.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMech(m.id)}
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

                <GroupLabel>兴趣爱好（选填）</GroupLabel>
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="比如：爱做饭、喜欢民谣、沉迷手账…"
                  className="w-full bg-card border-2 border-paper-edge/80 rounded-2xl px-4 py-2.5 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50 mb-4"
                />

                <GroupLabel>雷点（选填）</GroupLabel>
                <input
                  type="text"
                  value={avoids}
                  onChange={(e) => setAvoids(e.target.value)}
                  placeholder="比如：怕虫子、社恐不想和人互动、不爱运动…"
                  className="w-full bg-card border-2 border-paper-edge/80 rounded-2xl px-4 py-2.5 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50 mb-2"
                />
              </div>

              <div className="shrink-0 px-5 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setPage('pairs')}
                  className="w-full rounded-full py-3 text-[15px] text-card bg-moss hover:bg-moss-deep shadow-btn active:scale-[0.98] transition-all"
                >
                  继续：6 组时间对比
                </button>
                <button
                  type="button"
                  onClick={() => submit(pairVotes)}
                  className="w-full mt-1.5 text-[12.5px] text-fog hover:text-ink py-1 transition-colors"
                >
                  跳过对比，直接保存
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ── 第二页：时间爬坡·真实任务 PK，每页只比一对，选完即下一页 ── */}
              <div className="flex-1 min-h-0 flex flex-col px-5">
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
                <div className="shrink-0 flex gap-1.5 mb-4" role="tablist" aria-label="选择时长档">
                  {pairs.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-label={`跳到${p.when}`}
                      aria-selected={i === pairIdx}
                      onClick={() => setPairIdx(i)}
                      className={`h-2 flex-1 rounded-full transition-all duration-200 active:scale-y-150 ${
                        pairVotes[p.id]
                          ? i === pairIdx
                            ? 'bg-moss ring-2 ring-moss/30'
                            : 'bg-moss'
                          : i === pairIdx
                            ? 'bg-orange ring-2 ring-orange/30'
                            : 'bg-paper-edge/60 hover:bg-fog-light'
                      }`}
                    />
                  ))}
                </div>

                <p className="shrink-0 text-center font-hand text-ink text-[14.5px] leading-[1.7] mb-4">
                  如果{pair.when}，<br />这两件事你更倾向于做哪个？
                </p>

                <div key={pair.id} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col gap-2.5 animate-fade-in pb-1">
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
