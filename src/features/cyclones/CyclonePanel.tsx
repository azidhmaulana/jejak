import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { Tornado, X, RefreshCw, ExternalLink, LocateFixed } from 'lucide-react';
import Toggle from '../../shared/components/Toggle';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useWorkspace } from '../osint/workspaceStore';
import { useCyclones, loadCyclones } from './cycloneStore';
import '../weather/Himawari.css';
import './Cyclones.css';
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
        ...(button.closest('.weather-rail') ? { right: 42, left: 'auto' } : { left: rect.right + 8 }),
        top: Math.max(60, Math.min(rect.top, innerHeight - 400)),
        maxHeight: '60vh',
      });
    };
    align();
    addEventListener('resize', align);
    return () => removeEventListener('resize', align);
  }, []);
  const selected = s.items.find((c) => c.id === s.selected);
  const format = (time: number) =>
    new Date(time).toLocaleString(en ? 'en-GB' : 'id-ID', { timeZoneName: 'short' });
  return (
    <aside
      className="public-analytics himawari-panel"
      style={position}
      aria-label={tx('Siklon tropis', 'Tropical cyclones')}
    >
      <header className="public-analytics-heading">
        <Tornado size={17} />
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
        <label className="himawari-toggle">
          <span>{tx('Marker siklon', 'Cyclone markers')}</span>
          <Toggle
            checked={s.enabled}
            onChange={() => useCyclones.setState({ enabled: !s.enabled })}
          />
        </label>
        <p className="himawari-note">
          JTWC · {tx('Pasifik & Samudra Hindia', 'Pacific & Indian Oceans')}
        </p>
        <div className="himawari-actions">
          <button disabled={s.loading} onClick={() => void loadCyclones()}>
            <RefreshCw size={13} />
            {tx('Perbarui', 'Refresh')}
          </button>
          <small>{s.feedTime ? format(s.feedTime) : '—'}</small>
        </div>
        <p className="himawari-note">
          {tx(
            'Posisi analisis terbaru, bukan siaran langsung. Pembaruan otomatis 10 menit saat layer aktif. Bibit siklon belum termasuk.',
            'Latest analysed positions, not a live feed. Refreshes every 10 minutes while enabled. Invests are not included.',
          )}
        </p>
        <div role="status" className="himawari-status">
          {s.loading
            ? tx('Memuat buletin JTWC…', 'Loading JTWC bulletins…')
            : s.error
              ? tx(
                  'Sumber gagal dimuat atau terlambat. Coba perbarui.',
                  'Source unavailable or outdated. Try refreshing.',
                )
              : !s.feedTime
                ? tx('Aktifkan marker untuk memuat.', 'Enable markers to load.')
                : s.items.length
                  ? tx(
                      `${s.items.length} siklon dalam buletin terbaru`,
                      `${s.items.length} cyclones in latest bulletins`,
                    )
                  : tx(
                      'Tidak ada siklon aktif dalam feed ini.',
                      'No active cyclones in this feed.',
                    )}
        </div>
        <div className="cyclone-list">
          {s.items.map((c) => (
            <button
              key={c.id}
              aria-pressed={selected?.id === c.id}
              onClick={() => {
                useCyclones.setState({ selected: c.id, enabled: true });
                window.dispatchEvent(new CustomEvent('jejak-focus-cyclone', { detail: c.id }));
              }}
            >
              <strong>{c.name}</strong>
              <span>
                {c.designation} · {c.windKnots ?? '—'} kt
              </span>
            </button>
          ))}
        </div>
        {selected && (
          <>
            <strong>
              {selected.name} · {selected.designation}
            </strong>
            <small>{format(selected.time)}</small>
            <div className="cyclone-detail">
              <span>
                {tx('Angin (rata-rata 1 menit)', 'Wind (1-minute mean)')}
                <strong>{selected.windKnots ?? '—'} kt</strong>
              </span>
              <span>
                {tx('Hembusan', 'Gusts')}
                <strong>{selected.gustKnots ?? '—'} kt</strong>
              </span>
              <span>
                {tx('Pergerakan 6 jam terakhir', 'Motion over past 6 hours')}
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
            <div className="himawari-actions">
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('jejak-focus-cyclone', { detail: selected.id }),
                  )
                }
              >
                <LocateFixed size={13} />
                {tx('Lihat peta', 'Locate')}
              </button>
              <a
                className="himawari-source"
                href={selected.source}
                target="_blank"
                rel="noreferrer"
              >
                JTWC <ExternalLink size={12} />
              </a>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
