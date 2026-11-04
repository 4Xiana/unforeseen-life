import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '../types';

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  isThinking?: boolean;
  steppingText?: string | null;
  showHeader?: boolean;
}

function TypingDots({ inline }: { inline?: boolean }) {
  const dots = (
    <>
      <span className="typing-dot"/>
      <span className="typing-dot" style={{ animationDelay: '0.2s' }}/>
      <span className="typing-dot" style={{ animationDelay: '0.4s' }}/>
    </>
  );
  if (inline) {
    return <span className="inline-flex items-center gap-1 ml-1 align-middle">{dots}</span>;
  }
  return <div className="flex items-center gap-1 py-1">{dots}</div>;
}

function SteppingSpinner() {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full border-2 border-fog-light border-t-moss animate-spin shrink-0"
      style={{ animationDuration: '0.8s' }}
    />
  );
}

export function ChatMessage({ message, isStreaming, isThinking, steppingText, showHeader = true }: Props) {
  const isNpc = message.role === 'npc';
  const isEmpty = !message.content || message.content.trim().length === 0;

  if (!isNpc) {
    return (
      <div className="flex justify-end animate-slide-in-right">
        <div className="max-w-[78%]">
          <div className="sticky-note rotate-neg-1 text-ink text-[14px] leading-[1.8] whitespace-pre-wrap break-words">
            {message.imageUrl && (
              <img
                src={message.imageUrl}
                alt="我提交的现场照片"
                className="w-full max-w-[240px] rounded-xl border border-paper-edge/70 mb-2 object-cover"
              />
            )}
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  const isStepping = !!steppingText;
  const isWaiting = isThinking && !isStepping;
  const showDotsOnly = isEmpty && isStreaming && !isStepping;

  return (
    <div className="flex justify-start animate-slide-in-left">
      <div className="max-w-[85%] flex gap-2.5">
        {showHeader ? (
          <img
            src="/agent_avatar.png"
            alt="吱呀"
            width={32}
            height={32}
            className="w-8 h-8 rounded-full mt-0.5 shrink-0 object-cover"
          />
        ) : (
          <div className="w-8 shrink-0" aria-hidden />
        )}
        <div className="flex-1 min-w-0">
          {showHeader && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-hand text-[15px] leading-none text-fog">
                吱呀
              </span>
            </div>
          )}
          <div className="index-card text-ink text-[14.5px] leading-[1.85] break-words">
            {showDotsOnly ? (
              <TypingDots/>
            ) : (
              <>
                {!isEmpty && (
                  <div className="markdown-body">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
                {isStepping ? (
                  <div className={`flex items-center gap-1.5 font-hand text-fog text-[15px] ${isEmpty ? 'py-0.5' : 'mt-1.5'}`}>
                    <SteppingSpinner/>
                    <span>{steppingText}</span>
                  </div>
                ) : isWaiting ? (
                  <TypingDots inline/>
                ) : (
                  isStreaming && !isEmpty && <span className="cursor-blink"/>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
