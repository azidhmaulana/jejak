import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useWorkspace } from '../workspaceStore';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useOverlays } from '../../../modules/overlays/imageOverlayStore';
import { useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { useEarthquakes } from '../../earthquakes/earthquakeStore';
import { toggleWeather, useOsintWeather } from '../../weather/osintWeatherStore';
import './LayerSwitches.css';

export default function LayerSwitches() {
  const en = useLanguage() === 'en';
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cameras = useSurveillance(s => s.cameras);
  const earthquakes = useEarthquakes(s => s.enabled);
  const drawings = useMapTools(s => s.drawingsVisible);
  const overlays = useOverlays();
  const weather = useOsintWeather();
  const roads = useWorkspace(s => s.roads), roadsAvailable = useWorkspace(s => s.roadsAvailable);
  const imageVisible = overlays.items.some(item => !overlays.hidden.includes(item.id));
  const entries = [
    { id: 'cameras', label: 'CCTV', checked: cameras, toggle: () => useSurveillance.setState({ cameras: !cameras }) },
    { id: 'earthquakes', label: en ? 'Earthquakes' : 'Gempa bumi', checked: earthquakes, toggle: () => useEarthquakes.setState({ enabled: !earthquakes }) },
    { id: 'drawings', label: en ? 'Drawing objects' : 'Objek gambar', checked: drawings, toggle: () => useMapTools.setState({ drawingsVisible: !drawings }) },
    { id: 'images', label: en ? 'Image overlays' : 'Overlay gambar', checked: imageVisible, disabled: !overlays.items.length, toggle: () => useOverlays.setState({ hidden: imageVisible ? overlays.items.map(item => item.id) : [] }) },
    { id: 'roads', label: en ? 'Roads' : 'Jalan', checked: Boolean(roads && roadsAvailable), disabled: !roadsAvailable, toggle: () => useWorkspace.setState({ roads: !roads }) },
    ...(['clouds', 'wind', 'rain'] as const).map((key, index) => ({ id: key, label: (en ? ['Clouds', 'Wind', 'Rain'] : ['Awan', 'Angin', 'Hujan'])[index], checked: weather[key], toggle: () => toggleWeather(key) })),
  ];
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return <div ref={root} className="footer-layers" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.footer-layer-trigger')?.focus(); } }}>
    <button className="footer-layer-trigger" aria-label={en ? 'Map layers' : 'Layer peta'} aria-expanded={open} aria-controls="footer-layer-list" onClick={() => setOpen(!open)}>LAYER <b>{entries.filter(item => item.checked).length}</b></button>
    <section id="footer-layer-list" className="footer-layer-list" data-open={open} aria-hidden={!open} aria-label={en ? 'Map layers' : 'Layer peta'}>
      <header><strong>{en ? 'Map layers' : 'Layer peta'}</strong><button aria-label={en ? 'Close layers' : 'Tutup layer'} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}><X size={12} /></button></header>
      {entries.map(item => <label key={item.id}><span>{item.label}</span><input type="checkbox" role="switch" tabIndex={open ? 0 : -1} checked={item.checked} disabled={item.disabled} onChange={item.toggle} /></label>)}
      <small>{en ? 'Unavailable layers are disabled.' : 'Layer yang belum tersedia dinonaktifkan.'}</small>
    </section>
  </div>;
}
