import { INDONESIA_BOUNDS, INDONESIA_PADDING } from '../../../modules/maps/defaultView';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { Map, MapMouseEvent } from 'maplibre-gl';
import { Minus, Navigation2, Plus, LocateFixed, Home, Ruler } from 'lucide-react';
import QuickMeasure from './QuickMeasure';
import './MapHudActions.css';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useWorkspace } from '../workspaceStore';

export default function MapHud({ map }: { map: Map | null }) {
  const en = useLanguage() === 'en';
  const [measuring, setMeasuring] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const drawing = useMapTools(state => !['render', 'select'].includes(state.mode));
  const duration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;
  useEffect(() => { if (drawing) setMeasuring(false); }, [drawing]);
  const locate = () => {
    if (!map || locating) return;
    if (!navigator.geolocation) { setLocationError(en ? 'Location is unavailable in this browser.' : 'Lokasi tidak tersedia di browser ini.'); return; }
    setLocationError(''); setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      setLocating(false);
      map.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 14, duration: duration() });
    }, error => {
      setLocating(false);
      setLocationError(error.code === 1 ? (en ? 'Location permission denied. Allow it in your browser settings.' : 'Izin lokasi ditolak. Aktifkan lewat pengaturan browser.') : (en ? 'Could not locate you. Please retry.' : 'Lokasi belum ditemukan. Silakan coba lagi.'));
    }, { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true });
  };
  const [compassHost, setCompassHost] = useState<HTMLElement | null>(null);
  useEffect(() => setCompassHost(document.getElementById('map-corner-compass')), []);
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    if (!map) return;
    let pointerSeen = false, lastCoordinateUpdate = 0;
    const pointer = (event: MapMouseEvent) => {
      pointerSeen = true;
      if (performance.now() - lastCoordinateUpdate < 50) return;
      lastCoordinateUpdate = performance.now();
      useWorkspace.setState({ coordinates: [event.lngLat.wrap().lng, event.lngLat.lat] });
    };
    map.on('mousemove', pointer);
    const update = () => {
      const center = map.getCenter();
      if (!pointerSeen) useWorkspace.setState({ coordinates: [center.lng, center.lat] });
      setBearing(map.getBearing());
    };
    map.on('moveend', update);
    map.on('rotate', update);
    const region = () =>
      map.fitBounds(
        [
          [105.1, -8.0],
          [109.1, -5.8],
        ],
        { padding: 80, duration: 900 },
      );
    window.addEventListener('jejak-region-view', region);
    update();
    return () => {
      map.off('mousemove', pointer);
      map.off('moveend', update);
      map.off('rotate', update);
      window.removeEventListener('jejak-region-view', region);
    };
  }, [map]);
  return (
    <div className="map-hud" aria-label="Map navigation">
      {compassHost &&
        createPortal(
          <button
            className="map-compass"
            aria-label="Reset map north"
            onClick={() => map?.resetNorth()}
          >
            <span>N</span>
            <Navigation2 fill="currentColor" style={{ transform: `rotate(${-bearing}deg)` }} />
          </button>,
          compassHost,
        )}
      {measuring && map && <QuickMeasure map={map} onClose={() => setMeasuring(false)} />}
      {locationError && <div className="map-location-error" role="alert">{locationError}<button aria-label={en ? 'Close location message' : 'Tutup pesan lokasi'} onClick={() => setLocationError('')}>?</button></div>}
      <div className="map-hud-buttons">
        <button title={en ? "Zoom in" : "Perbesar"} aria-label="Zoom in" onClick={() => map?.zoomIn()}>
          <Plus />
        </button>
        <button title={en ? "Zoom out" : "Perkecil"} aria-label="Zoom out" onClick={() => map?.zoomOut()}>
          <Minus />
        </button>
        <button aria-label={en ? 'My location' : 'Lokasi saya'} title={en ? 'My location' : 'Lokasi saya'} disabled={!map || locating} aria-busy={locating} onClick={locate}><LocateFixed /></button>
        <button aria-label={en ? 'Reset to Indonesia' : 'Reset ke Indonesia'} title={en ? 'Reset to Indonesia' : 'Reset ke Indonesia'} disabled={!map} onClick={() => map?.fitBounds(INDONESIA_BOUNDS, { padding: INDONESIA_PADDING, bearing: 0, pitch: 0, duration: duration() })}><Home /></button>
        <button aria-label={en ? 'Measure distance' : 'Ukur jarak'} title={en ? 'Measure distance' : 'Ukur jarak'} aria-pressed={measuring} disabled={!map || drawing} onClick={() => setMeasuring(value => !value)}><Ruler /></button>
      </div>
    </div>
  );
}
