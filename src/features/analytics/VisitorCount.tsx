import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../auth/authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
export default function VisitorCount() {
  const en = useLanguage() === 'en';
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (document.hidden) return;
      void api<{ active: number }>('/analytics/presence')
        .then((v) => {
          if (live) setCount(v.active);
        })
        .catch(() => {
          if (live) setCount(null);
        });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return (
    <span
      className="visitor-count"
      title={
        en
          ? 'Unique browsers active in the last 5 minutes, including guests. Tracking opt-outs are excluded.'
          : 'Browser unik aktif dalam 5 menit terakhir, termasuk tamu. Pengunjung yang menolak pelacakan tidak dihitung.'
      }
    >
      <Users size={12} /> {en ? 'ACTIVE' : 'AKTIF'}{' '}
      <b>{count === null ? '-' : count.toLocaleString(en ? 'en-US' : 'id-ID')}</b>
    </span>
  );
}
