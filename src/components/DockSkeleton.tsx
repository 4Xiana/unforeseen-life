interface Props {
  type: 'activities' | 'step';
  label?: string;
}

const ACTIVITY_STEPPING = [
  '搜罗支线中',
  '搜罗有趣的点子',
  '正在构思小支线',
  '从城市角落找灵感',
  '比对你的空闲时间',
];

const STEP_STEPPING = [
  '铺开任务地图',
  '写下第一步指引',
  '整理任务中',
];

export function DockSkeleton({ type, label }: Props) {
  const phrases = type === 'activities' ? ACTIVITY_STEPPING : STEP_STEPPING;

  if (type === 'activities') {
    return (
      <div className="my-5">
        <div className="section-label mb-3 px-1">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-fog">
            <path d="M6 1L7.5 4.5L11 5L8.5 7.5L9 11L6 9.5L3 11L3.5 7.5L1 5L4.5 4.5L6 1Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
          </svg>
          <span className="text-fog">
            {label || phrases[0]}
          </span>
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="bg-card rounded-[20px] p-4 relative overflow-hidden"
              style={{
                border: '1.5px solid rgba(45,42,38,0.08)',
                borderLeft: `4px solid var(--${['moss', 'blue', 'orange'][i]})`,
                minHeight: '96px',
              }}
            >
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full"
                style={{ background: 'var(--paper)', border: '1.5px solid var(--fog-light)' }}/>

              <div className="flex items-center gap-3 pr-7">
                <div className="w-9 h-9 rounded-full skeleton-shimmer shrink-0" style={{ borderRadius: '999px' }}/>
                <div className="flex-1 space-y-2">
                  <div className="skeleton-shimmer h-3.5 w-2/5" style={{ borderRadius: '999px' }}/>
                  <div className="skeleton-shimmer h-2.5 w-full"/>
                  <div className="skeleton-shimmer h-2.5 w-3/4"/>
                  <div className="flex gap-1.5 pt-0.5">
                    <div className="skeleton-shimmer h-4 w-10" style={{ borderRadius: '999px' }}/>
                    <div className="skeleton-shimmer h-4 w-8" style={{ borderRadius: '999px' }}/>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="my-4">
      <div className="paper-card p-5 relative overflow-hidden rounded-[24px]">
        <div className="flex items-center justify-between mb-4 pb-3 perforation">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-moss/50">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
            </svg>
            <span className="font-hand text-[15px] text-fog leading-none">任务</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-hand text-[14px] text-fog">{label || '铺排中'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center flex-1">
              <div className="w-6 h-6 rounded-full skeleton-shimmer shrink-0" style={{ borderRadius: '999px' }}/>
              {i < 2 && <div className="flex-1 h-1 mx-1 rounded-full bg-fog-light/50"/>}
            </div>
          ))}
        </div>

        <div className="bg-paper border border-paper-edge/50 p-4 rounded-2xl mb-4 relative">
          <div className="absolute top-2.5 bottom-2.5 left-0 w-1 bg-moss/30 rounded-full"/>
          <div className="pl-3 space-y-2">
            <div className="skeleton-shimmer h-3 w-[85%]"/>
            <div className="skeleton-shimmer h-3 w-[60%]"/>
          </div>
        </div>

        <div className="skeleton-shimmer h-12 w-full" style={{ borderRadius: '999px' }}/>
      </div>
    </div>
  );
}
