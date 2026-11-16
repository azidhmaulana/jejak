import { Play, Pause } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useOsintWeather } from '../osintWeatherStore';
import { satelliteFrames, satelliteFrame, useHimawari } from '../himawariStore';
import './WeatherDock.css';

export default function WeatherDock() {
  const en = useLanguage() === 'en';
  const weather = useOsintWeather();
  const satellite = useHimawari();
  const active = weather.clouds ? 'clouds' : weather.wind ? 'wind' : weather.rain ? 'rain' : null;
  if (!active) return null;
  const frames = satelliteFrames(satellite);
  const index = satellite.index < 0 ? frames.length - 1 : satellite.index;
  const rainIndex = weather.rainIndex < 0 ? weather.frames.length - 1 : weather.rainIndex;
  const time = active === 'clouds' ? satelliteFrame(satellite)?.time : active === 'wind' ? weather.windValidTime : weather.frames[rainIndex]?.time * 1000;
  const playing = active === 'clouds' ? satellite.playing : weather.playing;
  const count = active === 'clouds' ? frames.length : weather.frames.length;
  return <section className="weather-dock" aria-label={en ? 'Weather layers and timeline' : 'Layer cuaca dan timeline'}>
    <div className="weather-dock-time">
      {active !== 'wind' && <button disabled={count < 2} aria-label={playing ? (en ? 'Pause weather' : 'Jeda cuaca') : (en ? 'Play weather' : 'Putar cuaca')} onClick={() => active === 'clouds' ? useHimawari.setState({ playing: !playing }) : useOsintWeather.setState({ rainTime: true, playing: !playing })}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>}
      <div className="weather-dock-track">
        <output>{time ? new Date(time).toLocaleString(en ? 'en-GB' : 'id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : (en ? 'Loading observations…' : 'Memuat data…')}</output>
        <input aria-label={en ? 'Weather time' : 'Waktu cuaca'} type="range" min={active === 'wind' ? -72 : 0} max={active === 'wind' ? 120 : Math.max(0, count - 1)} step={active === 'wind' ? 3 : 1} disabled={active !== 'wind' && count < 2} value={active === 'wind' ? weather.windHour : Math.max(0, active === 'clouds' ? index : rainIndex)} onChange={e => { const value = Number(e.target.value); if (active === 'clouds') useHimawari.setState({ index: value, playing: false }); else if (active === 'wind') useOsintWeather.setState({ windTime: true, windHour: value }); else useOsintWeather.setState({ rainIndex: value, rainTime: true, playing: false }); }}/>
        <div className="weather-dock-labels"><span>{active === 'wind' ? '-72 h' : en ? 'Earlier' : 'Sebelumnya'}</span><span>{active === 'wind' ? '+120 h · GFS' : active === 'clouds' ? 'Himawari · JMA' : 'RainViewer'}</span></div>
      </div>
    </div>
    {active === 'clouds' && <div className="weather-dock-options">
      {([{ value: 'auto', title: 'Auto' }, { value: 'visible', title: en ? 'Visible' : 'Terlihat' }, { value: 'ir', title: 'Infrared' }] as const).map(item => <button key={item.value} aria-pressed={satellite.product === item.value} onClick={() => useHimawari.setState({ product: item.value })}>{item.title}</button>)}
      <select aria-label={en ? 'Weather animation period' : 'Rentang animasi cuaca'} value={satellite.hours} onChange={e => useHimawari.setState({ hours: Number(e.target.value), index: -1, playing: false })}>{[3,6,12].map(h => <option key={h} value={h}>{h} {en ? 'hours' : 'jam'}</option>)}</select>
    </div>}
    {active === 'clouds' && (satellite.error || satellite.tileError) && <small role="status">{en ? 'Satellite source unavailable. Retry in Weather settings.' : 'Sumber satelit tidak tersedia. Coba lagi di pengaturan Cuaca.'}</small>}
    <small>{en ? 'Overlays remain available: CCTV, earthquakes, hotspots and cyclones.' : 'Overlay tetap tersedia: CCTV, gempa, hotspot dan siklon.'}</small>
  </section>;
}
