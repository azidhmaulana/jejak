import { getLanguage } from '../../shared/i18n/runtime.js';
import { create } from 'zustand';
let sessionRevision = 0;
let refreshSequence = 0;
export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  permissions: string[];
};
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const revision = sessionRevision;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && revision === sessionRevision)
      useAuth.setState({ user: null });
    const translations: Record<string, string> = {
      'Invalid email or password.': 'Email atau kata sandi salah.',
      'Email already exists.': 'Email sudah terdaftar.',
      'Enter a valid name and email.': 'Masukkan nama dan email yang valid.',
      'Password must contain 12–128 characters.': 'Kata sandi harus terdiri dari 12–128 karakter.',
      'Too many attempts. Try again in 15 minutes.':
        'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
      'Current password is incorrect.': 'Kata sandi saat ini salah.',
    };
    throw new Error(
      getLanguage() === 'id'
        ? translations[data.error] || data.error || 'Permintaan gagal.'
        : data.error || 'Request failed.',
    );
  }
  return data;
}
export const useAuth = create<{
  user: User | null;
  ready: boolean;
  setupRequired: boolean;
  open: boolean;
  cmsOpen: boolean;
  error: string;
  refresh: () => Promise<void>;
}>((set) => ({
  user: null,
  ready: false,
  setupRequired: false,
  open: false,
  cmsOpen: false,
  error: '',
  refresh: async () => {
    const sequence = ++refreshSequence;
    const revision = sessionRevision;
    try {
      const data = await api('/auth/session');
      if (sequence !== refreshSequence || revision !== sessionRevision) return;
      set({ ...data, ready: true, error: '' });
    } catch {
      if (sequence !== refreshSequence || revision !== sessionRevision) return;
      set({ user: null, ready: true, error: 'Unable to load account. Please try again.' });
    }
  },
}));
useAuth.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) sessionRevision++;
});
export const can = (permission: string) =>
  useAuth.getState().user?.permissions.includes(permission) || false;

export const hasCmsAccess = (user: User | null) =>
  Boolean(user && ['admin', 'superadmin'].includes(user.role));
