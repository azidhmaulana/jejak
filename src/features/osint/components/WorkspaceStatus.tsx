import { useEffect, useState } from 'react';
import { useWorkspace } from '../workspaceStore';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { useOsintWeather } from '../../weather/osintWeatherStore';
import { useOverlays } from '../../../modules/overlays/imageOverlayStore';
export default function WorkspaceStatus() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { coordinates, roads, roadsAvailable } = useWorkspace();
  const { syncStatus, features, drawingsVisible } = useMapTools();
  const cameras = useCameraCatalog();
  const surveillance = useSurveillance();
  const weather = useOsintWeather();
  const overlays = useOverlays();
  const layers =
    Number(surveillance.cameras) +
    Number(drawingsVisible) +
    Number(overlays.items.length > overlays.hidden.length) +
    Number(weather.clouds) +
    Number(weather.wind) +
    Number(weather.rain) +
    Number(roads && roadsAvailable);
  return (
    <footer className="workspace-status tactical-status">
      <span>
        <b>ZULU</b> {now.toISOString().slice(11, 19)}Z
      </span>
      <span>
        LAYER <b>{layers}</b>
      </span>
      <span>
        ENTITIES <b>{cameras.length + features.length}</b>
      </span>
      <span className="tactical-sync">
        SYNC <b>{syncStatus.toUpperCase()}</b>
      </span>
      <span className="tactical-version">
        <a href="/tentang.html" style={{ color: 'inherit' }}>
          JEJAK V1.0
        </a>
      </span>
      <div className="tactical-status-accent" aria-hidden="true">
        <svg viewBox="0 0 300 32" preserveAspectRatio="none">
          <path d="M0 1 H12 Q20 1 26 8 L42 24 Q46 28 55 28 H245 Q254 28 258 24 L274 8 Q280 1 288 1 H300" />
        </svg>
        <i />
      </div>
      <span className="status-coordinates">
        {coordinates[1].toFixed(4)}, {coordinates[0].toFixed(4)}
      </span>
      <span className="tactical-region">INDONESIA</span>
      <span className="tactical-local">
        <i />
        LOCAL WORKSPACE
      </span>
    </footer>
  );
}
