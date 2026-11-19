import { scalarFields, type ScalarField } from '../scalarWeather';
import { selectScalar } from '../scalarWeatherStore';
import WeatherThumbnail from './WeatherThumbnail';
import { useEffect, useState } from 'react';
import { Radar, Satellite, Wind, Tornado, X, Settings, Thermometer } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { selectWeather, useOsintWeather } from '../osintWeatherStore';
import { useHimawari } from '../himawariStore';
import { useCyclones } from '../../cyclones/cycloneStore';
import { openWorkspacePanel } from '../../osint/workspaceStore';
import './WeatherRail.css';

type Group = 'rain' | 'clouds' | 'wind' | 'cyclones' | 'temperature';
export default function WeatherRail() {
  const en = useLanguage() === 'en';
  const weather = useOsintWeather();
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
    { id: 'wind' as const, Icon: Wind, label: en ? 'Wind' : 'Angin', active: weather.wind || weather.scalarField === 'gust' || weather.scalarField === 'pressure' },
    { id: 'temperature' as const, Icon: Thermometer, label: en ? 'Temperature' : 'Suhu', active: Boolean(weather.scalarField && !['gust','pressure'].includes(weather.scalarField)) },
    { id: 'cyclones' as const, Icon: Tornado, label: en ? 'Storm tracker' : 'Pelacak badai', active: cyclone.enabled },
  ];
  const current = items.find(i => i.id === (group ?? retainedGroup));
  const choose = (target: Exclude<Group, 'temperature'>, product?: 'auto' | 'visible' | 'ir') => {
    if (target === 'cyclones') useCyclones.setState({ enabled: !cyclone.enabled });
    else { useHimawari.setState({ playing: false, ...(product ? { product } : {}) }); selectWeather(target); }
  };
  const scalarCard = (id: ScalarField) => {
    const spec=scalarFields[id];
    return <button key={id} className="weather-layer-card" aria-pressed={weather.scalarField===id} onClick={()=>selectScalar(id)}>
      <span className="weather-thumbnail scalar-thumbnail" aria-hidden="true"><img src={`/images/weather/${id}${id === 'gust' || id === 'pressure' ? '' : '-data'}.png`} alt="" width={420} height={280} /></span>
      <span><strong>{en?spec.en:spec.id}</strong><small>{id==='surface'?'NASA / 1 km':`GFS / ${spec.unit}`}</small></span>
    </button>;
  };
  return <div className={`weather-rail-shell${group ? ' is-expanded' : ''}`}>
    <nav className="weather-rail" aria-label={en ? 'Weather layers' : 'Layer cuaca'}>
      {items.map(({id, Icon, label, active}) => <button key={id} data-weather-trigger={id === 'clouds' ? '' : undefined} data-wind-trigger={id === 'wind' ? '' : undefined} data-cyclone-trigger={id === 'cyclones' ? '' : undefined} aria-label={label} title={label} aria-pressed={active} aria-expanded={group === id} aria-controls="weather-layer-drawer" onClick={() => setGroup(group === id ? null : id)}><Icon size={16}/></button>)}
    </nav>
    {current && <aside id="weather-layer-drawer" className="weather-layer-drawer" aria-hidden={!group} aria-label={en ? 'Weather catalog' : 'Katalog cuaca'} {...(!group ? { inert: '' } : {})}>
      <header><Satellite size={17}/><strong>{en ? 'Weather layers' : 'Layer cuaca'}</strong><button aria-label={en ? 'Close layer choices' : 'Tutup pilihan layer'} onClick={() => setGroup(null)}><X size={13}/></button></header>
      <div className="weather-layer-choices">
        <p className="weather-preview-note">{en ? 'Layer screenshots (not live)' : 'Cuplikan layer (bukan siaran langsung)'}</p>
        <section className="weather-catalog-group">
          <h3>{en ? 'Current weather' : 'Cuaca sekarang'}<button className="weather-group-settings" aria-label={en ? 'Storm settings' : 'Pengaturan badai'} title={en ? 'Storm settings' : 'Pengaturan badai'} onClick={() => openWorkspacePanel('cyclones')}><Settings size={13}/></button></h3>
          <div className="weather-catalog-grid">
            {(['rain','clouds','cyclones'] as const).map(id => {
              const item = items.find(item => item.id === id)!;
              return <button key={id} className="weather-layer-card" aria-pressed={item.active} onClick={() => choose(id, id === 'clouds' ? 'auto' : undefined)}><WeatherThumbnail kind={id}/><span><strong>{id === 'rain' ? (en ? 'Weather radar' : 'Radar cuaca') : id === 'clouds' ? (en ? 'Satellite ? Auto' : 'Satelit ? Auto') : (en ? 'Storms' : 'Badai')}</strong><small>{id === 'rain' ? 'RainViewer' : id === 'clouds' ? 'Himawari / JMA' : 'JTWC'}</small></span></button>;
            })}
          </div>
          {cyclone.enabled && <p role="status">{cyclone.loading ? (en ? 'Loading storms?' : 'Memuat badai?') : cyclone.error ? (en ? 'Storm source unavailable' : 'Sumber badai belum tersedia') : `${cyclone.items.length} ${en ? 'active tropical systems' : 'sistem tropis aktif'}`}</p>}
        </section>
        <section className="weather-catalog-group">
          <h3><Wind size={13}/><span>{en ? 'Wind' : 'Angin'}</span><button className="weather-group-settings" aria-label={en ? 'Settings Wind' : 'Pengaturan Angin'} onClick={() => openWorkspacePanel('wind')}><Settings size={13}/></button></h3>
          <div className="weather-catalog-grid"><button className="weather-layer-card" aria-pressed={weather.wind && !weather.scalarField} onClick={() => choose('wind')}><WeatherThumbnail kind="wind"/><span><strong>{en ? 'Surface wind' : 'Angin permukaan'}</strong><small>GFS / 10 m</small></span></button>{(['gust','pressure'] as const).map(scalarCard)}</div>
        </section>
        <section className="weather-catalog-group">
          <h3><Thermometer size={13}/><span>{en?'Temperature':'Suhu'}</span></h3>
          <div className="weather-catalog-grid">{(['temperature','dewpoint','humidity','wetbulb','solar','uv','surface'] as const).map(scalarCard)}</div>
        </section>
        <footer><button onClick={() => {useHimawari.setState({playing:false});selectWeather(null);useCyclones.setState({enabled:false});}}>{en ? 'Turn weather off' : 'Matikan cuaca'}</button></footer>
      </div>
    </aside>}
  </div>;
}
