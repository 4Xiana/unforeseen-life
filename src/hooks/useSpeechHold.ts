import { useRef, useState, type PointerEvent, type MouseEvent, type KeyboardEvent } from 'react';
import type { SpeechInputApi } from './useSpeechInput';

/** Pointer capture tolerates finger drift; only an explicit upward swipe cancels. */
export function useSpeechHold(voice: SpeechInputApi, disabled = false) {
  const pointer = useRef<{ id: number; startY: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const cancel = () => {
    pointer.current = null;
    setPressed(false);
    voice.cancel();
  };
  const toggle = () => {
    if (disabled) return;
    if (voice.active) voice.end();
    else voice.begin();
  };
  return {
    pressed,
    toggle,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (disabled || e.button !== 0 || !e.isPrimary || pointer.current) return;
        e.preventDefault();
        pointer.current = { id: e.pointerId, startY: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressed(true);
        voice.begin();
      },
      onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
        if (pointer.current?.id === e.pointerId && e.clientY < pointer.current.startY - 64) cancel();
      },
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
        if (pointer.current?.id !== e.pointerId) return;
        pointer.current = null;
        setPressed(false);
        voice.end();
      },
      onPointerCancel: cancel,
      onLostPointerCapture: () => { if (pointer.current) cancel(); },
      // Keyboard and assistive activation use a two-click recording interaction.
      onClick: (e: MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) toggle(); },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => { if (e.key === 'Escape') cancel(); },
      onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
    },
  };
}
