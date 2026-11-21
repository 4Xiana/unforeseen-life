import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_OPTIONS, MBTI_GROUPS, OUTCOME_OPTIONS } from '../../server/agent/profile/identity-preferences';
import type { SaveProfileInput } from '../types';

export function IdentityPreferences({ value, onChange }: { value: SaveProfileInput; onChange: (patch: Partial<SaveProfileInput>) => void }) {
  const [groupId, setGroupId] = useState<string | null>(() => MBTI_GROUPS.find(group => group.types.some(type => type.code === value.mbti))?.id ?? null);
  const group = MBTI_GROUPS.find(item => item.id === groupId);
  const picker = useRef<HTMLFieldSetElement>(null);
  const previousGroup = useRef(groupId);
  useEffect(() => {
    if (previousGroup.current !== groupId) picker.current?.querySelector<HTMLElement>('.mbti-grid button')?.focus({ preventScroll: true });
    previousGroup.current = groupId;
  }, [groupId]);
  return <>
    <fieldset className="basic-choice-group mbti-choice" ref={picker}>
      <legend>你的 MBTI 是什么？</legend>
      {group && <div className="mbti-controls"><span className="mbti-group-note">{group.label} · {group.code}</span><button type="button" onClick={() => setGroupId(null)}>重新选分组</button></div>}
      <div className="mbti-grid">
        {group ? group.types.map(type => <button type="button" className="mbti-role" key={type.code} aria-label={`${type.code} · ${type.label}`} aria-pressed={value.mbti === type.code} onClick={() => onChange({ mbti: value.mbti === type.code ? null : type.code })}><img src={`/images/mbti/${type.code}.svg`} alt="" width="40" height="56" /><span className="mbti-role-label"><span>{type.code}</span><span className="mbti-role-name">{type.label}</span></span></button>)
          : MBTI_GROUPS.map(item => <button type="button" key={item.id} className="mbti-group" onClick={() => setGroupId(item.id)}><span className="mbti-group-avatars" aria-hidden="true">{item.types.map(type => <img key={type.code} src={`/images/mbti/${type.code}.svg`} alt="" width="30" height="44" />)}</span><span className="mbti-group-label">{item.label}<span className="mbti-code">{item.code}</span></span></button>)}
      </div>
      <div className="mbti-controls"><button type="button" onClick={() => { onChange({ mbti: null }); setGroupId(null); }}>还不确定</button></div>
    </fieldset>
    <fieldset className="basic-choice-group">
      <legend>你更喜欢哪种状态？</legend>
      <div>{ACTIVITY_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={value.activityPreference === option.value} onClick={() => onChange({ activityPreference: value.activityPreference === option.value ? 'any' : option.value })}>{option.label}</button>)}</div>
    </fieldset>
    <fieldset className="basic-choice-group outcome-choice">
      <legend>希望通过吱呀获得什么？<span className="identity-note">可多选</span></legend>
      <div>{OUTCOME_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={value.desiredOutcomes?.includes(option.value) ?? false} onClick={() => onChange({ desiredOutcomes: value.desiredOutcomes?.includes(option.value) ? value.desiredOutcomes.filter(item => item !== option.value) : [...(value.desiredOutcomes ?? []), option.value] })}>{option.label}</button>)}</div>
    </fieldset>
  </>;
}
