import { useEffect } from 'react';
import { create } from 'zustand';
import { api, useAuth } from './authStore';
import { toast } from '../../shared/components/Toast';
import { getLanguage } from '../../shared/i18n/runtime.js';

export type CameraCheckJob = {
  id: string;
  status: 'running' | 'completed' | 'interrupted';
  provider: string | null;
  total: number;
  done: number;
  online: number;
  updated: number;
  failed: number;
  skipped: number;
  logs: { at: number; name: string; status: 'online' | 'updated' | 'failed' | 'skipped'; reason?: string }[];
};
export const useCameraCheck = create<{ job: CameraCheckJob | null; error: string }>(() => ({
  job: null,
  error: '',
}));

// Mounted with the workspace, not the CMS: completion notices survive closing the modal.
export function useCameraCheckNotifications() {
  const user = useAuth((s) => s.user);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    useCameraCheck.setState({ job: null, error: '' });
    if (user?.role !== 'superadmin') return;
    const poll = async () => {
      try {
        const before = useCameraCheck.getState().job;
        const { job } = await api<{ job: CameraCheckJob | null }>('/cctv-sources/check');
        if (stopped) return;
        const previous = useCameraCheck.getState().job;
        if (previous?.id !== before?.id) return;
        useCameraCheck.setState({ job, error: '' });
        if (
          job &&
          previous?.id === job.id &&
          previous.status === 'running' &&
          job.status !== 'running'
        ) {
          const en = getLanguage() === 'en';
          toast(
            job.status === 'completed'
              ? en
                ? `Stream check finished: ${job.online} available, ${job.updated} updated, ${job.failed} failed, ${job.skipped} skipped.`
                : `Pengecekan selesai: ${job.online} tersedia, ${job.updated} diperbarui, ${job.failed} gagal, ${job.skipped} dilewati.`
              : en
                ? 'Stream check interrupted. You can start a new check.'
                : 'Pengecekan terhenti. Anda dapat memulai ulang.',
            job.status === 'interrupted' ? 'error' : 'success',
          );
        }
      } catch (e) {
        if (!stopped) useCameraCheck.setState({ error: (e as Error).message });
      } finally {
        if (!stopped) timer = setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [user?.id, user?.role]);
}
