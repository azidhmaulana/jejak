import ImageOverlayLayer from '../overlays/ImageOverlayLayer';
import OfflineAreaSelection from './OfflineAreaSelection';
import { useOfflineSelection } from './offlineSelectionStore';
import { offlineProviderFor } from './mapProviders';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { EMPTY_MAP_STYLE, getMapProvider, mapProviders } from './mapProviders';
import { useMapKeys } from './useMapKeys';
import { useOnlineMap, useGoogleCopyright } from './useOnlineMap';
import { t } from '../../shared/i18n/runtime.js';
import { useLanguage } from '../../shared/i18n/useLanguage';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createDrawingController } from '../drawing/drawingController';
import { useMapTools } from '../drawing/mapToolsStore';
import BmsDrawingHint from '../drawing/BmsDrawingHint';
import MapNavbar from './MapNavbar';
import '../drawing/MapTools.css';
import { useOfflineMap } from './useOfflineMap';
import { useMapPreferences } from './useMapPreferences';

maplibregl.setWorkerUrl(mapWorkerUrl);

export default function MapCanvas({
  active = true,
  children,
}: {
  active?: boolean;
  children?: (map: maplibregl.Map | null) => ReactNode;
}) {
  const selectingOffline = useOfflineSelection((state) => state.active);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const drawing = useRef<ReturnType<typeof createDrawingController> | null>(null);
  const previousStyle = useRef<maplibregl.StyleSpecification | string>(EMPTY_MAP_STYLE);
  useLanguage();
  const {
    mode: mapMode,
    providerId: preferredProviderId,
    mapStyle,
    setMapStyle,
    setMode: setMapMode,
    setProvider: setProviderId,
  } = useMapPreferences();
  const offline = useOfflineMap(offlineProviderFor(preferredProviderId));
  const providerId =
    mapMode === 'offline' ? offline.selectedProviderId || preferredProviderId : preferredProviderId;
  const selectedProvider = getMapProvider(providerId);
  const { keys, saveKey } = useMapKeys();
  const apiKey = keys[selectedProvider?.brand || ''] || '';
  const online = useOnlineMap(providerId, apiKey, mapMode === 'online');
  const [tileError, setTileError] = useState(false);
  const offlineProvider = offlineProviderFor(providerId);
  const [offlineActionError, setOfflineActionError] = useState('');
  const [changingVariant, setChangingVariant] = useState(false);
  async function changeOfflineVariant(variantId: string) {
    if (!offline.region || changingVariant) return;
    setChangingVariant(true);
    setOfflineActionError('');
    try {
      const response = await fetch('/api/offline-maps/regions/' + offline.region.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: offline.region.name, variantId }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Gagal mengganti peta.');
      offline.refresh();
    } catch (error) {
      setOfflineActionError(error instanceof Error ? error.message : 'Gagal mengganti peta.');
    } finally {
      setChangingVariant(false);
    }
  }

  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  const googleCopyright = useGoogleCopyright(
    mapInstance,
    mapMode === 'online' ? online.session : undefined,
    apiKey,
  );
  const basemapStyle = offlineProvider
    ? offline.region
      ? `/offline-maps/style.json?provider=${offlineProvider}${offlineProvider === 'openmaptiles' ? '&style=' + mapStyle : ''}&variant=${offline.region.selectedVariant || ''}&v=${encodeURIComponent(offline.region.file!)}`
      : EMPTY_MAP_STYLE
    : online.style;
  useEffect(() => {
    if (!mapInstance || (mapMode === 'online' && selectedProvider?.brand === 'google')) return;
    const attribution = new maplibregl.AttributionControl({ compact: false });
    const host = document.getElementById('map-provider-credits');
    const control: maplibregl.IControl = host
      ? {
          onAdd(map) {
            host.append(attribution.onAdd(map));
            const placeholder = document.createElement('div');
            placeholder.hidden = true;
            return placeholder;
          },
          onRemove() {
            attribution.onRemove();
          },
        }
      : attribution;
    mapInstance.addControl(control, 'bottom-right');
    return () => {
      if (mapInstance.hasControl(control)) mapInstance.removeControl(control);
    };
  }, [mapInstance, mapMode, selectedProvider?.brand]);
  useEffect(() => {
    setTileError(false);
    if (!mapInstance || mapMode !== 'online') return;
    const error = () => setTileError(true);
    const recovered = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceDataType === 'content' && event.isSourceLoaded) setTileError(false);
    };
    mapInstance.on('error', error);
    mapInstance.on('sourcedata', recovered);
    return () => {
      mapInstance.off('error', error);
      mapInstance.off('sourcedata', recovered);
    };
  }, [mapInstance, providerId, apiKey, basemapStyle]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: EMPTY_MAP_STYLE,
      center: [107.6191, -6.9175],
      zoom: 8,
      attributionControl: false,
      // Worker requests need absolute URLs for tiles and glyphs served by this host.
      transformRequest: (url) => ({
        url: url.startsWith('/') ? new URL(url, window.location.origin).href : url,
      }),
    });

    const instance = map.current;
    setMapInstance(instance);
    const installDrawing = () => {
      if (!drawing.current) drawing.current = createDrawingController(instance);
    };
    instance.on('style.load', installDrawing);

    return () => {
      instance.off('style.load', installDrawing);
      drawing.current?.destroy();
      drawing.current = null;

      map.current?.remove();
      map.current = null;
      previousStyle.current = EMPTY_MAP_STYLE;
    };
    // Map instance is created once; style swaps are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Async provider responses are cancelled on switch; the same map keeps its viewport and overlays.
  useEffect(() => {
    if (!mapInstance || previousStyle.current === basemapStyle) return;
    previousStyle.current = basemapStyle;
    drawing.current?.destroy();
    drawing.current = null;
    mapInstance.setStyle(basemapStyle as never, { diff: false });
  }, [mapInstance, basemapStyle]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        ![...document.querySelectorAll('iframe')].some(
          (frame) => frame.contentWindow === event.source,
        )
      )
        return;
      if (event.data?.type === 'bms:map-area-request' && map.current) {
        const b = map.current.getBounds();
        (event.source as Window)?.postMessage(
          { type: 'bms:map-area', bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] },
          location.origin,
        );
      }
      if (event.data?.type === 'bms:offline-maps-changed') offline.refresh();
      if (event.data?.type === 'bms:offline-map-active') {
        offline.refresh();
        const b = event.data.bounds;
        if (Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)) {
          const id = mapProviders.find(
            (provider) => provider.offlineProvider === (event.data.provider || 'protomaps'),
          )?.id;
          if (!id) return;
          setProviderId(id);
          map.current?.fitBounds(
            [
              [b[0], b[1]],
              [b[2], b[3]],
            ],
            { padding: 30, duration: 0 },
          );
        }
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (!active) {
      useMapTools.getState().controller?.mode('render');
      useMapTools.setState({ range: false });
    }
  }, [active]);
  useEffect(() => {
    if (!mapContainer.current) return;
    const observer = new ResizeObserver(() => map.current?.resize());
    observer.observe(mapContainer.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="w-full h-full relative ops-tactical-map">
      <div className="bms-map-layout">
        <MapNavbar
          offlineProviders={offline.availableProviders}
          offlineLoaded={offline.loaded}
          offlineError={offline.error}
          offlineRegion={offline.region}
          onOfflineVariantChange={changeOfflineVariant}
          changingVariant={changingVariant}
          mapStyle={mapStyle}
          onStyleChange={setMapStyle}
          map={mapInstance}
          mode={mapMode}
          onModeChange={setMapMode}
          providerId={providerId}
          onProviderChange={setProviderId}
          apiKey={apiKey}
          onApiKeyChange={saveKey}
        />
        <div className="bms-map-canvas">
          <ImageOverlayLayer map={mapInstance} />
          {children?.(mapInstance)}
          <div ref={mapContainer} className="w-full h-full" />
          {mapMode === 'online' && (online.loading || online.error || tileError) && (
            <div className="map-online-status" role="status">
              <span>
                {t(
                  online.loading
                    ? 'Loading map...'
                    : online.error ||
                        'Could not load map. Check connection, API key and provider quota.',
                )}
              </span>
              {!online.loading && (
                <button type="button" onClick={online.retry}>
                  {t('Retry')}
                </button>
              )}
            </div>
          )}
          {mapMode === 'online' && selectedProvider?.brand === 'google' && online.session && (
            <div className="map-google-credit" translate="no">
              <strong>Google Maps</strong>
              <span>{googleCopyright}</span>
            </div>
          )}
          {mapMode === 'online' && selectedProvider?.brand === 'maptiler' && apiKey && (
            <a
              className="map-provider-logo"
              href="https://www.maptiler.com/"
              target="_blank"
              rel="noreferrer"
            >
              <img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" />
            </a>
          )}
          {Boolean(offlineProvider) && (offlineActionError || offline.error) && (
            <div className="map-online-status" role="status">
              <span>{t(offlineActionError || offline.error)}</span>
            </div>
          )}
          {active && !selectingOffline && <BmsDrawingHint />}
          {active && selectingOffline && mapInstance && <OfflineAreaSelection map={mapInstance} />}
        </div>
      </div>
    </div>
  );
}
