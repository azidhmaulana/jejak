import { mapStorageKey } from './mapWorkspace';
import { useState } from 'react';
const storageKey = mapStorageKey('bms-online-map-keys-v1');
type Keys = Record<string, string>;
export function useMapKeys() {
  const [keys, setKeys] = useState<Keys>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return Object.fromEntries(
        ['google', 'maptiler'].map((id) => [id, typeof saved?.[id] === 'string' ? saved[id] : '']),
      );
    } catch {
      return {};
    }
  });
  const saveKey = (brand: string, value: string) => {
    const next = { ...keys, [brand]: value.trim() };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* The key still works for this visit. */
    }
    setKeys(next);
  };
  return { keys, saveKey };
}
