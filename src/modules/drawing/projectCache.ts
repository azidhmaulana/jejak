import { useAuth } from '../../features/auth/authStore';

// Private drawing data must not survive logout in browser storage.
const values = new Map<string, string>();
export const projectCache = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
  removeItem: (key: string) => {
    values.delete(key);
  },
  clear: () => values.clear(),
};
useAuth.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || !state.user?.permissions.includes('objects.write'))
    values.clear();
  if (state.ready) {
    try {
      for (const key of [
        'project-v2',
        'shared-base-v1',
        'pending-write-v1',
        'conflict-backup-v1',
        'drawings-v1',
      ])
        localStorage.removeItem('osint-map-' + key);
    } catch {
      // Blocked browser storage must not interrupt login/logout state updates.
    }
  }
});
