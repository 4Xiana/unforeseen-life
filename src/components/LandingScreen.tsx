import { useState, useEffect, useRef, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { PreferenceSheet } from './PreferenceSheet';
import { useSpeechInput } from '../hooks/useSpeechInput';
import type { UserProfile, SaveProfileInput, QuestPair } from '../types';

interface Props {
  onStart: (freeTime?: string) => void;
  onOpenHandbook: () => void;
  profile: UserProfile | null;
  pairs: QuestPair[];
  onSaveProfile: (input: SaveProfileInput) => Promise<void> | void;
}

const INTAKE_GROUPS: { label: string; options: string[] }[] = [
  {
    label: '时间',
    options: ['15分钟', '半小时', '1小时'],
  },
  {
    label: '人在哪儿',
    options: ['在家', '在街上', '在店里', '在公司/学校'],
  },
  {
    label: '和谁一起',
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

function HeartGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 13.2C4.6 10.6 2.4 8.7 2.4 6.1C2.4 4.3 3.7 3 5.3 3C6.3 3 7.3 3.5 8 4.4C8.7 3.5 9.7 3 10.7 3C12.3 3 13.6 4.3 13.6 6.1C13.6 8.7 11.4 10.6 8 13.2Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
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

export function LandingScreen({ onStart, onOpenHandbook, profile, pairs, onSaveProfile }: Props) {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [pressed, setPressed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // 喜好档案弹层 + 首次提示的本次关闭（未填时下次进来仍提示）
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  // 按住说话松手即提交：识别结束的最终文本直接拿来开局
  const voice = useSpeechInput(text, setText, (finalText) => onStart(finalText));
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
    setMode(m => (m === 'voice' ? 'keyboard' : 'voice'));
    if (mode === 'keyboard') {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  // 「先出发再说」：有文字按文字走，什么都没填就按 15 分钟兜底，不挡用户
  const handleGo = () => {
    voice.reset();
    onStart(text.trim() || '我有15分钟空闲，你看着安排吧');
  };

  // ── 按住说话手势 ──
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setPressed(true);
    voice.begin();
  };
  const finishHold = () => {
    if (!pressed) return;
    setPressed(false);
    voice.end();
  };
  // 指针划出按钮 = 取消，不上传
  const cancelHold = () => {
    if (!pressed) return;
    setPressed(false);
    setText('');
    setElapsed(0);
    voice.reset();
  };

  const listening = voice.listening;

  return (
    <div className="flex-1 w-full flex flex-col relative overflow-hidden">
      {/* 装饰圆点 */}
      <div className="absolute top-10 right-8 w-24 h-24 rounded-full bg-moss/[0.05] pointer-events-none"/>
      <div className="absolute bottom-40 left-6 w-16 h-16 rounded-full bg-orange/[0.07] pointer-events-none"/>
      <div className="absolute top-1/3 left-2 w-10 h-10 rounded-full bg-teal/[0.06] pointer-events-none"/>

      {/* ── 右上角：喜好档案入口；未完成首访引导时带呼吸红点 ── */}
      <div className="absolute top-3 right-3 z-10">
        <button
          type="button"
          aria-label={profile?.onboarded ? '编辑喜好档案' : '填写喜好，让推荐更准'}
          onClick={() => setSheetOpen(true)}
          className="relative w-9 h-9 rounded-full bg-card/80 backdrop-blur border border-paper-edge/70 shadow-sm flex items-center justify-center text-moss hover:text-moss-deep active:scale-95 transition-transform"
        >
          <HeartGlyph size={17} />
          {!profile?.onboarded && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-coral ring-2 ring-paper animate-pulse"/>
          )}
        </button>

        {/* 首次可关闭小提示：非阻断，无视也能正常出发 */}
        {!profile?.onboarded && !hintDismissed && (
          <div className="absolute top-11 right-0 w-44 index-card p-2.5 animate-fade-in">
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => setHintDismissed(true)}
              className="absolute top-1 right-1.5 text-fog/70 hover:text-ink text-[13px] leading-none"
            >
              ×
            </button>
            <p
              className="text-ink-2 text-[12px] leading-[1.7] pr-3"
              onClick={() => setSheetOpen(true)}
            >
              点这里告诉我你的喜好，我能把支线推得更合你心意 ✨
            </p>
          </div>
        )}
      </div>

      {/* ── 顶部：吱呀 + 名字 + slogan ── */}
      <div className={`shrink-0 flex flex-col items-center pt-12 px-6 bg-paper transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
        <XianMascot variant="face" size={152} />
        <div className="font-display text-ink text-[21px] leading-none mt-1.5">吱呀</div>
        <h1 className="font-slogan text-ink text-[20px] leading-none mt-3">
          生活有主线，快乐在支线
        </h1>
        <svg width="104" height="9" viewBox="0 0 120 10" fill="none" className="mt-1 text-moss">
          <path d="M3 7 Q30 2 60 6 Q90 9 117 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* ── 中部：语音 / 键盘 二态；矮屏时整区可滚动，绝不与底部按钮重叠 ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 w-full max-w-sm mx-auto px-6 overflow-y-auto scrollbar-hide">
        {mode === 'voice' ? (
          <div key="voice" className="min-h-full flex flex-col justify-start items-center pt-6 animate-fade-in">
            {/* 引导语 / 实时转写卡 */}
            <div className="w-full min-h-[64px] flex items-center justify-center px-2 mb-4">
              {listening ? (
                <div className="index-card w-full px-4 py-3" style={{ transform: 'rotate(-0.6deg)' }}>
                  <p className="text-ink text-[14px] leading-[1.7]">
                    {text.trim() || <span className="text-fog/70">正在聆听，说吧…</span>}
                  </p>
                </div>
              ) : (
                <p className="text-ink-2 text-[13.5px] leading-[1.9] text-center">
                  和我讲讲你现在的位置，有多少空闲吧<br />
                  让吱呀带你出发～
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
              onPointerDown={handlePointerDown}
              onPointerUp={finishHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onContextMenu={e => e.preventDefault()}
              className="relative w-[112px] h-[112px] rounded-full text-card bg-moss hover:bg-moss-deep shadow-btn flex items-center justify-center touch-none select-none transition-all duration-200"
              style={{
                transform: listening ? 'scale(1.08)' : pressed ? 'scale(0.96)' : 'scale(1)',
              }}
            >
              {listening && (
                <span className="absolute inset-0 rounded-full border-[3px] border-moss/50 animate-ping"/>
              )}
              <MicGlyph size={32} />
            </button>
            <span className="text-[14px] mt-2.5 text-fog">
              {listening ? '松开，立即出发' : '按住说话'}
            </span>

            {voice.error && (
              <p className="mt-3 text-coral text-[12.5px] text-center leading-relaxed">
                {voice.error}
              </p>
            )}
          </div>
        ) : (
          <div key="keyboard" className="animate-fade-in flex flex-col pt-1 pb-10">
            <div className="bg-card border-2 border-paper-edge/80 rounded-3xl p-4 shadow-paper">
              {INTAKE_GROUPS.map((g, gi) => (
                <div
                  key={g.label}
                  className={gi === 0
                    ? 'flex items-start gap-2.5'
                    : 'flex items-start gap-2.5 border-t border-dashed border-ink/10 mt-3.5 pt-3'}
                >
                  <span className="shrink-0 w-14 pt-1.5 text-right font-hand text-fog text-[13px]">{g.label}</span>
                  <div className="flex-1 flex flex-wrap gap-1.5">
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

            <div className="relative mt-4">
              <input
                id="landing-text-input"
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGo()}
                placeholder="点上面的词填进来，也可以直接打字跟我说"
                className="w-full bg-card border-2 border-paper-edge/80 rounded-full pl-4 pr-12 py-3 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50"
              />
              <button
                type="button"
                aria-label="发送，让吱呀带你出发"
                onClick={handleGo}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-moss hover:bg-moss-deep text-card flex items-center justify-center active:scale-95 transition-all"
              >
                <PaperPlaneGlyph size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 底部操作条：支线手账 / 编辑(键盘) / 先出发再说 ── */}
      <div className="shrink-0 px-7 pb-7 pt-2">
        <div className="max-w-sm mx-auto flex items-center justify-between">
          <button
            type="button"
            aria-label="支线手账"
            onClick={onOpenHandbook}
            className="rounded-full pl-4 pr-5 py-3 text-[15px] flex items-center gap-1.5 bg-card text-ink active:scale-95 transition-transform"
            style={{ boxShadow: '0 2px 8px rgba(45,42,38,0.06)' }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-orange">
              <path d="M7 1L8.5 4.5L12 5L9.5 7.5L10 11L7 9.5L4 11L4.5 7.5L2 5L5.5 4.5L7 1Z" fill="currentColor" strokeLinejoin="round"/>
            </svg>
            支线手账
          </button>

          <button
            type="button"
            aria-label={mode === 'keyboard' ? '切回语音' : '改用键盘输入'}
            onClick={toggleMode}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-moss/[14%] text-moss-deep hover:bg-moss/[22%] active:scale-95 transition-all"
          >
            {mode === 'keyboard' ? <MicGlyph size={20} /> : <PencilGlyph size={20} />}
          </button>

          <button
            type="button"
            aria-label="先出发再说"
            onClick={handleGo}
            className="rounded-full px-6 py-3 text-[15px] text-card bg-moss hover:bg-moss-deep shadow-btn active:scale-95 transition-all"
          >
            先出发再说
          </button>
        </div>
      </div>

      <PreferenceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={profile}
        pairs={pairs}
        onSave={onSaveProfile}
      />
    </div>
  );
}
