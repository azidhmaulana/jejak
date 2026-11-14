import HotspotAnalytics from './HotspotAnalytics';
import EarthquakeAnalytics from './EarthquakeAnalytics';
import CameraOpeningChart from './CameraOpeningChart';
import { useEffect, useState } from 'react';
import { Camera, Layers, RefreshCw, Signal, WifiOff, X, Maximize2, Minimize2 } from 'lucide-react';
import { api } from '../auth/authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useWorkspace } from '../osint/workspaceStore';
import { useCameraCatalog } from '../osint/hooks/useCameraCatalog';
import { cameraAvailability, useSurveillance } from '../surveillance/osintSurveillanceStore';
type Report = {
  cameras: { id: string; name: string; views: number }[];
  trend: { day: string; views: number }[];
  regions: { name: string; views: number }[];
};
export default function PublicAnalyticsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'cctv' | 'earthquakes' | 'hotspots'>('cctv');
  const en = useLanguage() === 'en';
  const tx = (id: string, english: string) => (en ? english : id);
  const cameras = useCameraCatalog();
  useSurveillance();
  const [, refreshHealth] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refreshHealth((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const [days, setDays] = useState(7),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    setData(null);
    void api<Report>(`/analytics/public?days=${days}`)
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [days, revision]);
  const online = cameras.filter((c) => cameraAvailability(c).status === 'online').length;
  const offline = cameras.filter((c) => cameraAvailability(c).status === 'offline').length;
  return (
    <aside
      className={`public-analytics analytics-resizable${expanded ? ' analytics-expanded' : ''}`}
      aria-label={tx('Analitik', 'Analytics')}
      translate="no"
    >
      <header className="public-analytics-heading">
        <Layers size={22} />
        <h2>{tx('Analitik', 'Analytics')}</h2>
        <button
          className="analytics-expand"
          aria-label={
            expanded
              ? tx('Kecilkan analitik', 'Collapse analytics')
              : tx('Perbesar analitik', 'Expand analytics')
          }
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button
          className="analytics-close"
          aria-label={tx('Tutup analitik', 'Close analytics')}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={19} />
        </button>
      </header>
      <div
        className="analytics-tabs"
        role="tablist"
        aria-label={tx('Jenis analitik', 'Analytics type')}
      >
        <button role="tab" aria-selected={tab === 'cctv'} onClick={() => setTab('cctv')}>
          CCTV
        </button>
        <button
          role="tab"
          aria-selected={tab === 'earthquakes'}
          onClick={() => setTab('earthquakes')}
        >
          {tx('Gempa', 'Earthquakes')}
        </button>
        <button role="tab" aria-selected={tab === 'hotspots'} onClick={() => setTab('hotspots')}>
          {tx('Titik Api', 'Hotspots')}
        </button>
      </div>
      <div className="public-analytics-body">
        {tab === 'hotspots' ? (
          <HotspotAnalytics />
        ) : tab === 'earthquakes' ? (
          <EarthquakeAnalytics />
        ) : (
          <>
            <div className="public-analytics-controls">
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
                disabled={loading}
                aria-label={tx('Muat ulang statistik', 'Refresh analytics')}
                onClick={() => setRevision((v) => v + 1)}
              >
                <RefreshCw size={18} className={loading ? 'is-loading' : ''} />
              </button>
            </div>
            <div className="public-analytics-metrics">
              {[
                [Camera, cameras.length, tx('Kamera', 'Cameras'), ''],
                [Signal, online, 'Online', 'online'],
                [WifiOff, offline, 'Offline', 'offline'],
              ].map(([Icon, count, label, state]) => {
                const Glyph = Icon as typeof Camera;
                return (
                  <div key={String(label)} className={String(state)}>
                    <Glyph size={25} />
                    <span>
                      <b>{Number(count).toLocaleString(en ? 'en-US' : 'id-ID')}</b>
                      <small>{String(label)}</small>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="analytics-availability-note">
              {tx('Belum terverifikasi', 'Unverified')}: {cameras.length - online - offline}
            </p>
            {loading ? (
              <p role="status">{tx('Memuat statistik...', 'Loading analytics...')}</p>
            ) : error ? (
              <p role="alert">
                {tx(
                  'Statistik gagal dimuat. Coba muat ulang.',
                  'Unable to load analytics. Please refresh.',
                )}
              </p>
            ) : (
              data && (
                <>
                  <div className="public-analytics-columns">
                    <section>
                      <h3>{tx('Kamera paling sering dibuka', 'Most opened cameras')}</h3>
                      <div className="analytics-section-content">
                        <table>
                          <thead>
                            <tr>
                              <th>{tx('Kamera', 'Camera')}</th>
                              <th>{tx('Dibuka', 'Views')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.cameras.slice(0, 5).map((c) => (
                              <tr key={c.id}>
                                <td title={c.name}>{c.name}</td>
                                <td>{c.views}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!data.cameras.length && (
                          <p>{tx('Belum ada aktivitas kamera.', 'No camera activity yet.')}</p>
                        )}
                      </div>
                    </section>
                    <section>
                      <h3>{tx('Tren pembukaan kamera (3 jam)', 'Camera opening trend (3h)')}</h3>
                      <div className="analytics-section-content">
                        <CameraOpeningChart
                          rows={data.trend}
                          label={tx(
                            'Pembukaan kamera per 3 jam WIB',
                            'Camera opens every 3 hours, UTC+7',
                          )}
                        />
                        {!data.trend.length && (
                          <p>{tx('Belum ada data tren.', 'No trend data yet.')}</p>
                        )}
                      </div>
                    </section>
                  </div>
                  <section className="public-analytics-regions">
                    <h3>{tx('Wilayah populer', 'Popular regions')}</h3>
                    <div className="analytics-section-content">
                      {data.regions.slice(0, 5).map((r) => (
                        <div key={r.name}>
                          <span title={r.name}>{r.name}</span>
                          <progress
                            value={r.views}
                            max={Math.max(1, ...data.regions.map((v) => v.views))}
                          />
                          <b>{r.views}</b>
                        </div>
                      ))}
                      {!data.regions.length && (
                        <p>{tx('Belum ada data wilayah.', 'No region data yet.')}</p>
                      )}
                    </div>
                  </section>
                </>
              )
            )}
            <p className="analytics-availability-note">
              {tx(
                'Status kamera berdasarkan pemeriksaan terakhir. Preview otomatis tidak dihitung.',
                'Camera status reflects the latest check. Automatic previews are excluded.',
              )}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
