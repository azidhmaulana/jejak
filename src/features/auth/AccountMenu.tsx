import ConfirmDialog from '../../shared/components/ConfirmDialog';
import { toast } from '../../shared/components/Toast';
import { useEffect, useRef, useState } from 'react';
import { UserRound, LayoutDashboard, LogOut } from 'lucide-react';
import { api, hasCmsAccess, useAuth } from './authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './CmsPanel.css';

export default function AccountMenu() {
  const { user } = useAuth();
  const en = useLanguage() === 'en';
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
    setConfirmLogout(false);
    setError('');
  }, [user?.id]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="account-menu-anchor" ref={host} translate="no">
      <button
        className="account-trigger"
        data-signed-in={Boolean(user)}
        title={user?.name}
        ref={trigger}
        aria-label={user ? 'Account' : 'Sign in'}
        aria-expanded={user ? open : undefined}
        aria-controls={user ? 'account-dropdown' : undefined}
        onClick={() => (user ? setOpen(!open) : useAuth.setState({ open: true }))}
      >
        <UserRound />
        {user && <span className="account-trigger-name">{user.name}</span>}
      </button>
      {user && open && (
        <div id="account-dropdown" className="account-dropdown">
          <div className="account-menu-identity">
            <strong>{user.name}</strong>
            {user.role !== 'superadmin' && <small>{user.role}</small>}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              useAuth.setState({ open: true, cmsOpen: false });
            }}
          >
            <UserRound size={15} />
            {en ? 'Profile' : 'Profil'}
          </button>
          {hasCmsAccess(user) && (
            <button
              onClick={() => {
                setOpen(false);
                useAuth.setState({ cmsOpen: true, open: false });
              }}
            >
              <LayoutDashboard size={15} />
              CMS
            </button>
          )}
          <hr />
          <button
            className="account-logout"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setError('');
              setConfirmLogout(true);
            }}
          >
            <LogOut size={15} />
            {busy ? (en ? 'Signing out...' : 'Keluar...') : en ? 'Logout' : 'Keluar'}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {user && confirmLogout && (
        <ConfirmDialog
          returnFocusRef={trigger}
          title={en ? 'Sign out of JEJAK?' : 'Keluar dari JEJAK?'}
          description={
            en
              ? 'You will return to guest access. Your saved routes and account favorites will remain available when you sign in again.'
              : 'Anda akan kembali sebagai tamu. Rute tersimpan dan favorit akun tetap tersedia saat Anda masuk kembali.'
          }
          cancelLabel={en ? 'Cancel' : 'Batal'}
          closeLabel={en ? 'Close confirmation' : 'Tutup konfirmasi'}
          confirmLabel={
            busy ? (en ? 'Signing out...' : 'Keluar...') : en ? 'Yes, sign out' : 'Ya, keluar'
          }
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirmLogout(false);
            trigger.current?.focus();
          }}
          onConfirm={async () => {
            setBusy(true);
            setError('');
            try {
              await api('/auth/logout', 'POST');
              useAuth.setState({ user: null, open: false, cmsOpen: false });
              toast(en ? 'Signed out successfully.' : 'Berhasil keluar.');
              setOpen(false);
            } catch (e) {
              setError((e as Error).message);
              toast((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
