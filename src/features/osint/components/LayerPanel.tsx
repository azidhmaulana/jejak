import {
  Camera,
  ChevronUp,
  Cloud,
  Eye,
  FolderOpen,
  Image,
  Layers,
  Route,
  Search,
  Settings2,
  Waves,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { useOsintWeather, toggleWeather } from '../../weather/osintWeatherStore';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useOverlays } from '../../../modules/overlays/imageOverlayStore';
import BmsObjectsPanel from '../../../modules/drawing/BmsObjectsPanel';
import OsintWeatherPanel from '../../weather/components/OsintWeatherPanel';
import SurveillanceSettings from './SurveillanceSettings';
import DrawingStyleFields from '../../../modules/drawing/DrawingStyleFields';
import { useWorkspace } from '../workspaceStore';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { cameraAvailability } from '../../surveillance/osintSurveillanceStore';
import WorkspaceAppearance from './WorkspaceAppearance';
import SpacePanel from '../../space/SpacePanel';

function LayerToggle({
  icon: Icon,
  label,
  checked,
  onChange,
  count,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onChange: () => void;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <label className="layer-toggle">
      <Icon size={18} />
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="toggle-track" />
      {count !== undefined && <small>{count}</small>}
    </label>
  );
}
const titles = {
  layers: 'Layers & Filters',
  objects: 'Objects & Groups',
  weather: 'Weather Layers',
  sources: 'Camera Sources',
  settings: 'Workspace Settings',
  analytics: 'Coverage Overview',
  alerts: 'Feed Alerts',
};
export default function LayerPanel() {
  const { panel, query, roads, roadsAvailable } = useWorkspace();
  const surveillance = useSurveillance();
  const weather = useOsintWeather();
  const drawings = useMapTools();
  const overlays = useOverlays();
  const cameras = useCameraCatalog();
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const wasSpace = useWorkspace.getState().panel === 'space';
      useWorkspace.setState({ panel: null });
      if (wasSpace) {
        document.querySelector<HTMLButtonElement>('[data-space-trigger]')?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  if (!panel) return null;
  if (panel === 'space') return <SpacePanel />;
  return (
    <aside className="command-panel layer-panel" data-panel={panel} aria-label={titles[panel]}>
      {panel !== 'sources' && (
        <header className="panel-heading">
          <Layers size={19} />
          <h2>{titles[panel]}</h2>
          <button
            aria-label="Close layer panel"
            onClick={() => useWorkspace.setState({ panel: null })}
          >
            {panel === 'layers' ? <ChevronUp size={17} /> : <X size={17} />}
          </button>
        </header>
      )}
      <div className="layer-panel-content">
        {panel === 'layers' && (
          <>
            <div className="panel-section-label">SURVEILLANCE</div>
            <LayerToggle
              icon={Camera}
              label="CCTV Cameras"
              count={cameras.length}
              checked={surveillance.cameras}
              onChange={() => useSurveillance.setState({ cameras: !surveillance.cameras })}
            />
            <LayerToggle
              icon={Eye}
              label="Camera Previews"
              checked={surveillance.previews}
              onChange={() => useSurveillance.setState({ previews: !surveillance.previews })}
            />
            <LayerToggle
              icon={Camera}
              label="Show Offline Cameras"
              checked={surveillance.showOffline}
              onChange={() => useSurveillance.setState({ showOffline: !surveillance.showOffline })}
            />
            <div className="layer-divider" />
            <div className="panel-section-label">MAP LAYERS</div>
            {roadsAvailable !== false && (
              <LayerToggle
                icon={Route}
                label="Road Network"
                checked={roads}
                onChange={() => useWorkspace.setState({ roads: !roads })}
              />
            )}
            <LayerToggle
              icon={FolderOpen}
              label="Drawing Objects"
              count={drawings.features.length}
              checked={drawings.drawingsVisible}
              onChange={() => useMapTools.setState({ drawingsVisible: !drawings.drawingsVisible })}
            />
            <LayerToggle
              icon={Image}
              label="Image Overlays"
              disabled={overlays.items.length === 0}
              count={overlays.items.length}
              checked={overlays.items.length > overlays.hidden.length}
              onChange={() =>
                useOverlays.setState({
                  hidden: overlays.hidden.length ? [] : overlays.items.map((item) => item.id),
                })
              }
            />
            <LayerToggle
              icon={Cloud}
              label="Cloud Cover"
              checked={weather.clouds}
              onChange={() => toggleWeather('clouds')}
            />
            <LayerToggle
              icon={Wind}
              label="Wind Field"
              checked={weather.wind}
              onChange={() => toggleWeather('wind')}
            />
            <LayerToggle
              icon={Waves}
              label="Rain Radar"
              checked={weather.rain}
              onChange={() => toggleWeather('rain')}
            />
            <div className="layer-search">
              <Search size={16} />
              <input
                id="camera-search"
                aria-label="Search camera catalog"
                placeholder="Search cameras, locations…"
                value={query}
                onChange={(event) =>
                  useWorkspace.setState({ query: event.target.value, cameraTab: 'all' })
                }
              />
              <Settings2 size={15} />
            </div>
            {query && (
              <small className="panel-note">Hasil ditampilkan pada daftar kamera di bawah.</small>
            )}
          </>
        )}
        {panel === 'objects' && (
          <div className="osint-map-objects">
            <BmsObjectsPanel />
          </div>
        )}
        {panel === 'weather' && <OsintWeatherPanel />}
        {panel === 'sources' && <SurveillanceSettings />}
        {panel === 'settings' && (
          <>
            <WorkspaceAppearance />
            <div className="panel-section-label">DRAWING APPEARANCE</div>
            <DrawingStyleFields />
            <div className="layer-divider" />
            <p className="panel-note">
              Provider, jenis peta, dan API key tersedia pada kontrol peta di bagian bawah. Pilihan
              disimpan pada browser ini.
            </p>
            <button
              className="panel-action"
              onClick={() => useWorkspace.setState({ panel: 'sources' })}
            >
              Configure camera sources
            </button>
          </>
        )}
        {panel === 'analytics' && (
          <>
            <div className="coverage-total">
              <strong>{cameras.length}</strong>
              <span>REGISTERED CAMERAS</span>
            </div>
            {(['online', 'offline', 'unknown'] as const).map((status) => {
              const count = cameras.filter(
                (camera) => cameraAvailability(camera).status === status,
              ).length;
              return (
                <div className="coverage-row" key={status}>
                  <span>{status === 'unknown' ? 'Unverified' : status}</span>
                  <b>{count}</b>
                  <progress value={count} max={Math.max(cameras.length, 1)} />
                </div>
              );
            })}
            <p className="panel-note">
              Status berasal dari health check stream. Kamera tanpa verifikasi tidak dihitung
              sebagai online.
            </p>
          </>
        )}
        {panel === 'alerts' && (
          <>
            <div className="panel-section-label">CAMERA AVAILABILITY</div>
            {cameras
              .filter((camera) => cameraAvailability(camera).status === 'offline')
              .slice(0, 20)
              .map((camera) => (
                <button
                  className="feed-alert-row"
                  key={camera.id}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('osint-select-camera', { detail: { id: camera.id } }),
                    )
                  }
                >
                  <Camera size={17} />
                  <span>
                    {camera.name}
                    <small>{cameraAvailability(camera).reason}</small>
                  </span>
                </button>
              ))}
            {!cameras.some((camera) => cameraAvailability(camera).status === 'offline') && (
              <p className="panel-note">
                Belum ada gangguan feed terkonfirmasi. Pemeriksaan berjalan saat layer CCTV aktif.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
