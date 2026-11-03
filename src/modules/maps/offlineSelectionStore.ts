import { create } from 'zustand';
import type { OfflineBounds } from './offlineSelection';
type State = {
  active: boolean;
  returnToSettings: boolean;
  result: OfflineBounds | null;
  begin: (fromSettings?: boolean) => void;
  finish: (bounds: OfflineBounds | null) => void;
};
export const useOfflineSelection = create<State>((set) => ({
  active: false,
  returnToSettings: false,
  result: null,
  begin: (returnToSettings = false) =>
    set((state) => (state.active ? state : { active: true, returnToSettings, result: null })),
  finish: (result) => set({ active: false, result }),
}));
