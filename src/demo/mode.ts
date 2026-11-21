export const DEMO_PREFIX = 'xian.demo.';
const MODE_KEY = 'xian.demo.enabled';

function initialMode(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search).get('demo');
  if (query === '1' || query === '0') {
    try { window.localStorage.setItem(MODE_KEY, query); } catch { /* URL still works */ }
    return query === '1';
  }
  try { return window.localStorage.getItem(MODE_KEY) === '1'; } catch { return false; }
}

// A mode change always reloads: mounted hooks never mix real and sample state.
const enabled = initialMode();
export const isDemoMode = () => enabled;

export function setDemoMode(next: boolean): void {
  try { window.localStorage.setItem(MODE_KEY, next ? '1' : '0'); } catch { /* query fallback */ }
  const url = new URL(window.location.href);
  url.searchParams.set('demo', next ? '1' : '0');
  window.location.replace(url.toString());
}

export function resetDemo(): void {
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[kind];
      for (const key of Object.keys(storage)) {
        if (key.startsWith(DEMO_PREFIX) && key !== MODE_KEY) storage.removeItem(key);
      }
    } catch { /* reload resets in-memory fallback too */ }
  }
  setDemoMode(true);
}
