import { useEffect, useMemo, useState } from 'react';
import { Camera, MapPinned, Signal, WifiOff, X } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useCameraCatalog } from '../osint/hooks/useCameraCatalog';
import { useWorkspace } from '../osint/workspaceStore';
import { useRoute } from '../routes/routeStore';
import { cameraAvailability, useSurveillance } from '../surveillance/osintSurveillanceStore';
import { cameraProvince, loadProvinces, useRegion } from './regionStore';
import './ProvincePanel.css';
export default function ProvincePanel() {
  const en = useLanguage() === 'en',
    tx = (id: string, english: string) => (en ? english : id);
  const { provinces, selected, showBoundary, loading, error } = useRegion();
  const cameras = useCameraCatalog(true);
  useSurveillance();
  const [, refreshHealth] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refreshHealth((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    void loadProvinces();
  }, []);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const c of cameras) {
      const name = cameraProvince(c, provinces);
      result.set(name, (result.get(name) || 0) + 1);
    }
    return result;
  }, [cameras, provinces]);
  const scoped = useMemo(
    () => cameras.filter((c) => !selected || cameraProvince(c, provinces) === selected),
    [cameras, selected, provinces],
  );
  const online = scoped.filter((c) => cameraAvailability(c).status === 'online').length;
  const offline = scoped.filter((c) => cameraAvailability(c).status === 'offline').length;
  const choose = (value: string) => {
    useRegion.setState({ selected: value });
    useWorkspace.setState({ selectedId: null, query: '', cameraTab: 'all' });
    useRoute.setState({ filter: false });
  };
  return (
    <aside
      className="public-analytics province-panel"
      aria-label={tx('Wilayah', 'Regions')}
      translate="no"
    >
      <header className="public-analytics-heading">
        <MapPinned size={19} />
        <h2>{tx('Wilayah', 'Regions')}</h2>
        <button
          className="analytics-close"
          aria-label={tx('Tutup wilayah', 'Close regions')}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={12} />
        </button>
      </header>
      <div className="public-analytics-body">
        <label className="province-picker">
          {tx('Provinsi', 'Province')}
          <select
            disabled={loading || error}
            aria-label={tx('Provinsi', 'Province')}
            value={selected}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">
              {tx('Semua provinsi', 'All provinces')} ({cameras.length})
            </option>
            {provinces.map((p) => (
              <option key={p.properties.PROVINSI} value={p.properties.PROVINSI}>
                {p.properties.PROVINSI} ({counts.get(p.properties.PROVINSI) || 0})
              </option>
            ))}
          </select>
        </label>
        {loading && (
          <p role="status">{tx('Memuat batas provinsi...', 'Loading province boundaries...')}</p>
        )}
        {error && (
          <p role="alert">
            {tx('Batas provinsi gagal dimuat.', 'Unable to load boundaries.')}{' '}
            <button className="province-action" onClick={() => void loadProvinces()}>
              {tx('Coba lagi', 'Retry')}
            </button>
          </p>
        )}
        <div className="public-analytics-metrics">
          {[
            [Camera, scoped.length, tx('Kamera', 'Cameras'), ''],
            [Signal, online, 'Online', 'online'],
            [WifiOff, offline, 'Offline', 'offline'],
          ].map(([Icon, count, label, state]) => {
            const Glyph = Icon as typeof Camera;
            return (
              <div key={String(label)} className={String(state)}>
                <Glyph size={16} />
                <span>
                  <b>{Number(count).toLocaleString(en ? 'en-US' : 'id-ID')}</b>
                  <small>{String(label)}</small>
                </span>
              </div>
            );
          })}
        </div>
        <p className="analytics-availability-note">
          {tx('Belum terverifikasi', 'Unverified')}: {scoped.length - online - offline}
        </p>
        <label className="province-boundary">
          <input
            type="checkbox"
            checked={showBoundary}
            onChange={(e) => useRegion.setState({ showBoundary: e.target.checked })}
          />
          {selected
            ? tx('Tampilkan batas provinsi', 'Show province boundary')
            : tx('Tampilkan batas Indonesia', 'Show Indonesia boundary')}
        </label>
        {!scoped.length && selected && (
          <p>{tx('Belum ada kamera pada provinsi ini.', 'No cameras in this province yet.')}</p>
        )}
        <div className="province-actions">
          <button
            className="province-action"
            onClick={() =>
              useWorkspace.setState({ camerasOpen: true, cameraTab: 'all', query: '' })
            }
          >
            {tx('Lihat kamera', 'View cameras')}
          </button>
          <button className="province-action" disabled={!selected} onClick={() => choose('')}>
            {tx('Hapus filter', 'Clear filter')}
          </button>
        </div>
        <p className="analytics-availability-note">
          {tx(
            'Filter tetap aktif saat panel ditutup. Lokasi kamera perkiraan dapat memengaruhi penentuan provinsi.',
            'The filter stays active when closed. Approximate camera positions can affect province assignment.',
          )}
        </p>
        {!selected && !loading && (
          <p className="analytics-availability-note">
            {tx('Provinsi belum diketahui', 'Province unknown')}: {counts.get('') || 0}
          </p>
        )}

        <p className="analytics-availability-note">
          {tx('Referensi batas', 'Boundary reference')}:{' '}
          <a
            href="https://github.com/mashadinoor/Indonesia-Geojson-2026"
            target="_blank"
            rel="noreferrer"
          >
            Indonesia GeoJSON
          </a>{' '}
          /{' '}
          <a href="/data/indonesia-provinces-LICENSE.txt" target="_blank" rel="noreferrer">
            MIT
          </a>
          . {tx('Bukan acuan batas hukum.', 'Not a legal boundary reference.')}
        </p>
      </div>
    </aside>
  );
}
