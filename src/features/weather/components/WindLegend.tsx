import { useOsintWeather } from '../osintWeatherStore';
import { WIND_SCALE } from '../windColors';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import '../WindLegend.css';

export default function WindLegend() {
  const enabled = useOsintWeather((s) => s.wind);
  const hour = useOsintWeather((s) => (s.windTime ? s.windHour : 0));
  const en = useLanguage() === 'en';
  const validTime = useOsintWeather((s) => s.windValidTime);
  if (!enabled) return null;
  return (
    <aside
      className="wind-legend"
      aria-label={en ? 'Wind speed legend' : 'Legenda kecepatan angin'}
    >
      <header>
        <strong>{en ? 'Wind' : 'Angin'} · mph</strong>
        <span>GFS · 10 m{hour !== 0 ? ` · ${hour > 0 ? '+' : ''}${hour} h` : ''}</span>
      </header>
      <div className="wind-legend-scale">
        {WIND_SCALE.map((stop, i) => (
          <span
            key={stop.mph}
            style={{ backgroundColor: stop.color, color: i <= 3 || i >= 8 ? '#fff' : '#092116' }}
            title={`${stop.mph} mph ≈ ${(stop.mph / 2.2369362921).toFixed(1)} m/s`}
          >
            {stop.mph}
            {i === WIND_SCALE.length - 1 ? '+' : ''}
          </span>
        ))}
      </div>
      <small>
        {validTime
          ? `GFS 1° · ${new Date(validTime).toLocaleString(en ? 'en-GB' : 'id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
          : en
            ? 'Loading global GFS grid…'
            : 'Memuat grid global GFS…'}
      </small>
    </aside>
  );
}
