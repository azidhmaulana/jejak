import { useOsintWeather } from '../osintWeatherStore';
import { useHimawari } from '../himawariStore';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import './InfraLegend.css';

export default function InfraLegend() {
  const enabled = useOsintWeather(s => s.clouds);
  const infra = useHimawari(s => s.product === 'enhanced');
  const en = useLanguage() === 'en';
  if (!enabled || !infra) return null;
  return <div className="infra-legend" role="img"
    aria-label={en ? 'Infrared brightness temperature in kelvin: 240, 230, 220, 210, 200' : 'Suhu kecerahan inframerah dalam kelvin: 240, 230, 220, 210, 200'}
    title={en ? 'Cloud-top brightness temperature (K), not surface air temperature' : 'Suhu kecerahan puncak awan (K), bukan suhu udara permukaan'}>
    {['K', '240', '230', '220', '210', '200'].map(value => <span key={value}>{value}</span>)}
  </div>;
}
