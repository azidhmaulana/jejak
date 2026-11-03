import ProfileForm from './ProfileForm';
import { toast } from '../../shared/components/Toast';
import JejakLogo from '../../shared/components/JejakLogo';
import AuthForm from './AuthForm';
import { useEffect, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { api, useAuth } from './authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './AccountPanel.css';

export default function AccountPanel() {
  const { user, open, setupRequired, refresh, error: sessionError } = useAuth();
  const en = useLanguage() === 'en';
  const tx = (id: string, english: string) => (en ? english : id);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!open) {
      setError('');
      setRegister(false);
    }
  }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAuth.setState({ open: false });
    };
    if (open) window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  if (!open) return null;
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={`account-backdrop ${!user ? 'auth-backdrop' : ''}`}
      onClick={() => useAuth.setState({ open: false })}
    >
      <section
        className={`account-panel ${!user ? 'auth-panel' : 'profile-panel'}`}
        role="dialog"
        aria-modal="true"
        aria-label={user ? tx('Profil', 'Profile') : tx('Akun JEJAK', 'JEJAK account')}
        translate="no"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          {user ? (
            <div className="profile-title">
              <UserRound />
              <div>
                <strong>{tx('Profil Akun', 'Account profile')}</strong>
                <p>
                  {tx(
                    'Kelola informasi akun dan ubah kata sandi.',
                    'Manage your account information and password.',
                  )}
                </p>
              </div>
            </div>
          ) : (
            <strong>
              {!user && <JejakLogo />}{' '}
              {user
                ? tx('Profil', 'Profile')
                : register
                  ? tx('Buat akun JEJAK', 'Create JEJAK account')
                  : tx('Akun JEJAK', 'JEJAK account')}
            </strong>
          )}
          <button aria-label="Close account" onClick={() => useAuth.setState({ open: false })}>
            <X size={17} />
          </button>
        </header>
        {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
        <fieldset disabled={busy}>
          {!user ? (
            <AuthForm
              setupRequired={setupRequired}
              register={register}
              setRegister={setRegister}
              busy={busy}
              tx={tx}
              onSubmit={(data) =>
                void run(async () => {
                  if (register && data.password !== data.confirmPassword)
                    throw new Error(
                      tx('Konfirmasi kata sandi tidak cocok.', 'Passwords do not match.'),
                    );
                  await api(
                    setupRequired ? '/auth/setup' : register ? '/auth/register' : '/auth/login',
                    'POST',
                    data,
                  );
                  await refresh();
                  useAuth.setState({ open: false, cmsOpen: false });
                  toast(
                    register || setupRequired
                      ? tx('Akun berhasil dibuat.', 'Account created successfully.')
                      : tx('Berhasil masuk.', 'Signed in successfully.'),
                  );
                })
              }
            />
          ) : (
            <ProfileForm
              user={user}
              tx={tx}
              onCancel={() => useAuth.setState({ open: false })}
              onSubmit={(data, reset) =>
                void run(async () => {
                  await api('/auth/password', 'POST', data);
                  reset();
                  toast(tx('Kata sandi berhasil diubah.', 'Password updated.'));
                })
              }
            />
          )}
        </fieldset>
      </section>
    </div>
  );
}
