import {
  Radar,
  Radio,
  BarChart3,
  AlertTriangle,
  Pencil,
  Timer,
  Route,
  Search,
  Database,
  Bluetooth,
  Pause,
  Play,
} from 'lucide-react';
import { useState } from 'react';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useOsintWeather } from '../../weather/osintWeatherStore';
const open = (id: string, element: HTMLElement) =>
  window.dispatchEvent(new CustomEvent('osint-open-panel', { detail: { id, element } }));
export function OsintRightRail() {
  const controller = useMapTools((s) => s.controller),
    mode = useMapTools((s) => s.mode),
    range = useMapTools((s) => s.range);
  const draw = () => controller?.mode(mode === 'linestring' ? 'render' : 'linestring');
  return (
    <nav className="osint-right-rail" aria-label="OSINT tools">
      <button
        className="osint-tool-accent"
        title="Intelligence"
        aria-label="Intelligence"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('intelligence', event.currentTarget);
        }}
        onClick={(event) => open('intelligence', event.currentTarget)}
      >
        <Radar />
      </button>
      <button
        title="Signals"
        aria-label="Signals"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('signals', event.currentTarget);
        }}
        onClick={(event) => open('signals', event.currentTarget)}
      >
        <Radio />
      </button>
      <button
        title="Analytics"
        aria-label="Analytics"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('analytics', event.currentTarget);
        }}
        onClick={(event) => open('analytics', event.currentTarget)}
      >
        <BarChart3 />
      </button>
      <button
        title="Alerts"
        aria-label="Alerts"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('alerts', event.currentTarget);
        }}
        onClick={(event) => open('alerts', event.currentTarget)}
      >
        <AlertTriangle />
      </button>
      <button
        title="Draw on map"
        aria-label="Draw on map"
        disabled={!controller}
        aria-pressed={mode === 'linestring'}
        onClick={draw}
      >
        <Pencil />
      </button>
      <button
        className="osint-tool-accent"
        title="Weather timeline"
        aria-label="Weather timeline"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('weather', event.currentTarget);
        }}
        onClick={(event) => open('weather', event.currentTarget)}
      >
        <Timer />
        <small>TIME</small>
      </button>
      <button
        title="Measure route"
        aria-label="Measure route"
        disabled={!controller}
        aria-pressed={range}
        onClick={() => {
          useMapTools.setState({ range: !range });
          if (!range) controller?.mode('linestring');
        }}
      >
        <Route />
      </button>
      <button
        title="Search map"
        aria-label="Focus map search"
        onClick={() =>
          document.querySelector<HTMLInputElement>('input[aria-label="Search map query"]')?.focus()
        }
      >
        <Search />
      </button>
      <span className="osint-tool-divider" />
      <button
        title="Map objects"
        aria-label="Open map objects"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('objects', event.currentTarget);
        }}
        onClick={(event) => open('objects', event.currentTarget)}
      >
        <Database />
      </button>
      <button
        title="Bluetooth"
        aria-label="Bluetooth"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') open('bluetooth', event.currentTarget);
        }}
        onClick={(event) => open('bluetooth', event.currentTarget)}
      >
        <Bluetooth />
      </button>
    </nav>
  );
}
export function OsintTicker() {
  const [paused, setPaused] = useState(false);
  const count = useMapTools((s) => s.features.length),
    sync = useMapTools((s) => s.syncStatus),
    weather = useOsintWeather();
  const states = {
    loading: 'Menghubungkan',
    saving: 'Menyimpan',
    synced: 'Tersinkron',
    offline: 'Offline',
    conflict: 'Konflik penyimpanan',
    error: 'Gagal sinkron',
  };
  const items = [
    `OSINT · ${count} objek peta`,
    `PROJECT · ${states[sync]}`,
    ...(['clouds', 'wind', 'rain'] as const).map(
      (key) =>
        `${key.toUpperCase()} · ${weather[key] ? weather.status[key] || 'Memuat data…' : 'OFF'}`,
    ),
  ];
  return (
    <div
      className={'osint-ticker' + (paused ? ' is-paused' : '')}
      aria-label="OSINT running status"
    >
      <span className="osint-ticker-label">LIVE STATUS</span>
      <button
        aria-label={paused ? 'Play running text' : 'Pause running text'}
        title={paused ? 'Play' : 'Pause'}
        onClick={() => setPaused(!paused)}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
      <div className="osint-ticker-window">
        <div className="osint-ticker-track">
          {[0, 1].map((copy) => (
            <div className="osint-ticker-copy" key={copy} aria-hidden={copy === 1}>
              {items.map((item) => (
                <span key={item}>
                  <i />
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
