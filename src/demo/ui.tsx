import { useEffect } from 'react';
import { isDemoMode } from './mode';

export function useDemoAction(action: string, callback: () => void): void {
  useEffect(() => {
    if (!isDemoMode()) return;
    const listener = (event: Event) => {
      if ((event as CustomEvent<{ action: string }>).detail?.action === action) callback();
    };
    window.addEventListener('xian-demo-action', listener);
    return () => window.removeEventListener('xian-demo-action', listener);
  }, [action, callback]);
}

export function DemoSampleButton({ children, onClick, disabled = false }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return isDemoMode() ? <button type="button" className="demo-sample-button" disabled={disabled} onClick={onClick}>{children}</button> : null;
}
