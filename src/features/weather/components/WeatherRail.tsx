import { useEffect, useState } from 'react';
import { Radar, Satellite, Wind, Tornado, X, Settings2 } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { selectWeather, useOsintWeather } from '../osintWeatherStore';
import { useHimawari } from '../himawariStore';
import { useCyclones } from '../../cyclones/cycloneStore';
import { openWorkspacePanel } from '../../osint/workspaceStore';
import './WeatherRail.css';

type Group = 'rain' | 'clouds' | 'wind' | 'cyclones';
export default function WeatherRail() {
  const en = useLanguage() === 'en';
  const weather = useOsintWeather();
  const satellite = useHimawari();
  const cyclone = useCyclones();
  const [group, setGroup] = useState<Group | null>(null);
  const [retainedGroup, setRetainedGroup] = useState<Group | null>(null);
  useEffect(() => {
    if (group) { setRetainedGroup(group); return; }
    const timer = setTimeout(() => setRetainedGroup(null), 280);
    return () => clearTimeout(timer);
  }, [group]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setGroup(null); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useEffect(() => {
    document.querySelector('.command-workspace')?.classList.toggle('weather-catalog-open', Boolean(group));
    return () => document.querySelector('.command-workspace')?.classList.remove('weather-catalog-open');
  }, [group]);
  const items = [
    { id: 'rain' as const, Icon: Radar, label: en ? 'Weather radar' : 'Radar cuaca', active: weather.rain },
    { id: 'clouds' as const, Icon: Satellite, label: en ? 'Satellite' : 'Satelit', active: weather.clouds },
    { id: 'wind' as const, Icon: Wind, label: en ? 'Wind' : 'Angin', active: weather.wind },
    { id: 'cyclones' as const, Icon: Tornado, label: en ? 'Storm tracker' : 'Pelacak badai', active: cyclone.enabled },
  ];
  const current = items.find(i => i.id === (group ?? retainedGroup));
  const choose = (target: Group, product?: 'auto' | 'visible' | 'ir') => {
    if (target === 'cyclones') useCyclones.setState({ enabled: !cyclone.enabled });
    else { useHimawari.setState({ playing: false, ...(product ? { product } : {}) }); selectWeather(target); }
  };
  return <div className={`weather-rail-shell${group ? ' is-expanded' : ''}`}>
    <nav className="weather-rail" aria-label={en ? 'Weather layers' : 'Layer cuaca'}>
      {items.map(({id, Icon, label, active}) => <button key={id} data-weather-trigger={id === 'clouds' ? '' : undefined} data-wind-trigger={id === 'wind' ? '' : undefined} data-cyclone-trigger={id === 'cyclones' ? '' : undefined} aria-label={label} title={label} aria-pressed={active} aria-expanded={group === id} aria-controls="weather-layer-drawer" onClick={() => setGroup(group === id ? null : id)}><Icon size={16}/></button>)}
    </nav>
    {current && <aside id="weather-layer-drawer" className="weather-layer-drawer" aria-hidden={!group} aria-label={en ? 'Weather catalog' : 'Katalog cuaca'} {...(!group ? { inert: '' } : {})}>
      <header><Satellite size={17}/><strong>{en ? 'Weather layers' : 'Layer cuaca'}</strong><button aria-label={en ? 'Close layer choices' : 'Tutup pilihan layer'} onClick={() => setGroup(null)}><X size={13}/></button></header>
      <div className="weather-layer-choices">
        {items.map(({id, Icon, label, active}) => <section className="weather-catalog-group" key={id}>
          <h3><Icon size={13}/>{label}</h3>
          <div className="weather-catalog-grid">
          {id === 'clouds' ? ([{id:'auto',title:en ? 'Day / Night' : 'Siang / Malam'}, {id:'visible',title:en ? 'Visible' : 'Terlihat'}, {id:'ir',title:'Infrared'}] as const).map(option => <button className="weather-layer-card" key={option.id} aria-pressed={active && satellite.product === option.id} onClick={() => choose(id, option.id)}><Icon/><span><strong>{option.title}</strong><small>Himawari ? JMA</small></span></button>) : <button className="weather-layer-card" aria-pressed={active} onClick={() => choose(id)}><Icon/><span><strong>{id === 'wind' ? (en ? 'Surface wind' : 'Angin permukaan') : label}</strong><small>{id === 'wind' ? 'GFS ? 10 m' : id === 'rain' ? 'RainViewer' : 'JTWC'}</small></span></button>}
          </div>
          <button className="weather-group-settings" onClick={() => { openWorkspacePanel(id === 'wind' ? 'wind' : id === 'cyclones' ? 'cyclones' : 'weather'); }}><Settings2 size={12}/>{en ? 'Settings' : 'Pengaturan'}</button>
        </section>)}
        <footer><button onClick={() => {useHimawari.setState({playing:false});selectWeather(null);useCyclones.setState({enabled:false});}}>{en ? 'Turn weather off' : 'Matikan cuaca'}</button></footer>
      </div>
    </aside>}
  </div>;
}
