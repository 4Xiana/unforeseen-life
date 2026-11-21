import { useEffect, useState } from 'react';
import { getClientId } from '../handbook';
import { listGoals } from '../goals-api';

const key = () => `xian-app-guide-v1:${getClientId()}`;
type GuideState = number | 'pending' | 'off';
function read(): GuideState {
  try {
    const saved = localStorage.getItem(key());
    if (saved === null) return 'pending';
    if (/^[0-7]$/.test(saved)) {
      const step = Number(saved);
      // Former pages 1–4 duplicated the examples now embedded in the introduction.
      return step >= 1 && step <= 4 ? 0 : step;
    }
    return 'off';
  } catch { return 'pending'; }
}

export function useAppOnboarding() {
  const [step, setStep] = useState<GuideState>(read);
  function remember(value: string) {
    try { localStorage.setItem(key(), value); } catch { /* usable without storage */ }
  }
  const go = (next: number) => { remember(String(next)); setStep(next); };
  const close = (reason: 'done' | 'skipped' = 'skipped') => { remember(reason); setStep('off'); };
  return { step, active: typeof step === 'number', go, close, replay: () => go(0), setStep, remember };
}

/** Wait for persisted user data before deciding whether this is a first visit. */
export function useFirstVisitGuide(
  guide: ReturnType<typeof useAppOnboarding>,
  ready: boolean,
  existing: boolean,
) {
  useEffect(() => {
    if (guide.step !== 'pending' || !ready) return;
    let alive = true;
    async function decide() {
      try {
        const returning = existing || (await listGoals()).length > 0;
        if (!alive) return;
        guide.remember(returning ? 'existing' : '0');
        guide.setStep(returning ? 'off' : 0);
      } catch {
        // Do not interrupt the app when first-visit status cannot be established.
        if (alive) guide.setStep('off');
      }
    }
    void decide();
    return () => { alive = false; };
  }, [guide.step, ready, existing]);
}
