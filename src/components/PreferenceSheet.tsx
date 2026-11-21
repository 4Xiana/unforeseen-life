import { useEffect, useRef, useState } from 'react';
import { getClientId } from '../handbook';
import { PreferenceFittingPanel } from './PreferenceFittingPanel';
import type { UserProfile, SaveProfileInput, QuestPair, PairAnswer, EnergyPref, BudgetPref, NoveltyPref, SocialPref, MechanismPref } from '../types';
import './preferences.css';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: UserProfile | null;
  pairs: QuestPair[];
  onSave: (input: SaveProfileInput) => Promise<void> | void;
  onFit?: (votes: Record<string, PairAnswer>) => Promise<UserProfile>;
  embedded?: boolean;
  guided?: boolean;
  compact?: boolean;
  onSaved?: () => void;
}
const energyOptions: { value: EnergyPref; label: string }[] = [{ value: '坐', label: '安静坐着' }, { value: '慢', label: '慢慢活动' }, { value: '动', label: '动起来' }];
const budgetOptions: { value: BudgetPref; label: string }[] = [{ value: 'free', label: '尽量不花钱' }, { value: 'low', label: '花一点也可以' }];
const socialOptions: { value: SocialPref; label: string }[] = [{ value: 'solo', label: '独自享受' }, { value: 'pair', label: '两人同行' }, { value: 'group', label: '多人一起' }];
const noveltyOptions: { value: NoveltyPref; label: string }[] = [{ value: 1, label: '熟悉稳妥' }, { value: 2, label: '一点新鲜' }, { value: 3, label: '脑洞玩法' }];
const mechanismOptions: MechanismPref[] = ['收集图鉴', '随机委托', '视角重赋', '规则限制', '定点观察', '触感心流', '盲盒猜谜', '角色扮演', '连接动作', '留痕收尾'];
const draftKey = () => `xian-basic-preferences:${getClientId()}`;
function readBasic(initial: UserProfile): SaveProfileInput {
  const base = { energy: initial.energy, budget: initial.budget, social: initial.social, novelty: initial.novelty, mechs: initial.mechs, interests: initial.interests, avoids: initial.avoids };
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey()) || '{}');
    return { ...base, ...Object.fromEntries(Object.entries(draft).filter(([key]) => key in base)) };
  } catch { return base; }
}
function ChoiceGroup<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <fieldset className="basic-choice-group"><legend>{label}</legend><div>{options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></fieldset>;
}
function BasicPreferences({ initial, compact, onSave, onSaved }: { initial: UserProfile; compact: boolean; onSave: Props['onSave']; onSaved?: () => void }) {
  const [input, setInput] = useState(() => readBasic(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const alive = useRef(true);
  const callback = useRef(onSaved); callback.current = onSaved;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (dirty) { try { sessionStorage.setItem(draftKey(), JSON.stringify(input)); } catch { /* in-memory editing still works */ } } }, [input, dirty]);
  function change(patch: Partial<SaveProfileInput>) { setInput(prev => ({ ...prev, ...patch })); setDirty(true); setSaved(false); setError(''); }
  return <form className="basic-preferences" onSubmit={async e => {
    e.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      // Only send basic fields. The independent fitting data is preserved by the server.
      await onSave(input);
      try { sessionStorage.removeItem(draftKey()); } catch { /* no draft */ }
      if (alive.current) { setDirty(false); setSaved(true); callback.current?.(); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '暂时没能保存，请重试。'); }
    finally { if (alive.current) setSaving(false); }
  }}>
    <fieldset disabled={saving} className="basic-preferences-fields">
      <legend className="sr-only">基础喜好</legend>
      <ChoiceGroup<EnergyPref> label="你喜欢怎样的节奏？" value={input.energy} options={energyOptions} onChange={value => change({ energy: input.energy === value ? 'any' : value })} />
      <ChoiceGroup<BudgetPref> label="愿意为新体验花一点钱吗？" value={input.budget} options={budgetOptions} onChange={value => change({ budget: input.budget === value ? 'any' : value })} />
      {!compact && <>
        <ChoiceGroup<SocialPref> label="通常更喜欢和谁一起？" value={input.social} options={socialOptions} onChange={value => change({ social: input.social === value ? 'any' : value })} />
        <ChoiceGroup<NoveltyPref> label="希望玩法多一点什么？" value={input.novelty} options={noveltyOptions} onChange={value => change({ novelty: input.novelty === value ? 0 : value })} />
        <label className="basic-field">兴趣爱好（选填）<input maxLength={200} value={input.interests} placeholder="比如音乐、植物、做饭" onChange={e => change({ interests: e.target.value })} /></label>
        <label className="basic-field">不想做的事（选填）<input maxLength={200} value={input.avoids} placeholder="比如不拍照、不想与陌生人互动" onChange={e => change({ avoids: e.target.value })} /></label>
        <details className="basic-more"><summary>明确喜欢的玩法（选填）{input.mechs.length ? ` · 已选${input.mechs.length}项` : ''}</summary><div className="basic-mechanisms">{mechanismOptions.map(mechanism => <button type="button" key={mechanism} aria-pressed={input.mechs.includes(mechanism)} onClick={() => change({ mechs: input.mechs.includes(mechanism) ? input.mechs.filter(m => m !== mechanism) : [...input.mechs, mechanism] })}>{mechanism}</button>)}</div></details>
      </>}
      {!compact && <p className="preference-note">选你喜欢的就好，之后随时能改。</p>}
      <button type="submit" className="preference-primary">{saving ? '正在保存…' : compact ? '选好啦，继续 →' : '保存基础喜好'}</button>
    </fieldset>
    {error && <p className="preference-error" role="alert">{error}</p>}
    {saved && <p className="preference-note" role="status">基础喜好已保存，之后的推荐会参考它。</p>}
  </form>;
}

export function PreferenceSheet({ open, onClose, initial, pairs, onSave, onFit, embedded = false, guided = false, compact = false, onSaved }: Props) {
  const [tab, setTab] = useState<'basic' | 'fitting'>('basic');
  if (!open) return null;
  if (!initial) return <p className="preference-note" role="status">正在读取喜好档案…</p>;
  if (compact) return <BasicPreferences initial={initial} compact onSave={onSave} onSaved={onSaved} />;
  return <div className={`preferences-hub ${embedded ? 'is-embedded' : ''}`}>
    <div className="preferences-hub-paper">
      <header className="preferences-hub-header"><div><h2>我的喜好</h2></div>{!embedded && <button onClick={onClose} aria-label="关闭喜好设置">关闭</button>}</header>
      <div className="preferences-subtabs" role="tablist" aria-label="喜好设置方式" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const next = e.key === 'Home' ? 'basic' : e.key === 'End' ? 'fitting' : tab === 'basic' ? 'fitting' : 'basic';
        setTab(next); e.currentTarget.querySelector<HTMLElement>(`#preference-tab-${next}`)?.focus();
      }}>
        {(['basic', 'fitting'] as const).map(value => <button key={value} id={`preference-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`preference-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{value === 'basic' ? '基础喜好' : '喜好配置拟合'}</button>)}
      </div>
      <div className="preferences-hub-body" role="tabpanel" id={`preference-panel-${tab}`} aria-labelledby={`preference-tab-${tab}`}>
        {tab === 'basic' ? <>
          <div className="preference-fitting-invite"><div><strong>想让推荐更贴近你？</strong><p>用30组具体玩法对比，看看你在不同场景里更喜欢什么。</p></div><button onClick={() => setTab('fitting')}>去做喜好拟合 →</button></div>
          <BasicPreferences initial={initial} compact={false} onSave={onSave} onSaved={guided ? onSaved : undefined} />
        </> : <PreferenceFittingPanel profile={initial} pairs={pairs} onSave={onFit} />}
      </div>
    </div>
  </div>;
}
