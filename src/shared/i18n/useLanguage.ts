import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage } from './runtime.js';

export function useLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => 'id' as const);
}
