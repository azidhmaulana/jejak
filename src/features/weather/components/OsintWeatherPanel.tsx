import { useOsintWeather, toggleWeather, type WeatherLayer } from '../osintWeatherStore';

export default function OsintWeatherPanel() {
  const s = useOsintWeather();
  const time = s.frames[s.rainIndex < 0 ? s.frames.length - 1 : s.rainIndex]?.time;
  const row = (key: WeatherLayer, title: string, description: string) => (
    <div className="osint-weather-group">
      <label className="osint-weather-toggle">
        <input type="checkbox" role="switch" checked={s[key]} onChange={() => toggleWeather(key)} />
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
      <div className="osint-weather-all">
        <span>WEATHER LAYERS</span>
        <button
          aria-pressed={s.clouds && s.wind && s.rain}
          onClick={() => {
            const enabled = !(s.clouds && s.wind && s.rain);
            useOsintWeather.setState({
              clouds: enabled,
              wind: enabled,
              rain: enabled,
              playing: false,
            });
          }}
        >
          ALL
        </button>
      </div>
      {row('clouds', 'LIVE CLOUDS', 'NOAA satellite · citra inframerah 2D · per jam')}
      {row('wind', 'WIND', 'NOAA GFS via Open-Meteo · angin 10 m')}
      <div className="osint-weather-children">
        <label className="osint-weather-toggle">
          <input
            type="checkbox"
            role="switch"
            disabled={!s.wind}
            checked={s.windTime}
            onChange={(e) => useOsintWeather.setState({ windTime: e.target.checked, windHour: 0 })}
          />
          <span>
            <strong>TIME CONTROLS</strong>
            <small>3 hari sebelumnya · 5 hari ke depan</small>
          </span>
        </label>
        {s.wind && s.windTime && (
          <label className="osint-weather-timeline">
            <output>
              {s.windHour === 0 ? 'Sekarang' : `${s.windHour > 0 ? '+' : ''}${s.windHour} jam`}
            </output>
            <input
              aria-label="Wind forecast hour"
              type="range"
              min="-72"
              max="120"
              step="6"
              value={s.windHour}
              onChange={(e) => useOsintWeather.setState({ windHour: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="osint-weather-toggle">
          <input
            type="checkbox"
            role="switch"
            disabled={!s.wind}
            checked={s.particles}
            onChange={(e) => useOsintWeather.setState({ particles: e.target.checked })}
          />
          <span>
            <strong>PARTICLES</strong>
            <small>Animasi arah · warna menurut kecepatan</small>
          </span>
        </label>
      </div>
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
              {time ? new Date(time * 1000).toLocaleString('id-ID') : 'Belum ada frame'}
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
        Angin: sampel model di area peta, bukan pengukuran sensor. Radar kosong dapat berarti
        wilayah belum tercakup.
      </p>
      <div className="osint-weather-credits">
        <a href="https://nowcoast.noaa.gov/" target="_blank" rel="noreferrer">
          NOAA
        </a>{' '}
        ·{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{' '}
        ·{' '}
        <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">
          RainViewer
        </a>
      </div>
    </section>
  );
}
