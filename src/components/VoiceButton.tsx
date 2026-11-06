import type { SpeechPhase } from '../speechRecognition';

interface VoiceButtonProps {
  listening: boolean;
  phase?: SpeechPhase;
  error?: string | null;
  onToggle: () => void;
  disabled?: boolean;
  /** bar = 聊天输入胶囊内的圆形按钮；corner = 卡片输入框右上角的小按钮 */
  variant?: 'bar' | 'corner';
}

function MicIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="6" y="2" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3.5 7.5C3.5 10 5.5 11.5 8 11.5C10.5 11.5 12.5 10 12.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 11.5V14M5.5 14H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function StopIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>
    </svg>
  );
}

export function VoiceStatus({ phase, error }: { phase: SpeechPhase; error?: string | null }) {
  const message = error || (phase === 'starting' ? '正在启动麦克风，请先允许权限…'
    : phase === 'stopping' ? '正在整理识别文字…'
    : phase === 'ready' ? '已听清，松手即可发送' : '');
  if (!message) return null;
  return <p role="status" className={`mt-2 px-1 text-[12px] leading-relaxed ${error ? 'text-coral' : 'text-fog'}`}>{message}</p>;
}

export function VoiceButton({ listening, phase, error, onToggle, disabled, variant = 'bar' }: VoiceButtonProps) {
  const busy = phase === 'starting' || phase === 'stopping';
  const title = error
    ? error
    : busy
      ? '正在处理语音，点一下结束'
    : listening
      ? '正在聆听，点一下停止（文字会留在输入框里）'
      : '语音输入：点一下开始说话';

  if (variant === 'corner') {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={title}
        aria-label={title}
        className={`absolute top-1 right-1 w-11 h-11 flex items-center justify-center rounded-full border transition-all duration-200 shrink-0 z-10 ${
          listening
            ? 'bg-coral text-card border-coral ring-4 ring-coral/20'
            : error
              ? 'bg-card text-coral border-coral/50'
              : 'bg-card/90 text-fog border-fog-light/70 hover:text-moss hover:border-moss/50'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {busy ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : listening ? <StopIcon size={13} /> : <MicIcon size={13} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-200 shrink-0 ${
        listening
          ? 'bg-coral text-card ring-4 ring-coral/20'
          : error
            ? 'text-coral bg-coral/10 hover:bg-coral/15'
            : 'text-fog hover:text-moss hover:bg-moss/10'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {busy ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : listening ? <StopIcon size={17} /> : <MicIcon size={17} />}
    </button>
  );
}
