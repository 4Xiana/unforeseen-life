import { useState, useEffect, useRef, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { useSpeechHold } from '../hooks/useSpeechHold';
import { VoiceStatus } from './VoiceButton';

interface Props {
  onStart: (freeTime?: string) => void;
  onResume?: () => void;
  busy?: boolean;
  onOpenLibrary: () => void;
  onOpenGuide: () => void;
  needsPreferences?: boolean;
}

const INTAKE_GROUPS: { label: string; options: string[] }[] = [
  {
    label: '时间',
    options: ['15分钟', '半小时', '1小时'],
  },
  {
    label: '在哪',
    options: ['在家', '在街上', '在店里', '在公司/学校'],
  },
  {
    label: '和谁',
    options: ['一个人', '和朋友', '和对象', '和家里人'],
  },
];

function MicGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="6" y="1.6" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3.2 7.4C3.2 10.1 5.3 11.7 8 11.7C10.7 11.7 12.8 10.1 12.8 7.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 11.7V14.3M5.2 14.3H10.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PencilGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M10.8 2.8L13.2 5.2L5.6 12.8H2.8V10L10.8 2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9.4 4.2L11.8 6.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PaperPlaneGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M14.2 1.8L2 7.1C1.4 7.3 1.4 8.1 2.1 8.3L5.4 9.6L6.6 13.2C6.8 13.8 7.6 13.9 8 13.4L9.7 11.2L12.9 13.6C13.4 14 14.2 13.7 14.3 13L15 2.8C15.1 2.1 14.7 1.6 14.2 1.8Z"
        fill="currentColor"
      />
      <path d="M5.4 9.6L12.8 3.4L7.2 10.8L5.4 9.6Z" fill="#FDFBF7"/>
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`font-hand text-[12.5px] leading-none px-3 py-1.5 rounded-full border transition-all duration-200 active:scale-95 ${
        active
          ? 'border-moss bg-moss/[12%] text-ink shadow-paper'
          : 'border-fog-light/60 bg-card text-fog/80 hover:text-ink hover:border-fog-light'
      }`}
    >
      {children}
    </button>
  );
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function LandingScreen({ onStart, onResume, busy = false, onOpenLibrary, onOpenGuide, needsPreferences }: Props) {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  // 按住说话松手即提交：识别结束的最终文本直接拿来开局
  const voice = useSpeechInput(text, setText, (finalText) => { if (!busy) onStart(finalText); });
  const hold = useSpeechHold(voice, !voice.supported || busy);
  // voice = 默认语音主屏；keyboard = 点编辑钮后展开输入框和 chips（不支持语音时默认键盘）
  const [mode, setMode] = useState<'voice' | 'keyboard'>(voice.supported ? 'voice' : 'keyboard');

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 切进键盘模式自动聚焦输入框（preventScroll：别把顶部 chips 顶出视野）
  useEffect(() => {
    if (mode !== 'keyboard') return;
    const el = document.getElementById('landing-text-input');
    const t = setTimeout(() => el?.focus({ preventScroll: true }), 90);
    return () => clearTimeout(t);
  }, [mode]);

  // 每次切换模式，中部滚动区回到顶部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [mode]);

  // 录音正计时（不是限时，只做陪伴反馈）
  useEffect(() => {
    if (!voice.listening) return;
    setElapsed(0);
    const startedAt = Date.now();
    const id = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      250,
    );
    return () => window.clearInterval(id);
  }, [voice.listening]);

  // chips 是快捷短语：点一下填进输入框，再点一下取出来
  const toggleChip = (phrase: string) => {
    setText(prev => {
      const list = prev.split('，').map(s => s.trim()).filter(Boolean);
      const idx = list.indexOf(phrase);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(phrase);
      return list.join('，');
    });
  };

  const activePhrases = text.split('，').map(s => s.trim()).filter(Boolean);

  // 语音 / 键盘互切；从键盘切走时主动让输入框失焦，确保手机软键盘同步收起
  const toggleMode = () => {
    voice.cancel();
    setMode(m => (m === 'voice' ? 'keyboard' : 'voice'));
    if (mode === 'keyboard') {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  // 「先出发再说」：有文字按文字走，什么都没填就按 15 分钟兜底，不挡用户
  const handleGo = () => {
    if (busy) return;
    voice.reset();
    onStart(text.trim() || '想探索点有趣的事，先推荐一条15分钟能做的支线吧');
  };

  const listening = voice.listening;

  return (
    <div className={`landing-screen landing-${mode} flex-1 min-h-0 w-full flex flex-col relative overflow-hidden`}>
      <button className="absolute top-2 right-4 z-10 min-h-[44px] px-3 text-[12px] text-fog" onClick={() => { voice.cancel(); onOpenGuide(); }}>使用指南</button>
      {/* ── 顶部：吱呀 + 名字 + slogan ── */}
      <div className={`landing-hero shrink-0 flex flex-col items-center pt-12 px-6 bg-paper transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
        <XianMascot variant="face" size={152} className="landing-mascot" />
        <div className="font-display text-ink text-[21px] leading-none mt-1.5">吱呀</div>
        <h1 className="font-slogan text-ink text-[20px] leading-none mt-3">
          生活有主线，快乐在支线
        </h1>
      </div>

      {/* ── 中部：语音 / 键盘 二态；矮屏时整区可滚动，绝不与底部按钮重叠 ── */}
      <div ref={scrollRef} className="landing-content flex-1 min-h-0 w-full max-w-sm mx-auto px-4 sm:px-6 overflow-y-auto scrollbar-hide">
        {mode === 'voice' ? (
          <div key="voice" className="landing-voice-content min-h-full flex flex-col justify-start items-center pt-6 animate-fade-in">
            {/* 引导语 / 实时转写卡 */}
            <div className="w-full min-h-[64px] flex items-center justify-center px-2 mb-4">
              {voice.active || text.trim() ? (
                <div className="index-card w-full px-4 py-3" style={{ transform: 'rotate(-0.6deg)' }}>
                  <p className="text-ink text-[14px] leading-[1.7]">
                    {text.trim() || <span className="text-fog/70">{listening ? '我在听，说吧…' : '麦克风准备中…'}</span>}
                  </p>
                </div>
              ) : (
                <p className="text-ink-2 text-[13.5px] leading-[1.9] text-center">
                  今天，想试点什么？<br />
                  说说你的想法，吱呀陪你一起找。
                </p>
              )}
            </div>

            {/* 录音正计时（固定行高，避免布局跳动） */}
            <p className="h-5 font-hand text-moss text-[15px] tabular-nums">
              {listening ? fmtClock(elapsed) : ''}
            </p>

            <button
              type="button"
              aria-label="按住说话，松开发送"
              disabled={!voice.supported || busy}
              {...hold.handlers}
              className="landing-mic relative shrink-0 w-[112px] h-[112px] rounded-full text-card bg-moss hover:bg-moss-deep shadow-btn flex items-center justify-center touch-none select-none transition-all duration-200"
              style={{
                transform: listening ? 'scale(1.08)' : hold.pressed ? 'scale(0.96)' : 'scale(1)',
              }}
            >
              {listening && (
                <span className="absolute inset-0 rounded-full border-[3px] border-moss/50 animate-ping"/>
              )}
              <MicGlyph size={32} />
            </button>
            <span className="text-[14px] mt-2.5 text-fog">
              {voice.phase === 'starting' ? '麦克风准备中…' : listening && hold.pressed ? '松开发送，上滑取消' : listening ? '我在听…' : voice.phase === 'stopping' ? '正在整理你说的话…' : '按住，说说你的想法'}
            </span>

            <button type="button" onClick={hold.toggle} disabled={!voice.supported || busy || voice.phase === 'stopping'} className="text-[13px] text-moss-deep px-3 py-2 mt-1 rounded-full disabled:opacity-40">
              {voice.active ? '说好了，发送' : '点一下，也能开始说'}
            </button>
            <VoiceStatus phase={voice.phase} error={voice.error || (!voice.supported ? '暂时用不了语音，打字告诉我也可以。' : null)} />
          </div>
        ) : (
          <div key="keyboard" className="animate-fade-in flex flex-col pt-1 pb-10">
            <p className="text-ink-2 text-[13.5px] leading-[1.9] text-center mb-3">
              今天，想试点什么？<br />
              有想法就说，没有也没关系。
            </p>
            <div className="landing-intake bg-card border-2 border-paper-edge/80 rounded-3xl p-3 sm:p-4 shadow-paper">
              {INTAKE_GROUPS.map((g, gi) => (
                <div
                  key={g.label}
                  className={gi === 0
                    ? 'flex items-start gap-2.5'
                    : 'flex items-start gap-2.5 border-t border-dashed border-ink/10 mt-3.5 pt-3'}
                >
                  <span className="shrink-0 w-12 sm:w-14 pt-3 text-right font-hand text-fog text-[13px]">{g.label}</span>
                  <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                    {g.options.map(phrase => (
                      <Chip
                        key={phrase}
                        active={activePhrases.includes(phrase)}
                        onClick={() => toggleChip(phrase)}
                      >
                        {phrase}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="landing-input relative mt-4">
              <input
                id="landing-text-input"
                type="text"
                aria-label="告诉吱呀，你想试点什么"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGo()}
                placeholder="比如：想在家试点有创意的事"
                className="w-full bg-card border-2 border-paper-edge/80 rounded-full pl-4 pr-12 py-3 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50"
              />
              <button
                type="button"
                aria-label="发送想法，和吱呀一起找"
                disabled={busy}
                onClick={handleGo}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-moss hover:bg-moss-deep text-card flex items-center justify-center active:scale-95 transition-all"
              >
                <PaperPlaneGlyph size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 底部操作条：统一手册 / 编辑(键盘) / 先出发再说 ── */}
      <div className="landing-footer shrink-0 px-7 pb-7 pt-2">
        <div className="landing-actions max-w-sm mx-auto flex items-center justify-between">
          <button
            type="button"
            aria-label="我的手册"
            onClick={() => { voice.cancel(); onOpenLibrary(); }}
            className="relative rounded-2xl px-4 py-2 text-[15px] flex flex-col items-center bg-card text-ink active:scale-95 transition-transform"
            style={{ boxShadow: '0 2px 8px rgba(45,42,38,0.06)' }}
          >
            <span className="flex items-center gap-1.5"><span className="text-moss" aria-hidden>✳</span>我的手册
              {needsPreferences && <span className="w-1.5 h-1.5 bg-coral rounded-full" aria-hidden />}
            </span>
          </button>

          <button
            type="button"
            aria-label={mode === 'keyboard' ? '用语音聊聊' : '打字告诉吱呀'}
            onClick={toggleMode}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-moss/[14%] text-moss-deep hover:bg-moss/[22%] active:scale-95 transition-all"
          >
            {mode === 'keyboard' ? <MicGlyph size={20} /> : <PencilGlyph size={20} />}
          </button>

          <button
            type="button"
            aria-label={onResume ? '继续这条支线' : '给我点灵感'}
            onClick={onResume ? () => { voice.cancel(); onResume(); } : handleGo}
            className="rounded-full px-6 py-3 text-[15px] text-card bg-moss hover:bg-moss-deep shadow-btn active:scale-95 transition-all"
          >
            {onResume ? '继续这条支线' : '给我点灵感'}
          </button>
        </div>
      </div>

    </div>
  );
}
