interface MascotProps {
  size?: number;
  variant?: 'full' | 'face';
  // mono：单色线稿（白/当前色描边），用于 moss 圆形头像底
  mono?: boolean;
}

// 小闲：蜡笔风任务发布者小人——戴小帽、举支线小旗。
// full：全身（首页 Hero）；face：只露脸（设置屏/头像）；mono：头像圆底里的单色版。
export function XianMascot({ size = 160, variant = 'full', mono = false }: MascotProps) {
  const ink = mono ? 'currentColor' : 'var(--ink)';
  const moss = mono ? 'currentColor' : 'var(--moss)';
  const headFill = mono ? 'none' : 'var(--card)';
  const hatFill = mono ? 'none' : 'var(--orange)';
  const bodyFill = mono ? 'none' : 'rgba(114,148,81,0.13)';
  const flagFill = mono ? 'none' : 'var(--moss)';
  const sw = mono ? 1.6 : 2.4;

  if (variant === 'face') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="37" r="21" fill={headFill} stroke={ink} strokeWidth={sw} strokeLinecap="round"/>
        <path d="M13 31 Q32 7 51 31 Z" fill={hatFill} stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round"/>
        <path d="M10 31 Q32 38 54 31" stroke={ink} strokeWidth={sw} fill="none" strokeLinecap="round"/>
        <circle cx="32" cy="11" r="2.2" fill={mono ? 'currentColor' : 'var(--card)'} stroke={ink} strokeWidth={1.4}/>
        <g className="xian-eyes" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx="25" cy="37" r="2.1" fill={ink}/>
          <circle cx="39" cy="37" r="2.1" fill={ink}/>
        </g>
        <path d="M26 45 Q32 50 38 45" stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round"/>
        {!mono && (
          <>
            <circle cx="20" cy="43" r="2.6" fill="rgba(224,104,92,0.32)"/>
            <circle cx="44" cy="43" r="2.6" fill="rgba(224,104,92,0.32)"/>
          </>
        )}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 180 196" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 地面线 */}
      <path d="M46 178 Q90 170 134 178" stroke={mono ? 'currentColor' : 'var(--fog-light)'} strokeWidth="2.5" strokeLinecap="round"/>

      {/* 装饰星 */}
      {!mono && (
        <>
          <path d="M34 62 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 z" fill="var(--orange)" opacity="0.75"/>
          <path d="M152 118 l2 4.8 4.8 2 -4.8 2 -2 4.8 -2 -4.8 -4.8 -2 4.8 -2 z" fill="var(--teal)" opacity="0.65"/>
        </>
      )}

      <g className="xian-bob" style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        {/* 旗杆 + 摆动小旗 */}
        <path d="M140 152 L140 48" stroke={ink} strokeWidth="3.4" strokeLinecap="round"/>
        <g className="xian-flag" style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }}>
          <path d="M140 50 Q154 57 171 50 Q162 61 171 72 Q154 65 140 72 Z"
            fill={flagFill} stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round"/>
          <path d="M152 58 l1.6 3.8 3.8 1.6 -3.8 1.6 -1.6 3.8 -1.6 -3.8 -3.8 -1.6 3.8 -1.6 z"
            fill={mono ? 'currentColor' : 'var(--card)'} opacity={mono ? 1 : 0.9}/>
        </g>

        {/* 腿和鞋 */}
        <path d="M80 140 L76 166" stroke={ink} strokeWidth="3.4" strokeLinecap="round"/>
        <path d="M102 140 L106 166" stroke={ink} strokeWidth="3.4" strokeLinecap="round"/>
        <path d="M65 168 Q76 173 87 168" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round"/>
        <path d="M97 168 Q108 173 119 168" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round"/>

        {/* 身体 */}
        <path d="M61 102 Q56 138 69 154 L113 154 Q126 138 121 102 Q91 92 61 102 Z"
          fill={bodyFill} stroke={ink} strokeWidth={sw} strokeLinejoin="round"/>
        <path d="M79 100 Q91 108 103 100" stroke={moss} strokeWidth="3" fill="none" strokeLinecap="round"/>

        {/* 招手的手 + 扶旗杆的手 */}
        <path d="M65 110 Q50 102 47 87" stroke={ink} strokeWidth="3.4" fill="none" strokeLinecap="round"/>
        <circle cx="47" cy="85" r="3.4" fill={headFill} stroke={ink} strokeWidth="2.2"/>
        <path d="M118 110 Q130 102 137 92" stroke={ink} strokeWidth="3.4" fill="none" strokeLinecap="round"/>
        <circle cx="138" cy="90" r="3.4" fill={headFill} stroke={ink} strokeWidth="2.2"/>

        {/* 头 */}
        <circle cx="91" cy="62" r="24" fill={headFill} stroke={ink} strokeWidth={sw}/>
        {/* 小帽 */}
        <path d="M66 55 Q91 27 116 55 Z" fill={hatFill} stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round"/>
        <path d="M62 55 Q91 63 120 55" stroke={ink} strokeWidth={sw} fill="none" strokeLinecap="round"/>
        <circle cx="91" cy="31" r="2.6" fill={mono ? 'currentColor' : 'var(--card)'} stroke={ink} strokeWidth="1.8"/>

        {/* 脸 */}
        <g className="xian-eyes" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx="83" cy="62" r="2.4" fill={ink}/>
          <circle cx="99" cy="62" r="2.4" fill={ink}/>
        </g>
        <path d="M83 72 Q91 79 99 72" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round"/>
        {!mono && (
          <>
            <circle cx="76" cy="70" r="3.2" fill="rgba(224,104,92,0.32)"/>
            <circle cx="106" cy="70" r="3.2" fill="rgba(224,104,92,0.32)"/>
          </>
        )}
      </g>
    </svg>
  );
}
