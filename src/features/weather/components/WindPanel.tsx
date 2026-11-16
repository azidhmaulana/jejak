import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { Wind, X } from 'lucide-react';
import Toggle from '../../../shared/components/Toggle';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useWorkspace } from '../../osint/workspaceStore';
import { useOsintWeather, toggleWeather } from '../osintWeatherStore';
import '../Himawari.css';

export default function WindPanel() {
  const en = useLanguage() === 'en';
  const s = useOsintWeather();
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const align = () => {
      const button = document.querySelector('[data-wind-trigger]');
      if (!button || innerWidth <= 700) {
        setPosition({});
        return;
      }
      const rect = button.getBoundingClientRect();
      setPosition({
        position: 'fixed',
        ...(button.closest('.weather-rail') ? { right: 42, left: 'auto' } : { left: rect.right + 8 }),
        top: Math.max(60, Math.min(rect.top, innerHeight - 370)),
        maxHeight: '60vh',
      });
    };
    align();
    addEventListener('resize', align);
    return () => removeEventListener('resize', align);
  }, []);
  return (
    <aside
      className="public-analytics himawari-panel"
      style={position}
      aria-label={en ? 'Wind settings' : 'Pengaturan angin'}
    >
      <header className="public-analytics-heading">
        <Wind size={17} />
        <h2>{en ? 'Wind' : 'Angin'}</h2>
        <button
          className="analytics-close"
          aria-label={en ? 'Close wind' : 'Tutup angin'}
          onClick={() => useWorkspace.setState({ panel: null })}
        >
          <X size={13} />
        </button>
      </header>
      <div className="public-analytics-body himawari-body">
        <label className="himawari-toggle">
          <span>{en ? 'Wind layer' : 'Layer angin'}</span>
          <Toggle checked={s.wind} onChange={() => toggleWeather('wind')} />
        </label>
        <p className="himawari-note">NOAA GFS · 10 m · 1°</p>
        <label className="himawari-slider">
          {en ? 'Opacity' : 'Opasitas'}
          <output>{Math.round(s.windOpacity * 100)}%</output>
          <input
            aria-label={en ? 'Wind opacity' : 'Opasitas angin'}
            type="range"
            min="0"
            max="100"
            value={Math.round(s.windOpacity * 100)}
            onChange={(e) =>
              useOsintWeather.setState({ windOpacity: Number(e.target.value) / 100 })
            }
          />
        </label>
        <label className="himawari-toggle">
          <span>{en ? 'Flow animation' : 'Animasi aliran'}</span>
          <Toggle
            checked={s.particles}
            onChange={() => useOsintWeather.setState({ particles: !s.particles })}
          />
        </label>
        <label className="himawari-toggle">
          <span>{en ? 'Forecast time' : 'Waktu prakiraan'}</span>
          <Toggle
            checked={s.windTime}
            onChange={() => useOsintWeather.setState({ windTime: !s.windTime, windHour: 0 })}
          />
        </label>
        {s.windTime && (
          <label className="himawari-slider">
            <output>
              {s.windHour > 0 ? '+' : ''}
              {s.windHour} h
            </output>
            <input
              aria-label="Wind forecast hour"
              type="range"
              min="-72"
              max="120"
              step="3"
              value={s.windHour}
              onChange={(e) => useOsintWeather.setState({ windHour: Number(e.target.value) })}
            />
          </label>
        )}
        <p className="himawari-note">
          {en
            ? 'Background color: wind speed (mph). Lines: flow direction. GFS model, not station observations.'
            : 'Warna latar: kecepatan angin (mph). Garis: arah aliran. Model GFS, bukan pengamatan stasiun.'}
        </p>
        {s.wind && (
          <p role="status" className="himawari-status">
            {s.status.wind}
          </p>
        )}
      </div>
    </aside>
  );
}
