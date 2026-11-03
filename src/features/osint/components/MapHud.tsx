import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { Map } from 'maplibre-gl';
import { Maximize, Minus, Navigation2, Plus } from 'lucide-react';
import { useWorkspace } from '../workspaceStore';

export default function MapHud({ map }: { map: Map | null }) {
  const [compassHost, setCompassHost] = useState<HTMLElement | null>(null);
  useEffect(() => setCompassHost(document.getElementById('map-corner-compass')), []);
  const [bearing, setBearing] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const center = map.getCenter();
      useWorkspace.setState({ coordinates: [center.lng, center.lat] });
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
      <div className="map-hud-buttons">
        <button aria-label="Zoom in" onClick={() => map?.zoomIn()}>
          <Plus />
        </button>
        <button aria-label="Zoom out" onClick={() => map?.zoomOut()}>
          <Minus />
        </button>
        <button
          aria-label="Fullscreen workspace"
          onClick={() => {
            const operation = document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen();
            void operation.catch(() => setError('Fullscreen tidak tersedia.'));
          }}
        >
          <Maximize size={18} />
        </button>
      </div>
      {error && <small role="status">{error}</small>}
    </div>
  );
}
