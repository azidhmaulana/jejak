import type { CSSProperties } from 'react';
import { X, RotateCw } from 'lucide-react';
import Toggle from '../../../shared/components/Toggle';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { selectWeather, useOsintWeather } from '../osintWeatherStore';
import { useScalarWeather } from '../scalarWeatherStore';
import { scalarFields } from '../scalarWeather';
import './ScalarWeatherPanel.css';
export default function ScalarWeatherPanel() {
  const en = useLanguage() === 'en',
    weather = useOsintWeather(),
    s = useScalarWeather(),
    field = weather.scalarField;
  if (!field) return null;
  const spec = scalarFields[field],
    surface = field === 'surface';
  const date = (t: number) =>
    new Date(t).toLocaleString(en ? 'en-GB' : 'id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  const min = spec.stops[0]?.[0],
    max = spec.stops[spec.stops.length - 1]?.[0];
  const gradient = spec.stops.map(([v, c]) => `${c} ${((v - min) / (max - min)) * 100}%`).join(',');
  return (
    <>
      {!surface && (
        <aside className="scalar-legend" aria-label={en ? 'Weather scale' : 'Skala cuaca'}>
          <span>{spec.unit}</span>
          <div style={{ background: `linear-gradient(to right,${gradient})` }}>
            {spec.stops.map(([v]) => (
              <span key={v}>{v}</span>
            ))}
          </div>
        </aside>
      )}
      <section
        className="weather-dock scalar-weather-panel"
        aria-label={en ? 'Weather field controls' : 'Kontrol data cuaca'}
      >
        {(s.loading || (weather.wind && weather.windLoading)) && (
          <div
            className="weather-dock-loading"
            role="status"
            aria-label={en ? 'Loading weather data' : 'Memuat data cuaca'}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="weather-loading-dot"
                style={{ '--dot-index': i } as CSSProperties}
              />
            ))}
          </div>
        )}
        <div className="scalar-panel-body">
          {weather.wind && weather.status.wind.includes('unavailable') && (
            <small role="status">
              {en
                ? 'Wind source unavailable; turn wind off and on to retry.'
                : 'Sumber angin tidak tersedia; matikan lalu nyalakan angin untuk mencoba lagi.'}
            </small>
          )}
          <header>
            <strong>{en ? spec.en : spec.id}</strong>
            <button
              aria-label={en ? 'Close weather layer' : 'Tutup layer cuaca'}
              onClick={() => selectWeather(null)}
            >
              <X size={13} />
            </button>
          </header>
          <p className="scalar-source">
            {surface
              ? `NASA Aqua MODIS / ${s.surfaceDate || '...'} / 1 km`
              : `NOAA GFS / 1 degree / ${s.grid ? date(s.grid.validTime) : '...'}`}
          </p>
          {!surface && (
            <label className="scalar-time">
              {en ? 'Forecast time' : 'Waktu model'}{' '}
              <output>
                {s.hour > 0 ? '+' : ''}
                {s.hour} h
              </output>
              <input
                aria-label={en ? 'Forecast hour' : 'Jam model'}
                type="range"
                min="-72"
                max="120"
                step="3"
                value={s.hour}
                onChange={(e) => {
                  const hour = Number(e.target.value);
                  useScalarWeather.setState({ hour });
                  useOsintWeather.setState({ windHour: hour, windTime: true });
                }}
              />
            </label>
          )}
          <div className="scalar-controls">
            <label>
              {en ? 'Opacity' : 'Opasitas'}
              <input
                aria-label={en ? 'Weather opacity' : 'Opasitas cuaca'}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={s.opacity}
                onChange={(e) => useScalarWeather.setState({ opacity: Number(e.target.value) })}
              />
              <output>{Math.round(s.opacity * 100)}%</output>
            </label>
            {(field === 'gust' || field === 'pressure' || field === 'temperature') && (
              <label>
                <Toggle
                  aria-label={en ? 'Wind animation' : 'Animasi angin'}
                  checked={weather.wind}
                  onChange={() => useOsintWeather.setState({ wind: !weather.wind })}
                />
                {en ? 'Wind' : 'Angin'}
              </label>
            )}
          </div>
          {s.error ? (
            <p role="alert">
              {en ? 'Source unavailable.' : 'Sumber belum tersedia.'}{' '}
              <button onClick={() => useScalarWeather.setState({ retry: s.retry + 1 })}>
                <RotateCw size={12} className={s.loading ? 'refresh-icon-spinning' : ''} />
                {en ? 'Retry' : 'Coba lagi'}
              </button>
            </p>
          ) : surface ? (
            <>
              <img
                className="surface-legend"
                src="https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.svg"
                alt={
                  en
                    ? 'NASA land surface temperature scale in Kelvin'
                    : 'Skala suhu permukaan NASA dalam Kelvin'
                }
              />
              <small>
                {en
                  ? 'Daily land surface temperature, not air temperature. Cloud gaps are normal; this is not a street-level urban heat model.'
                  : 'Suhu permukaan harian, bukan suhu udara. Area berawan dapat kosong; bukan model panas kota tingkat jalan.'}
              </small>
            </>
          ) : (
            <p className="scalar-reading">
              {s.sample
                ? `${s.sample.lat.toFixed(3)}, ${s.sample.lng.toFixed(3)} / ${s.sample.value === null ? (en ? 'No valid value' : 'Tidak ada nilai valid') : s.sample.value.toFixed(1) + ' ' + spec.unit}`
                : en
                  ? 'Click the map to inspect a value.'
                  : 'Klik peta untuk melihat nilainya.'}
            </p>
          )}
          {(field === 'wetbulb' || field === 'uv') && (
            <small>
              {en ? 'Derived estimate' : 'Estimasi turunan'}
              {field === 'wetbulb' ? ' / Stull (2011)' : ' / GFS UV-B'}
            </small>
          )}
          {(field === 'solar' || field === 'uv') && (
            <small>
              {en
                ? 'Average over the model interval ending at this time.'
                : 'Rata-rata interval model yang berakhir pada waktu ini.'}
            </small>
          )}
          {!surface && s.grid && (
            <small>
              {en ? 'Model run' : 'Run model'}: {date(s.grid.referenceTime)}
              {weather.wind && weather.windValidTime !== s.grid.validTime
                ? en
                  ? ' / Wind time differs / loading'
                  : ' / Waktu angin berbeda / memuat'
                : ''}
            </small>
          )}
        </div>
      </section>
    </>
  );
}
