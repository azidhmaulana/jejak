import { useLayoutEffect, useState, type CSSProperties } from 'react';

import { Tornado, X, RefreshCw, ExternalLink, LocateFixed, Wind } from 'lucide-react';

import Toggle from '../../shared/components/Toggle';

import { useLanguage } from '../../shared/i18n/useLanguage';

import { useWorkspace } from '../osint/workspaceStore';

import { useCyclones, loadCyclones } from './cycloneStore';

import '../weather/Himawari.css';

import './Cyclones.css';

import { useOsintWeather } from '../weather/osintWeatherStore';

export default function CyclonePanel() {
  const en = useLanguage() === 'en',
    s = useCyclones();

  const tx = (id: string, english: string) => (en ? english : id);

  const [position, setPosition] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const align = () => {
      const button = document.querySelector('[data-cyclone-trigger]');

      if (!button || innerWidth <= 700) {
        setPosition({});

        return;
      }

      const rect = button.getBoundingClientRect();

      setPosition({
        position: 'fixed',

        ...(button.closest('.weather-rail')
          ? { right: 42, left: 'auto' }
          : { left: rect.right + 8 }),

        top: Math.max(60, Math.min(rect.top, innerHeight - 400)),

        maxHeight: '60vh',
      });
    };

    align();

    addEventListener('resize', align);

    return () => removeEventListener('resize', align);
  }, []);
  const windTime = useOsintWeather((state) => (state.wind ? state.windValidTime : null));
  const selected = s.items.find((c) => c.id === s.selected);
  const format = (time: number) =>
    new Date(time).toLocaleString(en ? 'en-GB' : 'id-ID', { timeZoneName: 'short' });
  return (
    <aside
      className="public-analytics himawari-panel cyclone-panel"
      style={position}
      aria-label={tx('Siklon tropis', 'Tropical cyclones')}
    >
      <header className="public-analytics-heading">
        <Tornado size={19} />
        <h2>{tx('Siklon Tropis', 'Tropical Cyclones')}</h2>
        <button
          className="analytics-close"
          aria-label={tx('Tutup siklon', 'Close cyclones')}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={13} />
        </button>
      </header>
      <div className="public-analytics-body himawari-body">
        <div className="cyclone-toolbar">
          <label className="himawari-toggle">
            <span>{tx('Marker siklon', 'Cyclone markers')}</span>
            <Toggle
              checked={s.enabled}
              onChange={() => useCyclones.setState({ enabled: !s.enabled })}
            />
          </label>
          <button
            aria-label={tx('Perbarui', 'Refresh')}
            title={tx('Perbarui', 'Refresh')}
            disabled={s.loading}
            onClick={() => void loadCyclones()}
          >
            <RefreshCw size={13} className={s.loading ? 'cyclone-refresh-spin' : ''} />
          </button>
          <small>{s.feedTime ? format(s.feedTime) : '—'}</small>
        </div>
        <div role="status" className="cyclone-count">
          {s.loading
            ? tx('Memuat sumber badai...', 'Loading cyclone sources...')
            : s.error
              ? tx('Sumber gagal dimuat. Coba perbarui.', 'Source unavailable. Try refreshing.')
              : !s.feedTime
                ? tx('Aktifkan marker untuk memuat.', 'Enable markers to load.')
                : tx(`${s.items.length} sistem`, `${s.items.length} systems`)}
        </div>
        <div className="cyclone-list">
          {s.items.map((c) => (
            <button
              key={c.id}
              title={c.name}
              aria-pressed={selected?.id === c.id}
              onClick={() => {
                useCyclones.setState({ selected: c.id, enabled: true });
                window.dispatchEvent(new CustomEvent('jejak-focus-cyclone', { detail: c.id }));
              }}
            >
              <strong>{c.name}</strong>
              <span>{c.kind === 'invest' ? 'Invest' : c.designation}</span>
              <b className="cyclone-card-wind">
                <Wind size={16} />
                {c.windRangeKnots?.join('-') ?? c.windKnots ?? '—'} kt
              </b>
            </button>
          ))}
        </div>
        {selected && (
          <>
            <h3 className="cyclone-selected-title">
              {selected.name} ({selected.designation})
            </h3>
            <div className="cyclone-detail">
              <span
                title={tx(
                  `Rata-rata ${selected.windPeriodMinutes ?? 1} menit`,
                  `${selected.windPeriodMinutes ?? 1}-minute mean`,
                )}
              >
                {tx('Angin', 'Wind')}
                <strong>
                  {selected.windRangeKnots?.join('-') ?? selected.windKnots ?? '—'} kt
                </strong>
              </span>
              <span>
                {tx('Hembusan', 'Gusts')}
                <strong>{selected.gustKnots ?? '—'} kt</strong>
              </span>
              <span>
                {tx('Pergerakan', 'Motion')}
                <strong>
                  {selected.direction ?? '—'}° · {selected.speedKnots ?? '—'} kt
                </strong>
              </span>
              <span>
                {tx('Koordinat', 'Coordinates')}
                <strong>
                  {selected.lat.toFixed(2)}, {selected.lng.toFixed(2)}
                </strong>
              </span>
            </div>
            <div className="cyclone-footer">
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('jejak-focus-cyclone', { detail: selected.id }),
                  )
                }
              >
                <LocateFixed size={15} />
                {tx('Lihat peta', 'Locate')}
              </button>
              <span>
                {tx('Sumber:', 'Source:')}{' '}
                <a href={selected.source} target="_blank" rel="noopener noreferrer">
                  {selected.agency ?? 'JTWC'} <ExternalLink size={12} />
                </a>
              </span>
            </div>
            <details className="cyclone-more">
              <summary>{tx('Informasi sumber dan riwayat', 'Source and history details')}</summary>
              <p>
                {format(selected.time)}.{' '}
                {tx(
                  'Posisi analisis terbaru; pembaruan otomatis 10 menit.',
                  'Latest analysed position; refreshes every 10 minutes.',
                )}
              </p>
              <p>
                {s.sources
                  .map(
                    (source) =>
                      `${source.agency}: ${source.status === 'ok' ? source.count : source.status}`,
                  )
                  .join(' / ')}
              </p>
              {selected.kind === 'invest' && (
                <p>
                  {selected.name} (Invest) / {tx('Potensi perkembangan', 'Development potential')}:{' '}
                  {selected.potential ?? '—'}
                </p>
              )}
              <p role="status">
                {s.historyStatus === 'loading'
                  ? tx('Memuat riwayat...', 'Loading history...')
                  : s.historyStatus === 'error'
                    ? tx('Riwayat sementara tidak tersedia.', 'History temporarily unavailable.')
                    : tx(
                        `${s.historyCount} titik riwayat. Garis utuh: riwayat; putus-putus: prakiraan.`,
                        `${s.historyCount} history points. Solid: history; dashed: forecast.`,
                      )}
              </p>
              {windTime && (
                <p>
                  {tx('Angin GFS', 'GFS wind')}: {format(windTime)}.{' '}
                  {tx(
                    'Grid angin 1°; pusat model dapat berbeda dari posisi laporan.',
                    'Wind grid 1°; model centres can differ from reported positions.',
                  )}
                </p>
              )}
            </details>
          </>
        )}
      </div>
    </aside>
  );
}
