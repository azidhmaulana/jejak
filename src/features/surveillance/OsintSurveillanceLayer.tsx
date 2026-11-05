import { hasSourceCoordinates, sourceCoordinates } from './osintSurveillanceStore';
import { useRoute } from '../routes/routeStore';
import { useActiveBundledCameras } from './cameraSourceState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { Map as MapLibreMap, Marker, LngLat } from 'maplibre-gl';

import {
  X,
  ExternalLink,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Camera,
  Fullscreen,
  Shrink,
} from 'lucide-react';

import {
  useSurveillance,
  cameraAvailability,
  type SurveillanceSource,
} from './osintSurveillanceStore';

import { GRADUATED_SCALE_MAX_WIDTH } from '../../modules/maps/GraduatedScaleControl';

import OsintCameraVideo from './OsintCameraVideo';
import { createCameraMapLayer } from './cameraMapLayer';

export function closeCameraScale(map: MapLibreMap) {
  const { width, height } = map.getCanvas().getBoundingClientRect();

  const meters = map
    .unproject([width / 2 - GRADUATED_SCALE_MAX_WIDTH / 2, height / 2])
    .distanceTo(map.unproject([width / 2 + GRADUATED_SCALE_MAX_WIDTH / 2, height / 2]));

  // The metric scale displays 500 m for distances [500, 1000); at 1000 it displays 1 km.

  return meters > 0 && meters < 1000;
}

export default function OsintSurveillanceLayer({
  map,
  externalPanel = false,
  externalSelectedId,
  onSelect,
}: {
  map: MapLibreMap | null;
  externalPanel?: boolean;
  externalSelectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const routeResult = useRoute((state) => (state.filter ? state.result : null));
  const bandungCameras = useActiveBundledCameras();
  const manual = useSurveillance((s) => s.sources),
    bandung = useSurveillance((s) => s.bandung);

  const sources = useMemo(
    () =>
      (bandung ? [...bandungCameras, ...manual] : manual).filter(
        (source) =>
          !routeResult ||
          source.kind !== 'camera' ||
          routeResult.cameras.some((camera) => camera.id === source.id),
      ),
    [bandung, manual, routeResult, bandungCameras],
  );

  const cameras = useSurveillance((s) => s.cameras),
    news = useSurveillance((s) => s.news),
    previews = useSurveillance((s) => s.previews),
    showOffline = useSurveillance((s) => s.showOffline);

  const [selected, setSelected] = useState<string | null>(null),
    [expanded, setExpanded] = useState(false),
    [revision, setRevision] = useState(0),
    [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    if (externalPanel && externalSelectedId !== undefined) setSelected(externalSelectedId);
  }, [externalPanel, externalSelectedId]);

  useEffect(() => {
    if (!cameras || !bandung || hidden) return;
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch('/api/osint/camera-health', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (response.ok) {
          const data = await response.json();
          if (!stopped && data.health)
            useSurveillance.setState((state) => {
              const health = { ...state.health };
              for (const [id, value] of Object.entries(data.health)) {
                const item = value as {
                  status: 'online' | 'offline' | 'unknown';
                  checkedAt: number;
                  reason: string;
                };
                if (
                  ['online', 'offline', 'unknown'].includes(item.status) &&
                  Number.isFinite(item.checkedAt) &&
                  (!health[id] || item.checkedAt > health[id].checkedAt)
                )
                  health[id] = item;
              }
              return { health };
            });
        }
      } catch {
      } finally {
        if (!stopped) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [cameras, bandung, hidden]);

  const [visiblePreviews, setVisiblePreviews] = useState<
    { source: SurveillanceSource; host: HTMLElement }[]
  >([]);

  const previewSettings = useRef({ previews, hidden, selected, showOffline });
  previewSettings.current = { previews, hidden, selected, showOffline };

  const updatePreviews = useRef<() => void>(() => {});

  useEffect(() => {
    updatePreviews.current();
  }, [previews, hidden, selected, showOffline]);

  const [playback, setPlayback] = useState({ key: '', status: 'MEMUAT' });
  const playbackKey = String(selected) + revision;
  const reportPlayback = useCallback(
    (status: string) => setPlayback({ key: playbackKey, status }),
    [playbackKey],
  );
  const playbackStatus = hidden
    ? 'PAUSED'
    : playback.key === playbackKey
      ? playback.status
      : 'MEMUAT';
  const panel = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const update = () =>
      setFullscreen(Boolean(panel.current && document.fullscreenElement === panel.current));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === panel.current) await document.exitFullscreen();
      else await panel.current?.requestFullscreen();
    } catch {
      setFullscreenError('Fullscreen tidak tersedia di browser ini.');
    }
  };

  const selectedSource = sources.find(
    (s) => s.id === selected && (s.kind === 'camera' ? cameras : news),
  );
  useEffect(() => {
    if (!externalPanel) onSelect?.(selectedSource?.id ?? null);
  }, [selectedSource?.id, onSelect, externalPanel]);

  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);

  useEffect(() => {
    if (!selectedSource) setSelected(null);
  }, [selectedSource]);
  useEffect(() => {
    const select = (event: Event) => {
      const { id, zoom } = (event as CustomEvent<{ id: string; zoom?: number }>).detail || {};
      const source = [...bandungCameras, ...manual].find(
        (item) => item.id === id && item.kind === 'camera',
      );
      if (!source) return;
      useSurveillance.setState({
        cameras: true,
        ...(cameraAvailability(source).status === 'offline' ? { showOffline: true } : {}),
      });
      setSelected(source.id);
      if (map && hasSourceCoordinates(source)) {
        if (zoom !== undefined && Number.isFinite(zoom))
          map.flyTo({
            center: [source.longitude, source.latitude],
            zoom: Math.max(0, Math.min(22, zoom)),
            duration: 1200,
          });
        else
          map.easeTo({
            center: [source.longitude, source.latitude],
            zoom: Math.max(map.getZoom(), 15),
          });
      }
    };
    window.addEventListener('osint-select-camera', select);
    return () => window.removeEventListener('osint-select-camera', select);
  }, [map, bandungCameras, manual]);

  useEffect(() => {
    if (!map) return;

    const list = sources
      .filter(hasSourceCoordinates)
      .filter((s) => (s.kind === 'camera' ? cameras : news));

    const layer = createCameraMapLayer(
      map,
      () =>
        list.filter(
          (source) =>
            previewSettings.current.showOffline || cameraAvailability(source).status !== 'offline',
        ),
      () => previewSettings.current.selected,
      (id) => {
        setSelected(id);
        onSelect?.(id);
      },
    );
    const entries = new Map<
      string,
      { source: SurveillanceSource; host: HTMLElement; marker: Marker }
    >();

    const update = () => {
      const { hidden, previews, selected, showOffline } = previewSettings.current;
      layer.select(selected);

      if (hidden || !previews || !cameras || !closeCameraScale(map)) {
        entries.forEach((entry) => entry.marker.remove());
        entries.clear();
        setVisiblePreviews([]);
        return;
      }

      const center = map.getCenter(),
        locations = new Set<string>();

      // One preview per junction avoids stacking identical-position cameras. Others remain selectable.

      const candidates = list
        .filter(
          (source) =>
            source.kind === 'camera' &&
            (showOffline || cameraAvailability(source).status !== 'offline') &&
            !list.some(
              (other) =>
                other.id === selected &&
                other.latitude === source.latitude &&
                other.longitude === source.longitude,
            ) &&
            (source.streamUrl || source.previewUrl) &&
            map.getBounds().contains([source.longitude, source.latitude]),
        )
        .sort(
          (a, b) =>
            center.distanceTo(new LngLat(a.longitude, a.latitude)) -
            center.distanceTo(new LngLat(b.longitude, b.latitude)),
        )
        .filter((source) => {
          const key = source.latitude + ',' + source.longitude;
          if (locations.has(key)) return false;
          locations.add(key);
          return true;
        })
        .slice(0, 4);
      for (const [id, entry] of entries) {
        if (!candidates.some((source) => source.id === id)) {
          entry.marker.remove();
          entries.delete(id);
        }
      }
      const next = candidates.map((source) => {
        let entry = entries.get(source.id);
        if (!entry) {
          const host = document.createElement('div');
          host.className = 'osint-camera-preview-host';
          const marker = new Marker({ element: host })
            .setLngLat([source.longitude, source.latitude])
            .addTo(map);
          entry = { source, host, marker };
          entries.set(source.id, entry);
        }
        return entry;
      });

      setVisiblePreviews((previous) =>
        previous.length === next.length && previous.every((e, i) => e.host === next[i].host)
          ? previous
          : next,
      );
    };

    const refreshStatus = () => layer.refresh();

    const unsubscribe = useSurveillance.subscribe((s, p) => {
      if (s.health !== p.health) {
        refreshStatus();
        update();
      }
    });

    const healthTimer = setInterval(() => {
      refreshStatus();
      update();
    }, 60000);

    let previousOfflineFilter = previewSettings.current.showOffline;
    updatePreviews.current = () => {
      if (previousOfflineFilter !== previewSettings.current.showOffline) {
        previousOfflineFilter = previewSettings.current.showOffline;
        layer.refresh();
      }
      update();
    };

    update();
    map.on('moveend', update);
    map.on('resize', update);

    return () => {
      updatePreviews.current = () => {};
      unsubscribe();
      clearInterval(healthTimer);
      map.off('moveend', update);
      map.off('resize', update);
      entries.forEach((e) => e.marker.remove());
      layer.destroy();
    };
  }, [map, sources, cameras, news]);

  return (
    <>
      {visiblePreviews.map(({ source, host }) =>
        createPortal(
          <div
            className="osint-camera-mini corner-frame"
            onClick={() => {
              setSelected(source.id);
              onSelect?.(source.id);
            }}
          >
            <OsintCameraVideo source={source} compact />
            <button aria-label={'Open ' + source.name}>
              <i className="osint-preview-online-dot" aria-hidden="true" />
              {source.name}
            </button>
          </div>,
          host,
          source.id,
        ),
      )}

      {selectedSource && !externalPanel && (
        <section
          ref={panel}
          className={'osint-camera-player corner-frame' + (expanded ? ' is-expanded' : '')}
          aria-label="Camera stream panel"
        >
          <div className="osint-camera-meta">
            <span>{selectedSource.id}</span>
            <span>{sourceCoordinates(selectedSource, 5)}</span>
          </div>

          <header>
            <Camera size={17} />
            <div>
              <strong>{selectedSource.name}</strong>
              <small>
                {selectedSource.locationName || 'OSINT CAMERA'} ·{' '}
                {selectedSource.provider ||
                  (selectedSource.id.startsWith('bandung-atcs-')
                    ? 'ATCS BANDUNG'
                    : selectedSource.id.startsWith('bandung-pelindung-')
                      ? 'PELINDUNG / DIREKTORI PUBLIK'
                      : 'CUSTOM SOURCE')}
              </small>
            </div>
            <button
              title="Refresh stream"
              aria-label="Refresh stream"
              onClick={() => setRevision(revision + 1)}
            >
              <RotateCcw />
            </button>
            <button
              title="Locate camera"
              aria-label="Locate camera"
              onClick={() =>
                hasSourceCoordinates(selectedSource) &&
                map?.easeTo({
                  center: [selectedSource.longitude, selectedSource.latitude],
                  zoom: Math.max(map.getZoom(), 15),
                })
              }
            >
              <MapPin />
            </button>
            <button
              title="Expand stream"
              aria-label="Expand stream"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen stream'}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen stream'}
              aria-pressed={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Shrink /> : <Fullscreen />}
            </button>
            <button
              title="Close stream"
              aria-label="Close stream"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
          </header>

          {sources.filter(
            (s) =>
              s.latitude === selectedSource.latitude &&
              s.longitude === selectedSource.longitude &&
              s.kind === selectedSource.kind,
          ).length > 1 && (
            <select
              className="osint-camera-channel"
              aria-label="Camera at this location"
              value={selectedSource.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {sources
                .filter(
                  (s) =>
                    s.latitude === selectedSource.latitude &&
                    s.longitude === selectedSource.longitude &&
                    s.kind === selectedSource.kind,
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}

          {hidden ? (
            <p>Stream dijeda saat tab tidak terlihat.</p>
          ) : (
            <OsintCameraVideo
              key={selectedSource.id + revision}
              source={selectedSource}
              onStatus={reportPlayback}
            />
          )}

          {fullscreenError && <p role="status">{fullscreenError}</p>}
          <div className="osint-camera-scan" aria-hidden="true" />
          <footer>
            <div className="osint-feed-detail">
              <small>FEED TYPE</small>
              <span>
                {selectedSource.streamUrl ? 'HLS' : selectedSource.previewUrl ? 'SNAPSHOT' : 'LINK'}
              </span>
            </div>
            <div
              className="osint-feed-detail osint-feed-state"
              data-active={playbackStatus === 'LIVE'}
            >
              <small>STATUS</small>
              <span>{playbackStatus === 'LIVE' ? 'ACTIVE / LIVE' : playbackStatus}</span>
            </div>
            <a href={selectedSource.url} target="_blank" rel="noreferrer">
              <ExternalLink size={12} />
              SUMBER
            </a>
          </footer>
        </section>
      )}
    </>
  );
}
