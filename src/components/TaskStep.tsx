import { useState, useRef, useEffect, useId } from 'react';
import type { PublishedStep, SubmissionType } from '../types';
import { VoiceButton } from './VoiceButton';
import { useSpeechInput } from '../hooks/useSpeechInput';

// ── 步骤提交动作区：聊天任务卡与任务进度抽屉共用一套 ──
// check=就位打卡按钮；text=文字证物输入；photo=拍照 + 回答（两者齐备才放行）。
// compact 给抽屉里的窄卡片用：更小的留白与字号。

interface StepSubmitAreaProps {
  step: PublishedStep;
  onCheck: () => void;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function StepSubmitArea({ step, onCheck, onSubmitText, onSubmitPhoto, disabled, compact }: StepSubmitAreaProps) {
  const [textValue, setTextValue] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 聊天卡与抽屉可能同时挂载，useId 保证各自的 <input>/<label> 配对不串
  const inputId = `task-photo-${useId()}`;
  const textVoice = useSpeechInput(textValue, setTextValue);
  const answerVoice = useSpeechInput(answerValue, setAnswerValue);

  // 照片预览的 object URL 在换图/卸载时释放，避免泄漏
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const handleTextSubmit = () => {
    if (!textValue.trim() || disabled) return;
    textVoice.reset();
    onSubmitText(textValue.trim());
    setTextValue('');
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !disabled) {
      setPhotoFile(file);
      setPhotoUrl(URL.createObjectURL(file));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoSubmit = () => {
    // 照片与回答必须同时齐备才允许提交
    if (!photoFile || !answerValue.trim() || disabled) return;
    answerVoice.reset();
    onSubmitPhoto(photoFile, answerValue.trim());
  };

  const primaryBtn = `${compact ? 'py-2.5 text-[14px]' : 'py-3 text-[16px]'} w-full bg-moss text-ink font-display rounded-full shadow-btn hover:bg-moss-deep hover:text-card transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 px-5`;

  if (step.submissionType === 'check') {
    return (
      <button onClick={onCheck} disabled={disabled} className={primaryBtn}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        确认完成
      </button>
    );
  }

  if (step.submissionType === 'text') {
    return (
      <div className="space-y-2">
        <div className="relative">
          <textarea
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextSubmit();
              }
            }}
            placeholder={textVoice.listening ? '正在聆听，说完点一下麦克风…' : (step.proofPrompt ? `按上面的要求交证物：${step.proofPrompt}` : '在此写下你的记录...')}
            disabled={disabled}
            rows={compact ? 2 : 3}
            className="w-full bg-paper border border-fog-light text-ink p-3.5 pr-11 text-[14px] leading-relaxed resize-none focus:border-moss focus:outline-none placeholder:text-fog rounded-2xl writing-lines"
          />
          {textVoice.supported && (
            <VoiceButton
              variant="corner"
              listening={textVoice.listening}
              error={textVoice.error}
              onToggle={textVoice.toggle}
              disabled={disabled}
            />
          )}
        </div>
        <button onClick={handleTextSubmit} disabled={disabled || !textValue.trim()} className={primaryBtn}>
          提交记录
        </button>
      </div>
    );
  }

  // photo：拍照/选图预览 + 文字回答，缺一不可提交
  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoChange}
        disabled={disabled}
        className="hidden"
        id={inputId}
      />

      {!photoUrl ? (
        <label htmlFor={inputId} className={`block ${disabled ? 'pointer-events-none' : ''}`}>
          <div className={`w-full border-2 border-dashed border-fog-light rounded-2xl bg-paper/60 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-moss/60 hover:bg-paper transition-all duration-200 ${disabled ? 'opacity-50' : ''} ${compact ? 'py-5' : 'py-8'}`}>
            <svg width={compact ? 24 : 28} height={compact ? 19 : 22} viewBox="0 0 28 22" fill="none" className="text-fog">
              <rect x="1" y="3" width="26" height="18" rx="3" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="14" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="21" cy="7" r="1" fill="currentColor"/>
              <path d="M1 16L6 12L11 16L17 11L23 15L27 12" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" opacity="0.5"/>
            </svg>
            <span className="font-hand text-fog text-[15px]">点击拍照记录</span>
            <span className="text-[11px] text-fog/70">需要使用相机</span>
          </div>
        </label>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-fog-light bg-paper">
          <img src={photoUrl} alt="待提交的现场照片" className={`w-full ${compact ? 'max-h-44' : 'max-h-60'} object-cover`} />
          {!disabled && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-2.5 right-2.5 bg-card/90 backdrop-blur text-[12px] font-hand text-fog hover:text-moss border border-fog-light/70 px-3 py-1.5 rounded-full shadow-paper-sm transition-colors"
            >
              换一张
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <textarea
          value={answerValue}
          onChange={e => setAnswerValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handlePhotoSubmit();
            }
          }}
          placeholder={answerVoice.listening ? '正在聆听，说完点一下麦克风…' : '对着照片回答上面那个问题，一句话就行…'}
          disabled={disabled}
          rows={2}
          className="w-full bg-paper border border-fog-light text-ink p-3.5 pr-11 text-[14px] leading-relaxed resize-none focus:border-moss focus:outline-none placeholder:text-fog rounded-2xl writing-lines"
        />
        {answerVoice.supported && (
          <VoiceButton
            variant="corner"
            listening={answerVoice.listening}
            error={answerVoice.error}
            onToggle={answerVoice.toggle}
            disabled={disabled}
          />
        )}
      </div>
      <button
        onClick={handlePhotoSubmit}
        disabled={disabled || !photoFile || !answerValue.trim()}
        className={primaryBtn}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        提交照片和回答
      </button>
    </div>
  );
}

interface Props {
  step: PublishedStep;
  total: number;
  onCheck: () => void;
  onSubmitText: (text: string) => void;
  onSubmitPhoto: (file: File, description: string) => void;
  disabled?: boolean;
  // 历史步骤：动作区替换为"已完成"的存档标记
  done?: boolean;
}

export function TaskStep({ step, total, onCheck, onSubmitText, onSubmitPhoto, disabled, done }: Props) {
  const stepNum = step.index + 1;

  return (
    <div className="my-4 animate-slide-up">
      <div className="paper-card relative overflow-hidden rotate-neg-1 p-5 rounded-[24px]">
        <div className="tape tape-top-left" />

        <div className="flex items-center justify-between mb-4 pb-3 perforation">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-moss">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
              <path d="M4 7H10M7 4V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="font-hand text-[15px] text-fog leading-none">
              任务
            </span>
          </div>
          <span className="font-display text-fog text-[14px] leading-none">
            {String(stepNum).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </div>

        <div className="flex items-center gap-1 mb-4">
          {Array.from({ length: total }, (_, i) => {
            const idx = i + 1;
            const isDone = idx < stepNum;
            const isCurrent = idx === stepNum;
            return (
              <div key={i} className="flex items-center flex-1">
                <div
                  className={`w-6 h-6 text-[11px] rounded-full flex items-center justify-center font-display shrink-0 transition-all duration-300 ${
                    isDone
                      ? 'bg-teal text-card'
                      : isCurrent
                        ? 'bg-moss text-card ring-4 ring-moss/20'
                        : 'bg-paper-2 text-fog border border-fog-light'
                  }`}
                >
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : idx}
                </div>
                {i < total - 1 && (
                  <div className={`flex-1 h-1 mx-1 rounded-full ${isDone ? 'bg-teal/50' : 'bg-fog-light/60'}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-paper border border-paper-edge/60 p-4 mb-4 rounded-2xl relative">
          <div className="absolute top-2.5 bottom-2.5 left-0 w-1 bg-moss rounded-full"/>
          <p className="text-ink font-semibold pl-3 text-[15px] leading-[1.75]">
            {step.instruction}
          </p>
          {step.hint && (
            <p className="font-hand text-fog text-[14px] mt-2 leading-relaxed pl-3">
              {step.hint}
            </p>
          )}
        </div>

        {!done && step.proofPrompt && (
          <div className="mb-4 flex items-start gap-2 bg-teal/10 border border-teal/30 rounded-2xl px-3.5 py-2.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-teal shrink-0 mt-0.5">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.6"/>
              <path d="M5 8.2L7.2 10.2L11.2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-[13.5px] text-ink-2 leading-relaxed">
              <span className="font-hand text-teal mr-1">交证物</span>
              {step.proofPrompt}
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-px bg-fog-light"/>
            <span className={`font-hand text-[14px] leading-none ${done ? 'text-teal' : 'text-fog'}`}>
              {done ? '已完成' : submissionTypeShort(step.submissionType)}
            </span>
            <div className="flex-1 h-px bg-fog-light"/>
          </div>

          {done ? (
            <div className="w-full flex items-center justify-center gap-2 text-teal py-3">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-display text-[15px]">这一步，已完成</span>
            </div>
          ) : (
            <StepSubmitArea
              step={step}
              onCheck={onCheck}
              onSubmitText={onSubmitText}
              onSubmitPhoto={onSubmitPhoto}
              disabled={disabled}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function submissionTypeShort(type: SubmissionType): string {
  switch (type) {
    case 'check': return '就位打卡';
    case 'text': return '交文字证物';
    case 'photo': return '拍照 + 回答';
  }
}
