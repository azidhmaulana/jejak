import { useRegion } from '../regions/regionStore';
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { Flame, X, Search, Play, Pause, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useWorkspace } from '../osint/workspaceStore';
import {
  cancelHotspots,
  loadHotspotProviders,
  searchHotspots,
  useHotspots,
  visibleHotspots,
  type HotspotSource,
} from './hotspotStore';
import './Hotspots.css';

export const sourceStatus = (status: string, en: boolean) =>
  ({
    ok: en ? 'Connected' : 'Terhubung',
    disabled: en ? 'Disabled' : 'Nonaktif',
    'needs-key': en ? 'Set MAP_KEY in CMS' : 'Isi MAP_KEY di CMS',
    unavailable: en ? 'Source unavailable' : 'Sumber tidak tersedia',
    stale: en ? 'Showing cached data' : 'Menampilkan data cache',
    'partial-coverage': en
      ? 'Some satellites have no coverage for these dates'
      : 'Sebagian satelit belum memiliki arsip tanggal ini',
  })[status] || status;
export default function HotspotPanel() {
  const region = useRegion();
  const state = useHotspots(),
    en = useLanguage() === 'en',
    tx = (id: string, eng: string) => (en ? eng : id);
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(state.start || today),
    [end, setEnd] = useState(state.end || today);
  const [position, setPosition] = useState<CSSProperties>({}),
    [imageError, setImageError] = useState(false);
  const items = visibleHotspots(state, region);
  useEffect(() => {
    void loadHotspotProviders().catch(() => useHotspots.setState({ error: true }));
  }, []);
  useLayoutEffect(() => {
    const button = document.querySelector('[data-hotspot-trigger]');
    if (!button) return;
    const align = () => {
      if (window.innerWidth <= 700 || (window.innerWidth <= 1200 && window.innerHeight <= 540)) { setPosition({}); return; }
      const rect = button.getBoundingClientRect();
      setPosition({
        position: 'fixed',
        top: rect.top,
        left: rect.right + 8,
        maxWidth: window.innerWidth - rect.right - 16,
        maxHeight: Math.min(window.innerHeight * 0.6, window.innerHeight - rect.top - 65),
      });
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(document.body);
    window.addEventListener('resize', align);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', align);
    };
  }, []);
  useEffect(() => {
    if (!state.playing) return;
    const timer = setInterval(
      () =>
        useHotspots.setState((s) =>
          s.frame >= s.completed - 1 ? { playing: false } : { frame: s.frame + 1, selected: null },
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [state.playing]);
  useEffect(
    () => () => {
      useHotspots.setState({ playing: false });
    },
    [],
  );
  const switchMode = (mode: 'recent' | 'history') => {
    cancelHotspots();
    useHotspots.setState({
      mode,
      items: [],
      selected: null,
      days: [],
      completed: 0,
      total: 0,
      loaded: false,
      error: false,
      cancelled: false,
    });
    if (mode === 'recent') void searchHotspots();
  };
  return (
    <aside
      className="public-analytics hotspot-panel"
      style={position}
      aria-label={tx('Titik panas', 'Hotspots')}
      translate="no"
    >
      <header className="public-analytics-heading">
        <Flame size={16} />
        <h2>{tx('Titik panas', 'Hotspots')}</h2>
        <button
          className="analytics-close"
          aria-label={tx('Tutup titik panas', 'Close hotspots')}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={12} />
        </button>
      </header>
      <div className="public-analytics-body">
        <label className="hotspot-toggle">
          {tx('Marker titik panas', 'Hotspot markers')}
          <input
            role="switch"
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => useHotspots.setState({ enabled: e.target.checked, selected: null })}
          />
          <b>{items.length}</b>
        </label>
        <div className="hotspot-tabs">
          {(['recent', 'history'] as const).map((mode) => (
            <button key={mode} aria-pressed={state.mode === mode} onClick={() => switchMode(mode)}>
              {mode === 'recent' ? tx('Terbaru', 'Recent') : tx('Riwayat', 'History')}
            </button>
          ))}
        </div>
        <form
          className="hotspot-form"
          onSubmit={(e) => {
            e.preventDefault();
            void searchHotspots(
              state.mode === 'history' ? start : undefined,
              state.mode === 'history' ? end : undefined,
            );
          }}
        >
          <label>
            {tx('Sumber marker', 'Marker source')}
            <select
              value={state.source}
              disabled={state.loading}
              onChange={(e) => {
                useHotspots.setState({
                  source: e.target.value as 'all' | HotspotSource,
                  selected: null,
                });
              }}
            >
              <option value="all">{tx('Semua', 'All')}</option>
              {state.providers
                .filter((p) => p.kind === 'points')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? tx(' (nonaktif)', ' (disabled)') : ''}
                  </option>
                ))}
            </select>
          </label>
          {state.mode === 'recent' ? (
            <label>
              {tx('Periode', 'Period')}
              <select
                value={state.hours}
                disabled={state.loading}
                onChange={(e) => useHotspots.setState({ hours: Number(e.target.value) })}
              >
                {[24, 48, 168].map((n) => (
                  <option key={n} value={n}>
                    {n === 168 ? tx('7 hari', '7 days') : `${n} ${tx('jam', 'hours')}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                {tx('Dari (UTC)', 'From (UTC)')}
                <input
                  type="date"
                  value={start}
                  min="2000-01-01"
                  max={end}
                  required
                  disabled={state.loading}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                {tx('Sampai (UTC)', 'To (UTC)')}
                <input
                  type="date"
                  value={end}
                  min={start}
                  max={today}
                  required
                  disabled={state.loading}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </>
          )}
          <button className="hotspot-show" type="submit" disabled={state.loading}>
            <Search size={12} />
            {tx('Tampilkan', 'Show')}
          </button>
        </form>
        {state.total > 0 && (
          <div className="hotspot-progress" role="status">
            <progress max={state.total} value={state.completed} />
            <div>
              <span>
                {state.completed}/{state.total} {tx('hari', 'days')} ·{' '}
                {Math.round((state.completed / state.total) * 100)}%
              </span>
              {state.loading && (
                <button onClick={cancelHotspots}>
                  <X size={12} />
                  {tx('Batal', 'Cancel')}
                </button>
              )}
            </div>
          </div>
        )}
        {(state.error || state.cancelled) && (
          <p className="hotspot-warning" role="alert">
            {state.error
              ? tx(
                  'Data belum lengkap atau tanggal tidak valid. Maksimal 31 hari; coba tampilkan ulang.',
                  'Incomplete data or invalid dates. Maximum 31 days; please retry.',
                )
              : tx(
                  'Dibatalkan. Hanya hari yang selesai dimuat tersedia.',
                  'Cancelled. Only completed days are available.',
                )}
          </p>
        )}
        {state.mode === 'history' && state.completed > 0 && (
          <div className="hotspot-timeline">
            <div>
              <button
                disabled={state.loading || state.completed < 2}
                aria-label={
                  state.playing ? tx('Jeda', 'Pause') : tx('Putar riwayat', 'Play history')
                }
                onClick={() =>
                  useHotspots.setState({
                    playing: !state.playing,
                    frame: state.frame >= state.completed - 1 ? 0 : state.frame,
                    selected: null,
                  })
                }
              >
                {state.playing ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <time>{state.days[state.frame]} UTC</time>
              <b>{items.length}</b>
            </div>
            <input
              type="range"
              aria-label={tx('Tanggal riwayat hotspot', 'Hotspot history date')}
              min={0}
              max={Math.max(0, state.completed - 1)}
              value={state.frame}
              onChange={(e) =>
                useHotspots.setState({
                  frame: Number(e.target.value),
                  playing: false,
                  selected: null,
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={state.cumulative}
                onChange={(e) =>
                  useHotspots.setState({ cumulative: e.target.checked, selected: null })
                }
              />
              {tx('Akumulasi hingga tanggal ini', 'Accumulate through this date')}
            </label>
          </div>
        )}
        <div className="hotspot-form">
          <label>
            {tx('Kepercayaan', 'Confidence')}
            <select
              value={state.confidence}
              onChange={(e) => useHotspots.setState({ confidence: e.target.value, selected: null })}
            >
              {['all', 'high', 'medium', 'low', 'unknown'].map((c, i) => (
                <option key={c} value={c}>
                  {en
                    ? ['All', 'High', 'Medium', 'Low', 'Unknown'][i]
                    : ['Semua', 'Tinggi', 'Sedang', 'Rendah', 'Tidak diketahui'][i]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx('Satelit', 'Satellite')}
            <select
              value={state.satellite}
              onChange={(e) => useHotspots.setState({ satellite: e.target.value, selected: null })}
            >
              <option value="all">{tx('Semua', 'All')}</option>
              {['Terra', 'Aqua', 'Terra/Aqua', 'Suomi NPP', 'NOAA-20', 'NOAA-21'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="hotspot-source-status">
          {state.providers
            .filter((p) => p.kind === 'points')
            .map((p) => (
              <div key={p.id}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.name}
                </a>
                <span>
                  {sourceStatus(
                    !p.active
                      ? 'disabled'
                      : !p.configured
                        ? 'needs-key'
                        : state.statuses[p.id]?.status || (en ? 'Ready' : 'Siap'),
                    en,
                  )}
                </span>
              </div>
            ))}
        </div>
        <div className="hotspot-results">
          {items.slice(0, 30).map((item) => (
            <button key={item.id} onClick={() => useHotspots.setState({ selected: item })}>
              <i data-confidence={item.confidence} />
              <span>
                {item.place || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`}
                <small>
                  {item.satellite} · {new Date(item.time).toLocaleString(en ? 'en-GB' : 'id-ID')}
                </small>
              </span>
            </button>
          ))}
        </div>
        {!items.length && state.loaded && (
          <p>
            {tx(
              'Tidak ada deteksi dari data yang berhasil dimuat dengan filter ini.',
              'No detections in successfully loaded data for these filters.',
            )}
          </p>
        )}
        {items.length > 30 && (
          <small>
            {tx(
              '30 pertama di daftar; semua hasil ditampilkan di peta.',
              'First 30 listed; all results shown on the map.',
            )}
          </small>
        )}
        {state.providers.some((p) => p.id === 'bmkg' && p.active) && (
          <details className="hotspot-bmkg">
            <summary>{tx('Citra hotspot BMKG — terbaru', 'BMKG hotspot image — latest')}</summary>
            <p>
              {tx(
                'Citra terbaru, tidak mengikuti slider history. Waktu pengamatan tercantum di gambar.',
                'Latest image; does not follow the history slider. Observation time is printed in the image.',
              )}
            </p>
            {imageError ? (
              <p role="status">
                {tx('Citra BMKG sedang tidak tersedia.', 'BMKG image is currently unavailable.')}
              </p>
            ) : (
              <img
                src="/api/hotspots/image/bmkg"
                alt={tx('Citra sebaran titik panas BMKG Indonesia', 'BMKG Indonesia hotspot image')}
                loading="lazy"
                onError={() => setImageError(true)}
              />
            )}
            <a
              href="https://www.bmkg.go.id/cuaca/satelit/polar-hotspot"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={12} /> BMKG
            </a>
          </details>
        )}
        <p className="hotspot-note">
          {tx(
            'Indonesia. Deteksi panas bukan konfirmasi kebakaran. Deteksi identik digabung; lintasan satelit berbeda tetap dihitung terpisah. Arsip maksimal 31 hari per pencarian, sesuai ketersediaan sumber.',
            'Indonesia. Heat detections are not confirmed fires. Identical detections are merged; separate satellite passes remain distinct. History: up to 31 days per search, subject to source availability.',
          )}
        </p>
      </div>
    </aside>
  );
}
