import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { LockKeyhole, LogIn, X } from 'lucide-react';
import { useAuth } from './authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './LoginRequiredPopover.css';

const usePrompt = create<{ anchor: HTMLElement | null }>(() => ({ anchor: null }));
export function requireFeatureLogin(event: MouseEvent<HTMLElement>, action: () => void) {
  if (useAuth.getState().user) {
    usePrompt.setState({ anchor: null });
    action();
  } else {
    usePrompt.setState({ anchor: event.currentTarget });
  }
}

export default function LoginRequiredPopover() {
  const anchor = usePrompt((s) => s.anchor);
  const user = useAuth((s) => s.user);
  const en = useLanguage() === 'en';
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 50 });
  const close = () => usePrompt.setState({ anchor: null });
  useEffect(() => { if (user) close(); }, [user]);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 16);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 7 + (ref.current?.offsetHeight || 180) > window.innerHeight - 8 ? Math.max(8, rect.top - (ref.current?.offsetHeight || 180) - 7) : rect.bottom + 7 });
    };
    place();
    ref.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); anchor.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);
  if (!anchor || user) return null;
  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={en ? 'Login required' : 'Login diperlukan'} className="login-required-popover" style={position}>
      <header className="login-required-heading">
        <LockKeyhole size={20} aria-hidden="true" />
        <h2>{en ? 'Sign in to continue' : 'Masuk untuk melanjutkan'}</h2>
        <button className="login-required-close" aria-label={en ? 'Close' : 'Tutup'} onClick={() => { close(); anchor.focus(); }}><X size={12} /></button>
      </header>
      <p>{en ? 'Please sign in to access this feature.' : 'Silakan masuk untuk menggunakan fitur ini.'}</p>
      <footer className="login-required-footer">
        <button className="login-required-action" onClick={() => { close(); useAuth.setState({ open: true, cmsOpen: false }); }}><LogIn size={16} />{en ? 'Sign in' : 'Masuk'}</button>
      </footer>
    </div>, document.body,
  );
}
