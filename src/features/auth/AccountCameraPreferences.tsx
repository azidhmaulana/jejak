import { useEffect } from 'react';
import { api, useAuth } from './authStore';
import { useWorkspace } from '../osint/workspaceStore';

// Guest history stays local; account history is restored from the server on sign-in.
export default function AccountCameraPreferences() {
  const id = useAuth((state) => state.user?.id);
  useEffect(() => {
    if (!id) return;
    let stopped = false,
      unsubscribe: (() => void) | undefined;
    let saving = Promise.resolve();
    const { favorites, recent } = useWorkspace.getState();
    useWorkspace.setState({ favorites: [], recent: [] });
    void api<{ favorites: string[]; recent: string[] }>('/auth/preferences')
      .then((data) => {
        if (stopped) return;
        useWorkspace.setState(data);
        unsubscribe = useWorkspace.subscribe((state, previous) => {
          if (state.favorites === previous.favorites && state.recent === previous.recent) return;
          const snapshot = { favorites: state.favorites, recent: state.recent };
          saving = saving
            .then(async () => {
              if (useAuth.getState().user?.id !== id) return;
              await api('/auth/preferences', 'PUT', snapshot);
            })
            .catch(() =>
              useAuth.setState({ error: 'Unable to save camera preferences. Please try again.' }),
            );
        });
      })
      .catch(() => {
        if (!stopped)
          useAuth.setState({ error: 'Unable to load camera preferences. Please try again.' });
      });
    return () => {
      stopped = true;
      unsubscribe?.();
      useWorkspace.setState({ favorites, recent });
    };
  }, [id]);
  return null;
}
