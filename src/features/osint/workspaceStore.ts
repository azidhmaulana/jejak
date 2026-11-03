import { useAuth } from '../auth/authStore';
import { create } from 'zustand';

export type WorkspacePanel =
  'layers' | 'objects' | 'weather' | 'sources' | 'settings' | 'analytics' | 'alerts';
function readIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export const useWorkspace = create<{
  camerasOpen: boolean;
  mapSettingsOpen: boolean;
  panel: WorkspacePanel | null;
  selectedId: string | null;
  favorites: string[];
  recent: string[];
  coordinates: [number, number];
  query: string;
  roads: boolean;
  roadsAvailable: boolean | null;
  cameraTab: 'all' | 'nearby' | 'favorites' | 'recent';
  selectCamera: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
}>((set) => ({
  camerasOpen: false,
  mapSettingsOpen: false,
  panel: null,
  selectedId: null,
  favorites: readIds('jejak-favorite-cameras'),
  recent: readIds('jejak-recent-cameras'),
  coordinates: [107.6191, -6.9175],
  query: '',
  cameraTab: 'all',
  roads: true,
  roadsAvailable: null,
  selectCamera: (selectedId) =>
    set((state) => {
      const recent = selectedId
        ? [selectedId, ...state.recent.filter((id) => id !== selectedId)].slice(0, 30)
        : state.recent;
      try {
        if (!useAuth.getState().user)
          localStorage.setItem('jejak-recent-cameras', JSON.stringify(recent));
      } catch {
        /* In-memory state remains usable. */
      }
      return { selectedId, recent };
    }),
  toggleFavorite: (id) =>
    set((state) => {
      const favorites = state.favorites.includes(id)
        ? state.favorites.filter((item) => item !== id)
        : [...state.favorites, id];
      try {
        if (!useAuth.getState().user)
          localStorage.setItem('jejak-favorite-cameras', JSON.stringify(favorites));
      } catch {
        /* In-memory state remains usable. */
      }
      return { favorites };
    }),
}));
export function openWorkspacePanel(panel: WorkspacePanel) {
  useWorkspace.setState((state) => ({ panel: state.panel === panel ? null : panel }));
}
