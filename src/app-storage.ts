import { DEMO_PREFIX, isDemoMode } from './demo/mode';

export type AppStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function scopedStorage(kind: 'localStorage' | 'sessionStorage'): AppStorage {
  const memory = new Map<string, string | null>();
  const keyFor = (key: string) => isDemoMode() ? `${DEMO_PREFIX}${key}` : key;
  return {
    getItem(key) {
      if (!isDemoMode()) return window[kind].getItem(key);
      if (memory.has(key)) return memory.get(key) ?? null;
      try { return window[kind].getItem(keyFor(key)); } catch { return memory.get(key) ?? null; }
    },
    setItem(key, value) {
      if (!isDemoMode()) { window[kind].setItem(key, value); return; }
      memory.set(key, value);
      try { window[kind].setItem(keyFor(key), value); } catch { /* retained in memory */ }
    },
    removeItem(key) {
      if (!isDemoMode()) { window[kind].removeItem(key); return; }
      memory.set(key, null);
      try { window[kind].removeItem(keyFor(key)); } catch { /* keep the in-memory tombstone */ }
    },
  };
}

export const appLocalStorage = scopedStorage('localStorage');
export const appSessionStorage = scopedStorage('sessionStorage');
