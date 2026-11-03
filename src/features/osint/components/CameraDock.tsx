import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Grid2X2,
  MapPin,
  Radio,
  Star,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { useWorkspace } from '../workspaceStore';
import {
  cameraAvailability,
  useSurveillance,
  type SurveillanceSource,
} from '../../surveillance/osintSurveillanceStore';
import OsintCameraVideo from '../../surveillance/OsintCameraVideo';

export function selectCamera(source: SurveillanceSource) {
  useWorkspace.getState().selectCamera(source.id);
  useSurveillance.setState({ cameras: true });
  window.dispatchEvent(new CustomEvent('osint-select-camera', { detail: { id: source.id } }));
}
export function CameraThumbnail({
  source,
  live = false,
}: {
  source: SurveillanceSource;
  live?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="camera-thumbnail" ref={host}>
      {live && visible ? (
        <OsintCameraVideo source={source} compact />
      ) : source.previewUrl ? (
        <img
          src={source.previewUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <div className="thumbnail-grid" />
      <Camera size={24} />
      <span className="thumbnail-coordinates">
        {source.latitude.toFixed(4)} / {source.longitude.toFixed(4)}
      </span>
      <small>SELECT TO CONNECT</small>
    </div>
  );
}
export default function CameraDock() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('jejak-camera-dock-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  function setExpanded(expanded: boolean) {
    setCollapsed(!expanded);
    try {
      localStorage.setItem('jejak-camera-dock-collapsed', String(!expanded));
    } catch {
      /* Keep the current session usable. */
    }
  }
  const cameras = useCameraCatalog();
  const { cameraTab, favorites, recent, coordinates, selectedId, query } = useWorkspace();
  useSurveillance((state) => state.health);
  const previews = useSurveillance((state) => state.previews);
  const track = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    let result = cameras.filter((camera) =>
      `${camera.name} ${camera.locationName || ''} ${camera.provider || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    if (cameraTab === 'favorites')
      result = result.filter((camera) => favorites.includes(camera.id));
    if (cameraTab === 'recent')
      result = result
        .filter((camera) => recent.includes(camera.id))
        .sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    if (cameraTab === 'nearby')
      result.sort(
        (a, b) =>
          (a.longitude - coordinates[0]) ** 2 +
          (a.latitude - coordinates[1]) ** 2 -
          (b.longitude - coordinates[0]) ** 2 -
          (b.latitude - coordinates[1]) ** 2,
      );
    return result;
  }, [cameras, cameraTab, favorites, recent, coordinates, query]);
  const tabs = [
    { id: 'all', label: 'Cameras', icon: Radio },
    { id: 'nearby', label: 'Nearby', icon: MapPin },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'recent', label: 'Recent', icon: Clock3 },
  ] as const;
  const livePreviews = list
    .filter((camera) => cameraAvailability(camera).status === 'online')
    .slice(0, 3)
    .map((camera) => camera.id);
  return (
    <section
      className="camera-dock command-panel"
      data-collapsed={collapsed}
      aria-label="Camera catalog"
    >
      <header className="camera-dock-heading">
        <div role="tablist" aria-label="Camera lists">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={cameraTab === id}
              onClick={() => {
                useWorkspace.setState({ cameraTab: id });
                setExpanded(true);
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <span className="dock-count">
          {list.length} cameras <Grid2X2 size={15} />
        </span>
        <button
          className="dock-toggle"
          aria-label={collapsed ? 'Show camera panel' : 'Hide camera panel'}
          aria-expanded={!collapsed}
          aria-controls="camera-dock-content"
          onClick={() => setExpanded(collapsed)}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </header>
      <div
        className="camera-dock-collapse"
        aria-hidden={collapsed}
        ref={(element) => {
          if (element) element.inert = collapsed;
        }}
      >
        <div className="camera-dock-body" id="camera-dock-content">
          <button
            className="dock-scroll"
            aria-label="Previous cameras"
            onClick={() => track.current?.scrollBy({ left: -600, behavior: 'smooth' })}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="camera-track" ref={track}>
            {list.map((camera) => (
              <button
                className="camera-card"
                key={camera.id}
                aria-label={'View ' + camera.name}
                aria-pressed={selectedId === camera.id}
                onClick={() => selectCamera(camera)}
              >
                <CameraThumbnail
                  source={camera}
                  live={
                    previews &&
                    !collapsed &&
                    livePreviews.includes(camera.id) &&
                    camera.id !== selectedId
                  }
                />
                <span className="camera-card-label">
                  <i className="feed-dot" data-status={cameraAvailability(camera).status} />
                  <span>{camera.name.replace(/^CCTV\s*|^VID\s*/g, '')}</span>
                  {favorites.includes(camera.id) && <Star size={10} />}
                </span>
              </button>
            ))}
            {!list.length && (
              <div className="camera-dock-empty">
                <Camera size={22} />
                <span>
                  {cameraTab === 'favorites'
                    ? 'Belum ada favorit. Pilih kamera lalu tekan ikon bintang.'
                    : cameraTab === 'recent'
                      ? 'Kamera yang dibuka akan muncul di sini.'
                      : 'Tidak ada kamera yang cocok dengan pencarian.'}
                </span>
              </div>
            )}
          </div>
          <button
            className="dock-scroll"
            aria-label="Next cameras"
            onClick={() => track.current?.scrollBy({ left: 600, behavior: 'smooth' })}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}
