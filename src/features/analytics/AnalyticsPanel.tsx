import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { api, useAuth } from '../auth/authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './AnalyticsPanel.css';

type Report = {
  cameras: { id: string; name: string; city: string; views: number; viewers?: number }[];
  regions: { name: string; views: number }[];
  trend: { day: string; views: number }[];
  summary?: Record<string, number>;
  active?: number;
  registrations?: number;
  visitorsTrend?: { day: string; views: number }[];
  hours?: { name: string; total: number }[];
  devices?: { name: string; total: number }[];
  referrals?: { name: string; total: number }[];
};
export default function AnalyticsPanel({ admin = false }: { admin?: boolean }) {
  const en = useLanguage() === 'en';
  const user = useAuth((s) => s.user);
  const allowed =
    !admin ||
    Boolean(
      user &&
      ['admin', 'superadmin'].includes(user.role) &&
      user.permissions.includes('analytics.view'),
    );
  const [days, setDays] = useState(7),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<Report | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    if (allowed)
      void api<Report>(`/analytics/${admin ? 'admin' : 'public'}?days=${days}`)
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active)
            setError(
              en
                ? 'Unable to load analytics. Please retry.'
                : 'Statistik gagal dimuat. Silakan coba lagi.',
            );
        });
    return () => {
      active = false;
    };
  }, [days, revision, admin, allowed, user?.id, en]);
  if (!allowed) return null;
  const tx = (id: string, english: string) => (en ? english : id);
  return (
    <section
      className="jejak-analytics"
      translate="no"
      aria-label={admin ? 'Admin analytics' : 'Public analytics'}
    >
      <header>
        <BarChart3 size={18} />
        <strong>
          {tx(
            admin ? 'Analitik pengunjung' : 'Popularitas CCTV',
            admin ? 'Visitor analytics' : 'CCTV popularity',
          )}
        </strong>
        <select
          aria-label={tx('Periode statistik', 'Analytics period')}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[1, 7, 30, 90].map((n) => (
            <option key={n} value={n}>
              {n} {tx('hari', 'days')}
            </option>
          ))}
        </select>
        <button
          aria-label={tx('Muat ulang statistik', 'Refresh analytics')}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={14} />
        </button>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">{tx('Memuat statistik...', 'Loading analytics...')}</p>
      ) : (
        <>
          {admin && data.summary && (
            <div className="analytics-metrics">
              {[
                [tx('Pengunjung unik', 'Unique visitors'), data.summary.visitors],
                [tx('Sesi', 'Sessions'), data.summary.sessions],
                [tx('Tampilan halaman', 'Page views'), data.summary.pageviews],
                [tx('Aktif · 5 menit', 'Active · 5 minutes'), data.active],
                [tx('Monitor dibuka', 'Monitor opens'), data.summary.opens],
                [tx('Pemutaran berhasil', 'Playback starts'), data.summary.plays],
                [tx('Kegagalan stream', 'Stream errors'), data.summary.errors],
                [
                  tx('Menit ditonton', 'Minutes watched'),
                  Math.floor((data.summary.watchSeconds || 0) / 60),
                ],
                [tx('Rute ditemukan', 'Routes found'), data.summary.routes],
                [tx('Pendaftaran', 'Registrations'), data.registrations],
              ].map(([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{Number(value || 0).toLocaleString(en ? 'en-US' : 'id-ID')}</strong>
                </div>
              ))}
            </div>
          )}
          <h3>{tx('Kamera paling sering dibuka', 'Most opened cameras')}</h3>
          {!data.cameras.length ? (
            <p className="analytics-empty">
              {tx(
                'Belum ada aktivitas kamera pada periode ini.',
                'No camera activity in this period yet.',
              )}
            </p>
          ) : (
            <ol className="analytics-ranking">
              {data.cameras.map((c) => (
                <li key={c.id}>
                  <span title={c.name}>
                    {c.name}
                    <small>{c.city}</small>
                  </span>
                  <b>{c.views}</b>
                  {admin && (
                    <small>
                      {c.viewers} {tx('unik', 'unique')}
                    </small>
                  )}
                </li>
              ))}
            </ol>
          )}
          <h3>{tx('Tren pembukaan kamera · WIB', 'Camera opening trend · UTC+7')}</h3>
          <div className="analytics-trend">
            {data.trend.map((row) => (
              <div key={row.day}>
                <time>{row.day}</time>
                <progress max={Math.max(1, ...data.trend.map((r) => r.views))} value={row.views} />
                <b>{row.views}</b>
              </div>
            ))}
          </div>
          {admin && (
            <>
              <h3>{tx('Tren pengunjung unik · WIB', 'Unique visitor trend · UTC+7')}</h3>
              <div className="analytics-trend">
                {data.visitorsTrend?.map((r) => (
                  <div key={r.day}>
                    <time>{r.day}</time>
                    <progress
                      value={r.views}
                      max={Math.max(1, ...(data.visitorsTrend || []).map((v) => v.views))}
                    />
                    <b>{r.views}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          <h3>{tx('Wilayah populer', 'Popular regions')}</h3>
          {data.regions.length ? (
            data.regions.map((r) => (
              <div className="analytics-row" key={r.name}>
                <span>{r.name}</span>
                <b>{r.views}</b>
              </div>
            ))
          ) : (
            <p>{tx('Belum ada data wilayah.', 'No region data yet.')}</p>
          )}
          {admin && (
            <div className="analytics-breakdowns">
              {[
                [tx('Perangkat', 'Devices'), data.devices],
                [tx('Asal kunjungan', 'Referrals'), data.referrals],
                [tx('Jam pembukaan kamera · WIB', 'Camera opens by hour · UTC+7'), data.hours],
              ].map(([title, rows]) => (
                <section key={title as string}>
                  <h3>{title as string}</h3>
                  {((rows as { name: string; total: number }[]) || []).map((r) => (
                    <div className="analytics-row" key={r.name}>
                      <span>{r.name}</span>
                      <b>{r.total}</b>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <p className="analytics-note">
        {tx(
          'Statistik sejak fitur diaktifkan. Pengunjung unik dihitung per browser; preview otomatis tidak dihitung. Retensi 90 hari.',
          'Statistics since tracking was enabled. Unique visitors are counted per browser; automatic previews are excluded. 90-day retention.',
        )}
      </p>
    </section>
  );
}
