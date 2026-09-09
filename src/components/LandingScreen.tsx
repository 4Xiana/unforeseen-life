import { useState, useEffect, type ReactNode } from 'react';
import { XianMascot } from './XianMascot';
import { VoiceButton } from './VoiceButton';
import { useSpeechInput } from '../hooks/useSpeechInput';

interface Props {
  onStart: (freeTime?: string) => void;
}

const GREETING = '点两下你这会儿的情况，我立马给你找几件好玩的挑——哪怕只点个时间也够，剩下的我来兜。也可以直接打字跟我说。';

const INTAKE_GROUPS: { label: string; options: string[] }[] = [
  {
    label: '时间',
    options: ['我有15分钟空闲', '我有半个小时空闲', '我有一个小时空闲'],
  },
  {
    label: '人在哪儿',
    options: ['我在家里', '我在外面街上', '我在商场或店里逛', '我在公司或学校'],
  },
  {
    label: '和谁一起',
    options: ['我一个人', '我和朋友一起', '我和对象一起', '我和家里人一起'],
  },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-hand text-[13.5px] leading-none px-3.5 py-2 rounded-full border transition-all duration-200 active:scale-95 ${
        active
          ? 'border-moss bg-moss/[12%] text-ink shadow-paper'
          : 'border-fog-light/60 bg-card text-fog/80 hover:text-ink hover:border-fog-light'
      }`}
    >
      {children}
    </button>
  );
}

export function LandingScreen({ onStart }: Props) {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'hero' | 'setup'>('hero');
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const voice = useSpeechInput(text, setText);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // 进入 setup 屏后，气泡先落位，选项区短延迟淡入
  useEffect(() => {
    if (view !== 'setup') return;
    setReady(false);
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, [view]);

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
  const canSend = text.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    voice.reset();
    onStart(text.trim());
  };

  return (
    <div className="flex-1 w-full flex flex-col relative overflow-hidden">
      {/* 装饰圆点 */}
      <div className="absolute top-10 right-8 w-24 h-24 rounded-full bg-moss/[0.05] pointer-events-none"/>
      <div className="absolute bottom-36 left-6 w-16 h-16 rounded-full bg-orange/[0.07] pointer-events-none"/>
      <div className="absolute top-1/3 left-2 w-10 h-10 rounded-full bg-teal/[0.06] pointer-events-none"/>

      {view === 'hero' ? (
        /* ── 第一屏：角色 + IP slogan + 入口 ─────────────── */
        <div key="hero" className="flex-1 flex flex-col items-center justify-center px-6 text-center animate-fade-in">
          <div className={`transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <XianMascot size={168} />
          </div>

          <div className={`mt-2 transition-all duration-700 delay-150 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="font-display text-ink text-[27px] leading-none">小闲</div>
            <div className="font-hand text-fog text-[15px] mt-1.5">你的支线任务伙伴</div>
          </div>

          <div className={`mt-7 transition-all duration-700 delay-300 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h1 className="font-display text-ink text-[28px] leading-[1.4]">
              生活有主线，快乐在支线
            </h1>
            <svg width="120" height="10" viewBox="0 0 120 10" fill="none" className="mx-auto mt-1 text-moss">
              <path d="M3 7 Q30 2 60 6 Q90 9 117 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
            <p className="text-ink-2 text-[13px] mt-4 leading-[1.9]">
              等车、午休、睡前，那些随手就刷掉的空档，<br/>
              其实都能变成一件好玩的小事——十几分钟，就能出门去试试。
            </p>
          </div>

          <button
            onClick={() => setView('setup')}
            className={`mt-8 inline-flex items-center gap-2 py-3.5 px-8 bg-moss text-ink font-display text-[17px] rounded-full shadow-btn hover:bg-moss-deep hover:text-card active:scale-[0.97] transition-all duration-700 ease-out ${
              mounted ? 'opacity-100 translate-y-0 delay-500' : 'opacity-0 translate-y-4'
            }`}
          >
            我有空，挑个好玩的
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M3 7H10M7.5 4L11 7L7.5 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ) : (
        /* ── 第二屏：小闲打招呼 + 快捷短语填进输入框 ─────────────── */
        <div key="setup" className="flex-1 flex flex-col px-5 w-full max-w-sm mx-auto animate-fade-in relative min-h-0">
          <button
            onClick={() => setView('hero')}
            className="absolute top-2 left-2 z-10 flex items-center gap-1 font-hand text-fog/70 hover:text-ink text-[14px] py-1.5 px-2.5 rounded-full transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M11 7H4M6.5 4L3 7L6.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            返回
          </button>

          <div className="shrink-0 flex items-end gap-3 mt-11 mb-5">
            <div className="shrink-0 -mb-1">
              <XianMascot variant="face" size={56} />
            </div>
            <div className="index-card flex-1 px-4 py-3 relative" style={{ transform: 'rotate(-0.5deg)' }}>
              <p className="text-ink text-[14px] leading-[1.8]">{GREETING}</p>
            </div>
          </div>

          <div className={`flex-1 flex flex-col justify-center transition-all duration-500 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
            <div className="bg-card border-2 border-paper-edge/80 rounded-3xl p-4 shadow-paper">
              {INTAKE_GROUPS.map((g, gi) => (
                <div key={g.label} className={gi === 0 ? 'flex items-start gap-2.5' : 'flex items-start gap-2.5 border-t border-dashed border-ink/10 mt-3.5 pt-3'}>
                  <span className="shrink-0 w-14 pt-2 text-right font-hand text-fog text-[13px]">{g.label}</span>
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

            <div className="flex gap-2 items-center mt-4">
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={voice.listening ? '正在聆听，说完点一下麦克风…' : '点上面的话填进来，也可以直接打字跟我说'}
                autoFocus
                className="flex-1 min-w-0 bg-card border-2 border-paper-edge/80 rounded-full px-4 py-3 text-[13.5px] text-ink focus:border-moss focus:outline-none placeholder:text-fog/50"
              />
              {voice.supported && (
                <VoiceButton
                  listening={voice.listening}
                  error={voice.error}
                  onToggle={voice.toggle}
                />
              )}
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="发送"
                className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
                  canSend
                    ? 'bg-moss text-ink shadow-btn hover:bg-moss-deep hover:text-card'
                    : 'bg-paper-edge/40 text-fog/50 cursor-not-allowed'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8L13 3L10.5 13L8 9L3 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`shrink-0 text-center pb-3 transition-all duration-700 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <p className="font-hand text-fog/40 text-[13px]">
          unforeseen · life · 支线任务
        </p>
      </div>
    </div>
  );
}
