// Shared choice vocabulary; personality is self-reported, never inferred from other answers.
export const MBTI_TYPES = ['INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTP', 'ISFP', 'ESTP', 'ESFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'INTJ', 'INTP', 'ENTJ', 'ENTP'] as const;
export type MbtiType = typeof MBTI_TYPES[number];
export type ActivityPreference = 'quiet' | 'active' | 'any';
export type DesiredOutcome = 'relax' | 'surprise' | 'express' | 'connect' | 'grow';

export const MBTI_GROUPS: { id: string; label: string; code: string; types: { code: MbtiType; label: string }[] }[] = [
  { id: 'green', label: '绿人组', code: 'NF', types: [{ code: 'INFJ', label: '提倡者' }, { code: 'INFP', label: '调停者' }, { code: 'ENFJ', label: '主人公' }, { code: 'ENFP', label: '竞选者' }] },
  { id: 'yellow', label: '黄人组', code: 'SP', types: [{ code: 'ISTP', label: '鉴赏家' }, { code: 'ISFP', label: '探险家' }, { code: 'ESTP', label: '企业家' }, { code: 'ESFP', label: '表演者' }] },
  { id: 'blue', label: '蓝人组', code: 'SJ', types: [{ code: 'ISTJ', label: '物流师' }, { code: 'ISFJ', label: '守卫者' }, { code: 'ESTJ', label: '总经理' }, { code: 'ESFJ', label: '执政官' }] },
  { id: 'purple', label: '紫人组', code: 'NT', types: [{ code: 'INTJ', label: '建筑师' }, { code: 'INTP', label: '逻辑学家' }, { code: 'ENTJ', label: '指挥官' }, { code: 'ENTP', label: '辩论家' }] },
];
export const OUTCOME_OPTIONS: { value: DesiredOutcome; label: string }[] = [
  { value: 'relax', label: '放松' }, { value: 'surprise', label: '惊喜' }, { value: 'express', label: '表达' }, { value: 'connect', label: '连接' }, { value: 'grow', label: '成长' },
];
export const ACTIVITY_OPTIONS: { value: Exclude<ActivityPreference, 'any'>; label: string }[] = [{ value: 'quiet', label: '喜静' }, { value: 'active', label: '喜动' }];

export function normalizeIdentityPreferences(raw: { mbti?: unknown; activityPreference?: unknown; desiredOutcomes?: unknown }) {
  const mbti = typeof raw.mbti === 'string' ? raw.mbti.trim().toUpperCase() : raw.mbti;
  const outcomes = Array.isArray(raw.desiredOutcomes) ? raw.desiredOutcomes : [];
  return {
    mbti: raw.mbti === undefined ? undefined : MBTI_TYPES.includes(mbti as MbtiType) ? mbti as MbtiType : null,
    activityPreference: raw.activityPreference === undefined ? undefined : ['quiet', 'active', 'any'].includes(raw.activityPreference as string) ? raw.activityPreference as ActivityPreference : 'any' as const,
    desiredOutcomes: raw.desiredOutcomes === undefined ? undefined : OUTCOME_OPTIONS.filter(option => outcomes.includes(option.value)).map(option => option.value),
  };
}
