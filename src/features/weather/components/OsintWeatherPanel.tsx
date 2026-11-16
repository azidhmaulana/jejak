import { useLanguage } from '../../../shared/i18n/useLanguage';
import Toggle from '../../../shared/components/Toggle';
import { getLocale } from '../../../shared/i18n/runtime.js';
import { useOsintWeather, toggleWeather, type WeatherLayer } from '../osintWeatherStore';

export default function OsintWeatherPanel() {
  const language = useLanguage();
  const s = useOsintWeather();
  const time = s.frames[s.rainIndex < 0 ? s.frames.length - 1 : s.rainIndex]?.time;
  const row = (key: WeatherLayer, title: string, description: string) => (
    <div className="osint-weather-group">
      <label className="osint-weather-toggle">
        <Toggle checked={s[key]} onChange={() => toggleWeather(key)} />
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </label>
      {s[key] && s.status[key] && (
        <p role="status" className="osint-weather-status">
          {s.status[key]}
        </p>
      )}
    </div>
  );
  return (
    <section className="osint-weather-panel">
      {row('rain', 'RAIN', 'RainViewer radar · interval 10 menit')}
      <div className="osint-weather-children">
        <label className="osint-weather-toggle">
          <input
            type="checkbox"
            role="switch"
            disabled={!s.rain}
            checked={s.rainTime}
            onChange={(e) =>
              useOsintWeather.setState({
                rainTime: e.target.checked,
                rainIndex: -1,
                playing: false,
              })
            }
          />
          <span>
            <strong>TIME CONTROLS</strong>
            <small>2 jam terakhir · loop</small>
          </span>
        </label>
        {s.rain && s.rainTime && (
          <div className="osint-weather-timeline">
            <output>
              {time ? new Date(time * 1000).toLocaleString(getLocale()) : 'Belum ada frame'}
            </output>
            <input
              aria-label="Rain radar time"
              type="range"
              min="0"
              max={Math.max(0, s.frames.length - 1)}
              disabled={!s.frames.length}
              value={s.rainIndex < 0 ? Math.max(0, s.frames.length - 1) : s.rainIndex}
              onChange={(e) =>
                useOsintWeather.setState({ rainIndex: Number(e.target.value), playing: false })
              }
            />
            <button
              disabled={s.frames.length < 2}
              aria-pressed={s.playing}
              onClick={() => useOsintWeather.setState({ playing: !s.playing })}
            >
              {s.playing ? 'PAUSE' : 'PLAY LOOP'}
            </button>
          </div>
        )}
      </div>
      <p className="osint-empty">
        {language === 'en'
          ? 'Wind: bilinear interpolation of NOAA GFS model vectors, not sensor observations. Radar coverage varies by region.'
          : 'Angin: interpolasi bilinear vektor model NOAA GFS, bukan pengukuran sensor. Cakupan radar berbeda tiap wilayah.'}
      </p>
      <div className="osint-weather-credits">
        <a href="https://nowcoast.noaa.gov/" target="_blank" rel="noreferrer">
          NOAA
        </a>{' '}
        ·{' '}
        <a
          href="https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast"
          target="_blank"
          rel="noreferrer"
        >
          NOAA GFS
        </a>{' '}
        ·{' '}
        <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">
          RainViewer
        </a>
      </div>
    </section>
  );
}
