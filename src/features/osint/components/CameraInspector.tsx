import { hasSourceCoordinates, sourceCoordinates } from '../../surveillance/osintSurveillanceStore';
import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Maximize,
  Minimize,
  ExternalLink,
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { useWorkspace } from '../workspaceStore';
import OsintCameraVideo from '../../surveillance/OsintCameraVideo';
import { selectCamera } from './CameraDock';

export default function CameraInspector() {
  const cameras = useCameraCatalog();
  const { selectedId, selectionAttempt, favorites, toggleFavorite } = useWorkspace();
  const source = cameras.find((camera) => camera.id === selectedId);
  const monitor = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === monitor.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!refreshing) return;
    const timer = setTimeout(() => setRefreshing(false), 900);
    return () => clearTimeout(timer);
  }, [refreshing, attempt]);
  const [status, setStatus] = useState('MEMUAT');
  useEffect(() => {
    setStatus('MEMUAT');
    setExpanded(false);
  }, [selectedId]);
  if (!source) return null;
  const locationCameras = cameras.filter(
    (camera) =>
      camera.id === source.id ||
      (hasSourceCoordinates(source)
        ? camera.latitude === source.latitude && camera.longitude === source.longitude
        : camera.provider === source.provider && camera.locationName === source.locationName),
  );
  const live = status === 'LIVE';
  const loading = status === 'MEMUAT' || status === 'BUFFERING' || status === 'MENGHUBUNGKAN ULANG';
  const label = live
    ? 'LIVE'
    : status === 'REKAMAN'
      ? 'RECORDING'
      : status === 'SNAPSHOT'
        ? 'SNAPSHOT'
        : loading
          ? 'CONNECTING'
          : status === 'TEKAN PLAY'
            ? 'PRESS PLAY'
            : 'UNAVAILABLE';
  return (
    <aside
      className={`camera-inspector compact-monitor${expanded ? ' inspector-expanded' : ''}`}
      ref={monitor}
      aria-label="Camera details"
    >
      <section className="command-panel inspector-card">
        <div className="monitor-identity">
          <span title={source.id}>{source.id}</span>
          <span>{sourceCoordinates(source)}</span>
          <span>CCTV</span>
        </div>
        <header className="monitor-header">
          <Camera className="monitor-camera-symbol" size={22} />
          <div className="monitor-title">
            <h2 title={source.name}>{source.name.replace(/^CCTV\s*/, '')}</h2>
            <p title={source.provider || source.locationName}>
              {source.provider || source.locationName || 'Camera Monitor'}
            </p>
          </div>
          <div className="monitor-actions">
            <button
              className={refreshing ? 'monitor-refresh is-refreshing' : 'monitor-refresh'}
              aria-busy={refreshing}
              aria-label="Reconnect camera"
              title="Reconnect camera"
              onClick={() => {
                setRefreshing(true);
                setStatus('MEMUAT');
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw />
            </button>
            <button
              aria-label="Favorite camera"
              title="Favorite camera"
              aria-pressed={favorites.includes(source.id)}
              onClick={() => toggleFavorite(source.id)}
            >
              <Star />
            </button>
            <button
              aria-label="Locate camera"
              title="Locate camera"
              disabled={!hasSourceCoordinates(source)}
              onClick={() => selectCamera(source)}
            >
              <MapPin />
            </button>
            <button
              aria-label="Expand camera"
              title="Expand camera"
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button
              aria-label={fullscreen ? 'Exit camera fullscreen' : 'Fullscreen camera'}
              title={fullscreen ? 'Exit camera fullscreen' : 'Fullscreen camera'}
              aria-pressed={fullscreen}
              onClick={async () => {
                try {
                  setFullscreenError('');
                  if (document.fullscreenElement === monitor.current)
                    await document.exitFullscreen();
                  else await monitor.current?.requestFullscreen();
                } catch {
                  setFullscreenError('Fullscreen tidak tersedia pada browser ini.');
                }
              }}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </button>
            <button
              className="monitor-close"
              aria-label="Close camera"
              title="Close camera"
              onClick={() => useWorkspace.getState().selectCamera(null)}
            >
              <X />
            </button>
          </div>
        </header>
        {locationCameras.length > 1 && (
          <div className="monitor-camera-selector">
            <select
              aria-label="Cameras at this location"
              value={source.id}
              onChange={(event) => {
                const camera = locationCameras.find((item) => item.id === event.target.value);
                if (camera) selectCamera(camera);
              }}
            >
              {locationCameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="inspector-video monitor-feed">
          <OsintCameraVideo
            key={source.id}
            requestToken={
              selectionAttempt || attempt ? `${selectionAttempt}:${attempt}` : undefined
            }
            source={source}
            onStatus={setStatus}
          />
        </div>
        <footer className="monitor-footer">
          <div>
            <small>FEED TYPE</small>
            <strong>{source.streamUrl ? 'HLS' : source.previewUrl ? 'IMAGE' : 'EXTERNAL'}</strong>
          </div>
          <div>
            <small>STATUS</small>
            <strong data-live={live}>{label}</strong>
          </div>
          <a href={source.url} target="_blank" rel="noreferrer" aria-label="Open camera source">
            <ExternalLink size={12} />
            SOURCE
          </a>
        </footer>
        {fullscreenError && (
          <p className="monitor-error" role="status">
            {fullscreenError}
          </p>
        )}
        {loading && <div className="monitor-loading-border" aria-hidden="true" />}
      </section>
    </aside>
  );
}
