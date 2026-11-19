import { useEffect, useState, type CSSProperties } from 'react';
import { Play, Pause, Zap } from 'lucide-react';
import Toggle from '../../../shared/components/Toggle';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useOsintWeather } from '../osintWeatherStore';
import { satelliteFrames, satelliteFrame, useHimawari } from '../himawariStore';
import './WeatherDock.css';

export default function WeatherDock() {
  const en = useLanguage() === 'en';
  const weather = useOsintWeather();
  const satellite = useHimawari();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const active = weather.clouds ? 'clouds' : weather.wind ? 'wind' : weather.rain ? 'rain' : null;
  if (!active || weather.scalarField) return null;
  const frames = satelliteFrames(satellite);
  const index = satellite.index < 0 ? frames.length - 1 : Math.min(satellite.index, frames.length - 1);
  const rainIndex = weather.rainIndex < 0 ? weather.frames.length - 1 : Math.min(weather.rainIndex, weather.frames.length - 1);
  const time = active === 'clouds' ? satelliteFrame(satellite)?.time : active === 'wind' ? weather.windValidTime : weather.frames[rainIndex]?.time * 1000;
  const playing = active === 'clouds' ? satellite.playing : weather.playing;
  const count = active === 'clouds' ? frames.length : weather.frames.length;
  const first = active === 'clouds' ? frames[0]?.time : weather.frames[0]?.time * 1000;
  const clock = (value: number) => new Date(value).toLocaleTimeString(en ? 'en-GB' : 'id-ID', {hour:'2-digit',minute:'2-digit'});
  const progress = active === 'wind' ? (weather.windHour + 72) / 192 * 100 : Math.max(0, active === 'clouds' ? index : rainIndex) / Math.max(1, count - 1) * 100;
  const points = [0, 1/3, 2/3, 1].map(fraction => {
    if (active === 'wind') return `${Math.round(-72 + fraction * 192)} h`;
    const frameIndex = Math.round(fraction * Math.max(0, count - 1));
    const timestamp = active === 'clouds' ? frames[frameIndex]?.time : weather.frames[frameIndex]?.time * 1000;
    if (!timestamp || !first) return '?';
    const minutes = Math.max(0, Math.round((now - timestamp) / 60000));
    return minutes >= 60 ? `${Math.round(minutes / 60)} ${en ? 'h ago' : 'jam lalu'}` : `${minutes} ${en ? 'min ago' : 'menit lalu'}`;
  });
  const radarAvailable = Boolean(time && weather.frames.some(f => Math.abs(f.time * 1000 - time) <= 600000));
  const loading = (active === 'wind' && weather.windLoading) || (active === 'clouds' && (satellite.loading || satellite.fetching))
    || ((active === 'rain' || (active === 'clouds' && weather.radarOverlay)) && (weather.radarLoading || weather.status.rain.startsWith('Memuat')));
  return <section className="weather-dock" aria-label={en ? 'Weather layers and timeline' : 'Layer cuaca dan timeline'}>
    {loading && <div className="weather-dock-loading" role="status" aria-label={en ? 'Loading weather imagery' : 'Memuat gambar cuaca'}>
      {[0, 1, 2, 3, 4].map(index => <span key={index} className="weather-loading-dot" aria-hidden="true" style={{'--dot-index': index} as CSSProperties} />)}
    </div>}
    {active === 'clouds' && satellite.loading && satellite.displayed && <small className="weather-loading-caption">{en ? 'Showing previous image while updating' : 'Menampilkan gambar sebelumnya sambil memperbarui'}</small>}
    <div className="weather-dock-time">
      {active !== 'wind' && <button className="weather-player-play" disabled={count < 2} aria-label={playing ? (en ? 'Pause weather' : 'Jeda cuaca') : (en ? 'Play weather' : 'Putar cuaca')} onClick={() => active === 'clouds' ? useHimawari.setState({ playing: !playing }) : useOsintWeather.setState({ rainTime: true, playing: !playing })}>{playing ? <Pause size={18}/> : <Play size={20} fill="currentColor"/>}</button>}
      <div className="weather-dock-track" style={{ '--weather-progress': `${progress}%` } as CSSProperties}>
        <output>{time ? `${clock(time)} · ${Math.max(0, Math.round((now - time)/60000))} ${en ? 'min ago' : 'menit lalu'}` : (en ? 'Loading data…' : 'Memuat data…')}</output>
        <div className="weather-timeline-ticks" aria-hidden="true">{points.map((_, i) => <i key={i} style={{left:`${i / 3 * 100}%`}} />)}</div>
        <input aria-label={en ? 'Weather time' : 'Waktu cuaca'} type="range" min={active === 'wind' ? -72 : 0} max={active === 'wind' ? 120 : Math.max(0, count - 1)} step={active === 'wind' ? 3 : 1} disabled={active !== 'wind' && count < 2} value={active === 'wind' ? weather.windHour : Math.max(0, active === 'clouds' ? index : rainIndex)} onChange={e => { const value = Number(e.target.value); if (active === 'clouds') useHimawari.setState({ index: value, playing: false }); else if (active === 'wind') useOsintWeather.setState({ windTime: true, windHour: value }); else useOsintWeather.setState({ rainIndex: value, rainTime: true, playing: false }); }}/>
        <div className="weather-dock-labels">{points.map((label,i) => <span key={i}>{label}</span>)}</div>
      </div>
    </div>
    {active !== 'wind' && <div className="weather-player-controls">
      <label><Toggle aria-label={en ? 'Radar overlay' : 'Overlay radar'} checked={active === 'rain' || weather.radarOverlay} onChange={() => active === 'clouds' ? useOsintWeather.setState({radarOverlay:!weather.radarOverlay}) : useOsintWeather.setState({rain:false,playing:false})}/><span>{en ? 'Radar overlay' : 'Overlay radar'}</span></label>
      <label className="weather-player-colors">
        <Toggle aria-label="Infra" checked={satellite.product === 'enhanced'} disabled={active !== 'clouds'} onChange={() => useHimawari.setState({product: satellite.product === 'enhanced' ? 'blue' : 'enhanced'})}/>
        <span>Infra</span>
      </label>
      <label title={en ? 'Lightning data source is not connected' : 'Sumber data petir belum terhubung'}><Zap size={12}/><Toggle aria-label={en ? 'Lightning (unavailable)' : 'Petir (belum tersedia)'} checked={false} disabled/><span>{en ? 'Lightning' : 'Petir'}</span></label>
    </div>}
    {active === 'clouds' && weather.radarOverlay && !radarAvailable && <small role="status">{en ? 'No radar frame for this time.' : 'Tidak ada frame radar untuk waktu ini.'}</small>}
    {active === 'clouds' && (satellite.error || satellite.tileError) && <small role="status">{en ? 'Satellite source unavailable.' : 'Sumber satelit tidak tersedia.'}</small>}
  </section>;
}
