import { useOsintWeather } from '../osintWeatherStore';
import { WIND_SCALE } from '../windColors';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import '../WindLegend.css';

export default function WindLegend() {
  const enabled = useOsintWeather(s => s.wind && !s.scalarField);
  const validTime = useOsintWeather(s => s.windValidTime);
  const en = useLanguage() === 'en';
  if (!enabled) return null;
  const info = `GFS 10 m / 1°${validTime ? ' / ' + new Date(validTime).toISOString().replace('T',' ').slice(0,16) + ' UTC' : ''}`;
  return <aside className="wind-legend" aria-label={en ? 'Wind speed legend in mph' : 'Legenda kecepatan angin dalam mph'} title={info}>
    <span className="wind-legend-unit">mph</span>
    {WIND_SCALE.map((stop,i) => <span key={stop.mph}
      style={{backgroundColor:stop.color,color:i>=4 && i<=8 ? '#092116' : '#fff'}}
      title={`${stop.mph} mph / ${(stop.mph/2.2369362921).toFixed(1)} m/s`}>
      {stop.mph}{i===WIND_SCALE.length-1 ? '+' : ''}
    </span>)}
  </aside>;
}
