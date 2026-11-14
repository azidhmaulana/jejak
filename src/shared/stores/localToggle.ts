import type { StoreApi } from 'zustand';

export function readLocalToggle(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === 'true' ? true : value === 'false' ? false : fallback;
  } catch {
    return fallback;
  }
}

export function persistLocalToggle<S>(store: StoreApi<S>, field: keyof S, key: string) {
  return store.subscribe((state, previous) => {
    if (state[field] === previous[field] || typeof state[field] !== 'boolean') return;
    try {
      localStorage.setItem(key, String(state[field]));
    } catch {
      // Keep the switch usable when browser storage is unavailable.
    }
  });
}
