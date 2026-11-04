import { hasSourceCoordinates } from '../../surveillance/osintSurveillanceStore';
import { useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Layers, Settings2, Star, Bell } from 'lucide-react';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { useWorkspace } from '../workspaceStore';
import { cameraAvailability, useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { CameraThumbnail, selectCamera } from './CameraDock';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useOsintWeather } from '../../weather/osintWeatherStore';
import { useOverlays } from '../../../modules/overlays/imageOverlayStore';

export default function NearbyCameras() {
  const cameras = useCameraCatalog();
  const { query, coordinates, favorites, toggleFavorite, selectedId, roads, roadsAvailable } =
    useWorkspace();
  const surveillance = useSurveillance();
  const weather = useOsintWeather();
  const drawings = useMapTools((s) => s.drawingsVisible);
  const overlays = useOverlays((s) => s.items.length > s.hidden.length);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'all' | 'online' | 'favorites'>('all');
  const list = useMemo(
    () =>
      cameras
        .filter(hasSourceCoordinates)
        .filter((c) =>
          `${c.name} ${c.locationName || ''} ${c.provider || ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .filter((c) =>
          tab === 'favorites'
            ? favorites.includes(c.id)
            : tab === 'online'
              ? cameraAvailability(c).status === 'online'
              : true,
        )
        .sort(
          (a, b) =>
            (a.longitude - coordinates[0]) ** 2 +
            (a.latitude - coordinates[1]) ** 2 -
            (b.longitude - coordinates[0]) ** 2 -
            (b.latitude - coordinates[1]) ** 2,
        ),
    [cameras, query, tab, favorites, coordinates, surveillance.health],
  );
  const online = cameras.filter((c) => cameraAvailability(c).status === 'online').length;
  const offline = cameras.filter((c) => cameraAvailability(c).status === 'offline').length;
  const layers =
    Number(surveillance.cameras) +
    Number(drawings) +
    Number(overlays) +
    Number(weather.clouds) +
    Number(weather.rain) +
    Number(weather.wind) +
    Number(roads && roadsAvailable);
  return (
    <div className="nearby-column" data-collapsed={collapsed}>
      <section className="nearby-panel">
        <header>
          <i className="green-ring" />
          <h2>Kamera Terdekat</h2>
          <span className="nearby-count">{list.length}</span>
          <button
            aria-label={collapsed ? 'Show nearby cameras' : 'Hide nearby cameras'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </header>
        {!collapsed && (
          <>
            <div className="nearby-tabs">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'online', label: 'Online' },
                  { id: 'favorites', label: 'Favorit' },
                ] as const
              ).map((t) => (
                <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
              <button
                aria-label="Camera settings"
                onClick={() => useWorkspace.setState({ panel: 'sources' })}
              >
                <Settings2 size={15} />
              </button>
            </div>
            <div className="nearby-list">
              {list.slice(0, 30).map((c) => (
                <article key={c.id} data-selected={selectedId === c.id}>
                  <button className="nearby-camera" onClick={() => selectCamera(c)}>
                    <CameraThumbnail source={c} />
                    <span>
                      <strong>{c.name.replace(/^CCTV\s*/, '')}</strong>
                      <small>{c.locationName || c.provider || 'Bandung'}</small>
                      <em data-status={cameraAvailability(c).status}>
                        <i className="feed-dot" data-status={cameraAvailability(c).status} />
                        {cameraAvailability(c).status === 'unknown'
                          ? 'Belum diverifikasi'
                          : cameraAvailability(c).status}
                      </em>
                    </span>
                  </button>
                  <button
                    className="nearby-favorite"
                    aria-label={'Favorite ' + c.name}
                    aria-pressed={favorites.includes(c.id)}
                    onClick={() => toggleFavorite(c.id)}
                  >
                    <Star size={16} />
                  </button>
                </article>
              ))}
              {!list.length && <p className="nearby-empty">Tidak ada kamera yang cocok.</p>}
            </div>
            <button
              className="nearby-all"
              onClick={() => {
                useWorkspace.setState({ cameraTab: 'all' });
                document.querySelector<HTMLButtonElement>('.camera-dock [role="tab"]')?.click();
              }}
            >
              Lihat semua kamera <ChevronRight size={13} />
            </button>
          </>
        )}
      </section>
      {!collapsed && (
        <section className="jejak-system">
          <h2>
            <i className="green-ring" />
            Status Sistem
          </h2>
          <div>
            <Camera size={15} /> CCTV{' '}
            <strong>
              {online} / {cameras.length}
            </strong>
          </div>
          <div>
            <Layers size={15} /> Layer Aktif <strong>{layers}</strong>
          </div>
          <button onClick={() => useWorkspace.setState({ panel: 'alerts' })}>
            <Bell size={15} /> Feed offline <strong>{offline}</strong>
          </button>
        </section>
      )}
    </div>
  );
}
