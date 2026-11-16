import Toggle from '../../../shared/components/Toggle';
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { Satellite, X, RefreshCw, Play, Pause, SkipForward, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useWorkspace } from '../../osint/workspaceStore';
import { useOsintWeather, toggleWeather } from '../osintWeatherStore';
import {
  HIMAWARI_HISTORY_ENABLED,
  loadHimawari,
  satelliteFrames,
  useHimawari,
} from '../himawariStore';
import OsintWeatherPanel from './OsintWeatherPanel';
import '../Himawari.css';

export default function WeatherPanel() {
  const en = useLanguage() === 'en';
  const tx = (id: string, english: string) => (en ? english : id);
  const enabled = useOsintWeather((state) => state.clouds);
  const state = useHimawari(),
    frames = satelliteFrames(state);
  const index =
    state.index < 0 ? Math.max(0, frames.length - 1) : Math.min(state.index, frames.length - 1);
  const selected = frames[index];
  const displayed = [...state.frames, ...(state.historyFrame ? [state.historyFrame] : [])].find(
    (frame) => frame.id === state.displayed,
  );
  const today = new Date();
  const earliest = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)).getUTCDate();
  earliest.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  const [date, setDate] = useState(state.historyDate);
  useEffect(() => setDate(state.historyDate), [state.historyDate]);
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const align = () => {
      const button = document.querySelector('[data-weather-trigger]');
      if (
        !button ||
        window.innerWidth <= 700 ||
        (window.innerWidth <= 1200 && window.innerHeight <= 540)
      ) {
        setPosition({});
        return;
      }
      const rect = button.getBoundingClientRect();
      setPosition({
        position: 'fixed',
        top: Math.min(rect.top, window.innerHeight - 380),
        ...(button.closest('.weather-rail') ? { right: 42, left: 'auto' } : { left: rect.right + 8 }),
        maxHeight: Math.min(
          window.innerHeight * 0.6,
          window.innerHeight - Math.min(rect.top, window.innerHeight - 380) - 65,
        ),
      });
    };
    align();
    window.addEventListener('resize', align);
    return () => window.removeEventListener('resize', align);
  }, []);
  const format = (time?: number) =>
    time
      ? new Date(time).toLocaleString(en ? 'en-GB' : 'id-ID', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : '—';
  return (
    <aside
      className="public-analytics himawari-panel"
      aria-label={tx('Cuaca satelit', 'Satellite weather')}
      style={position}
    >
      <header className="public-analytics-heading">
        <Satellite size={17} />
        <h2>Himawari</h2>
        <button
          className="analytics-close"
          aria-label={tx('Tutup cuaca', 'Close weather')}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={13} />
        </button>
      </header>
      <div className="public-analytics-body himawari-body">
        <label className="himawari-toggle">
          <span>{tx('Citra satelit', 'Satellite imagery')}</span>
          <Toggle checked={enabled} onChange={() => toggleWeather('clouds')} />
        </label>
        <label className="himawari-slider">
          {tx('Mode citra', 'Image mode')}
          <select
            aria-label={tx('Mode citra satelit', 'Satellite image mode')}
            value={state.product}
            onChange={(e) =>
              useHimawari.setState({ product: e.target.value as 'auto' | 'visible' | 'ir' })
            }
          >
            <option value="auto">{tx('Otomatis ? Siang / Malam', 'Auto ? Day / Night')}</option>
            <option value="visible">{tx('Visible ? Siang', 'Visible ? Daylight')}</option>
            <option value="ir">{tx('Inframerah ? 24 jam', 'Infrared ? 24 hours')}</option>
          </select>
        </label>
        <p className="himawari-note">
          {state.product === 'auto'
            ? tx(
                'JMA ? Visible B03 saat siang, inframerah B13 saat malam ? interval 10 menit',
                'JMA ? Visible B03 by day, infrared B13 at night ? 10-minute interval',
              )
            : state.product === 'visible'
              ? tx(
                  'JMA ? Band 03 ? membutuhkan sinar matahari; malam terlihat gelap',
                  'JMA ? Band 03 ? requires sunlight; dark at night',
                )
              : tx(
                  'JMA ? Band 13 ? inframerah siang & malam',
                  'JMA ? Band 13 ? infrared day & night',
                )}
        </p>
        {HIMAWARI_HISTORY_ENABLED && (
          <div className="himawari-actions" aria-label={tx('Mode citra', 'Imagery mode')}>
            <button
              aria-pressed={state.mode === 'recent'}
              onClick={() =>
                useHimawari.setState({
                  mode: 'recent',
                  playing: false,
                  index: -1,
                  error: false,
                  unavailable: false,
                })
              }
            >
              {tx('Terbaru', 'Recent')}
            </button>
            <button
              aria-pressed={state.mode === 'history'}
              onClick={() =>
                useHimawari.setState({
                  mode: 'history',
                  playing: false,
                  index: -1,
                  historyFrame: null,
                  error: false,
                })
              }
            >
              {tx('Riwayat harian', 'Daily history')}
            </button>
          </div>
        )}
        {HIMAWARI_HISTORY_ENABLED && state.mode === 'history' && (
          <form
            className="himawari-history"
            onSubmit={(event) => {
              event.preventDefault();
              if (!enabled) toggleWeather('clouds');
              useHimawari.setState({
                historyDate: date,
                historyFrame: null,
                playing: false,
                revision: state.revision + 1,
              });
              void loadHimawari();
            }}
          >
            <label>
              {tx('Tanggal arsip (UTC)', 'Archive date (UTC)')}
              <input
                type="date"
                required
                min={earliest.toISOString().slice(0, 10)}
                max={today.toISOString().slice(0, 10)}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button type="submit" disabled={state.fetching}>
              {tx('Tampilkan', 'Show')}
            </button>
            <p className="himawari-note">
              {tx(
                'Maksimal 1 bulan. Satu citra per hari, terdekat pukul 05:00 UTC (12:00 WIB), bukan rata-rata harian.',
                'Up to 1 month. One image per day, nearest 05:00 UTC; not a daily average.',
              )}
            </p>
          </form>
        )}
        {state.mode === 'recent' && (
          <div className="himawari-controls">
            <label>
              {tx('Rentang', 'Period')}
              <select
                aria-label={tx('Rentang animasi', 'Animation period')}
                value={state.hours}
                onChange={(e) =>
                  useHimawari.setState({ hours: Number(e.target.value), index: -1, playing: false })
                }
              >
                <option value="3">{tx('3 jam terakhir', 'Last 3 hours')}</option>
                <option value="6">{tx('6 jam terakhir', 'Last 6 hours')}</option>
                <option value="12">{tx('12 jam terakhir', 'Last 12 hours')}</option>
              </select>
            </label>
            <button
              disabled={!enabled || state.fetching}
              aria-label={tx('Perbarui citra', 'Refresh imagery')}
              onClick={() => {
                useHimawari.setState({ revision: state.revision + 1 });
                void loadHimawari();
              }}
            >
              <RefreshCw size={14} className={state.fetching ? 'himawari-refreshing' : ''} />
            </button>
          </div>
        )}
        <div className="himawari-observation">
          <small>{tx('Citra tampil', 'Displayed image')}</small>
          <strong>{format(displayed?.time)}</strong>
        </div>
        {state.mode === 'history' && (
          <div className="himawari-actions">
            <button
              disabled={
                !enabled ||
                state.error ||
                state.tileError ||
                (!state.playing && state.historyDate >= today.toISOString().slice(0, 10))
              }
              aria-pressed={state.playing}
              onClick={() => useHimawari.setState({ playing: !state.playing })}
            >
              {state.playing ? <Pause size={13} /> : <Play size={13} />}
              {state.playing ? tx('Jeda', 'Pause') : tx('Putar harian', 'Play daily')}
            </button>
            <small>{tx('1 frame / hari', '1 frame / day')}</small>
          </div>
        )}
        {state.mode === 'recent' && (
          <>
            <label className="himawari-slider">
              {tx('Waktu pengamatan', 'Observation time')}
              <output>{format(selected?.time)}</output>
              <input
                aria-label={tx('Waktu citra satelit', 'Satellite image time')}
                type="range"
                min="0"
                max={Math.max(0, frames.length - 1)}
                value={Math.max(0, index)}
                disabled={!enabled || frames.length < 2}
                onChange={(e) =>
                  useHimawari.setState({ index: Number(e.target.value), playing: false })
                }
              />
            </label>
            <div className="himawari-actions">
              <button
                disabled={!enabled || frames.length < 2 || state.error || state.tileError}
                aria-pressed={state.playing}
                onClick={() => useHimawari.setState({ playing: !state.playing })}
              >
                {state.playing ? <Pause size={13} /> : <Play size={13} />}
                {state.playing ? tx('Jeda', 'Pause') : tx('Putar', 'Play')}
              </button>
              <button
                disabled={!enabled || !frames.length}
                onClick={() => useHimawari.setState({ index: -1, playing: false })}
              >
                <SkipForward size={13} />
                {tx('Terbaru', 'Latest')}
              </button>
              <small>{frames.length} frames</small>
            </div>
          </>
        )}
        <label className="himawari-slider">
          {tx('Opasitas', 'Opacity')}
          <output>{Math.round(state.opacity * 100)}%</output>
          <input
            aria-label={tx('Opasitas awan', 'Cloud opacity')}
            type="range"
            min="0"
            max="100"
            value={Math.round(state.opacity * 100)}
            onChange={(e) => useHimawari.setState({ opacity: Number(e.target.value) / 100 })}
          />
        </label>
        <div className="himawari-status" role="status" data-error={state.error || state.tileError}>
          {!enabled
            ? tx('Layer nonaktif', 'Layer disabled')
            : state.unavailable
              ? tx(
                  'Tidak ada citra untuk tanggal ini. Pilih tanggal lain.',
                  'No imagery for this date. Choose another date.',
                )
              : state.error
                ? tx(
                    'Sumber tidak tersedia. Coba perbarui lagi.',
                    'Source unavailable. Try refreshing again.',
                  )
                : state.tileError
                  ? tx(
                      'Frame gagal dimuat. Klik perbarui untuk mencoba lagi.',
                      'Frame could not load. Refresh to try again.',
                    )
                  : state.loading || state.fetching
                    ? tx('Memuat citra…', 'Loading imagery…')
                    : state.stale
                      ? tx(
                          'Data terlambat · periksa waktu citra',
                          'Delayed data · check image time',
                        )
                      : displayed
                        ? tx('Citra tersedia', 'Imagery available')
                        : tx('Menunggu citra', 'Waiting for imagery')}
        </div>
        {enabled && (state.loading || state.fetching) && (
          <div className="himawari-loading" aria-hidden="true" />
        )}
        <p className="himawari-note">
          {tx(
            'Pengamatan satelit, bukan prakiraan hujan. Citra dapat terlambat dari waktu sekarang.',
            'Satellite observations, not a rain forecast. Imagery may lag behind the current time.',
          )}
        </p>
        <a
          className="himawari-source"
          href={
            state.mode === 'history'
              ? 'https://www.earthdata.nasa.gov/data/tools/worldview'
              : 'https://www.jma.go.jp/bosai/map.html#contents=himawari'
          }
          target="_blank"
          rel="noreferrer"
        >
          {state.mode === 'history' ? 'Himawari (JMA) / NASA GIBS' : 'JMA / Himawari'}{' '}
          <ExternalLink size={12} />
        </a>
        <details className="himawari-extra">
          <summary>{tx('Radar hujan', 'Rain radar')}</summary>
          <OsintWeatherPanel />
        </details>
      </div>
    </aside>
  );
}
