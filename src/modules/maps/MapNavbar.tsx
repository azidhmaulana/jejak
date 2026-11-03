import GraduatedScaleControl from './GraduatedScaleControl';
import { createPortal } from 'react-dom';
import { isOsintMap } from './mapWorkspace';
import type { OfflineRegion, OfflineProviderOption } from './useOfflineMap';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { KeyRound, Save, X, Moon, SatelliteDish } from 'lucide-react';
import HudAccent from '../../shared/components/HudAccent';
import {
  getMapProvider,
  mapProviders,
  onlineBrands,
  providerForBrand,
  type OnlineBrand,
} from './mapProviders';
import { t } from '../../shared/i18n/runtime.js';
import { useLanguage } from '../../shared/i18n/useLanguage';
import type { MapMode, MapStyle } from './useMapPreferences';
import './MapNavbar.css';
import { useGpsStore } from '../../shared/stores/gpsStore';
import { orientationBearing, MAP_SCALE_MAX_WIDTH, type MapOrientation } from './gpsNavigation';

/** Keep native map controls registered while displaying them in the panel header. */
function headerControl(control: maplibregl.IControl, host: HTMLElement): maplibregl.IControl {
  return {
    onAdd(map) {
      host.append(control.onAdd(map));
      const placeholder = document.createElement('div');
      placeholder.hidden = true;
      return placeholder;
    },
    onRemove(map) {
      control.onRemove(map);
    },
  };
}

export default function MapNavbar({
  map,
  mode,
  onModeChange,
  providerId,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  mapStyle,
  onStyleChange,
  offlineProviders,
  offlineLoaded,
  offlineError,
  offlineRegion,
  onOfflineVariantChange,
  changingVariant,
}: {
  offlineProviders: OfflineProviderOption[];
  offlineLoaded: boolean;
  offlineError: string;
  offlineRegion: OfflineRegion | null;
  onOfflineVariantChange: (id: string) => void;
  changingVariant: boolean;
  mapStyle: MapStyle;
  onStyleChange: (style: MapStyle) => void;
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  apiKey: string;
  onApiKeyChange: (brand: string, key: string) => void;
  map: maplibregl.Map | null;
  providerId: string;
  onProviderChange: (id: string) => void;
}) {
  useLanguage();
  const [cornerType, setCornerType] = useState<HTMLElement | null>(null);
  const [cornerScale, setCornerScale] = useState<HTMLElement | null>(null);
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (isOsintMap) {
      setFooterHost(document.getElementById('osint-map-footer'));
      setCornerType(document.getElementById('map-corner-type'));
      setCornerScale(document.getElementById('map-corner-scale'));
    }
  }, []);
  const provider = getMapProvider(providerId);
  const noOfflineMaps = mode === 'offline' && !offlineProviders.length;
  const offlinePlaceholder = offlineLoaded
    ? 'Belum ada peta offline aktif'
    : offlineError || 'Memuat daftar peta...';
  const brand = onlineBrands.find((item) => item.id === provider?.brand);
  const [editingKey, setEditingKey] = useState(false);
  const [draftKey, setDraftKey] = useState(apiKey);
  useEffect(() => {
    setDraftKey(apiKey);
    setEditingKey(false);
  }, [brand?.id, apiKey, mode]);
  const showKeyForm = mode === 'online' && brand?.needsKey && (editingKey || !apiKey);
  const orientation = useGpsStore((state) => state.orientation);
  const cueingEnabled = useGpsStore((state) => state.cueingEnabled);
  const heading = useGpsStore((state) =>
    !state.cueingEnabled
      ? null
      : state.vehicleEnabled && state.mode === 'manual'
        ? (state.manual?.heading ?? null)
        : state.automaticHeading,
  );
  const setOrientation = useGpsStore((state) => state.setOrientation);
  const navigation = useRef<HTMLDivElement>(null),
    scale = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map || !navigation.current || !(cornerScale || scale.current)) return;
    const controls = [
      headerControl(
        new maplibregl.NavigationControl({
          showZoom: true,
          showCompass: true,
          visualizePitch: true,
        }),
        navigation.current,
      ),
      headerControl(
        isOsintMap
          ? new GraduatedScaleControl()
          : new maplibregl.ScaleControl({ maxWidth: MAP_SCALE_MAX_WIDTH, unit: 'metric' }),
        (cornerScale || scale.current)!,
      ),
    ];
    controls.forEach((control) => map.addControl(control));
    const compass = navigation.current.querySelector('.maplibregl-ctrl-compass');
    const zoomOut = navigation.current.querySelector('.maplibregl-ctrl-zoom-out');
    const zoomIn = navigation.current.querySelector('.maplibregl-ctrl-zoom-in');
    // Keep keyboard navigation in the same order as the toolbar.
    if (compass && zoomOut && zoomIn) compass.parentElement?.append(compass, zoomOut, zoomIn);
    const resetOrientation = (event: Event) => {
      // Override the native resetNorthPitch click before it starts its own animation.
      event.preventDefault();
      event.stopImmediatePropagation();
      const gps = useGpsStore.getState();
      const heading = !gps.cueingEnabled
        ? null
        : gps.vehicleEnabled && gps.mode === 'manual'
          ? (gps.manual?.heading ?? null)
          : gps.automaticHeading;
      map.easeTo(
        {
          bearing: orientationBearing(gps.orientation, { heading }),
          pitch: 0,
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
        },
        { originalEvent: event },
      );
    };
    compass?.addEventListener('click', resetOrientation, true);
    return () => {
      compass?.removeEventListener('click', resetOrientation, true);
      controls.forEach((control) => {
        if (map.hasControl(control)) map.removeControl(control);
      });
    };
  }, [map, footerHost, cornerScale]);
  useEffect(() => {
    const compass = navigation.current?.querySelector('.maplibregl-ctrl-compass');
    const label =
      orientation === 'head-up'
        ? heading == null
          ? 'Heading belum tersedia; peta tetap menghadap utara.'
          : 'Kembali ke heading GPS'
        : 'Reset bearing to north';
    compass?.setAttribute('title', label);
    compass?.setAttribute('aria-label', label);
  }, [map, orientation, heading, footerHost]);
  const typeSelector = (
    <select
      className="map-type-select"
      aria-label={t('Map type')}
      title={t('Map type')}
      value={
        noOfflineMaps
          ? ''
          : provider?.offlineProvider === 'gmdb'
            ? offlineRegion?.selectedVariant || ''
            : providerId
      }
      disabled={
        mode === 'offline' &&
        (isOsintMap ||
          provider?.offlineProvider !== 'gmdb' ||
          !offlineRegion?.variants?.length ||
          changingVariant)
      }
      onChange={(event) =>
        provider?.offlineProvider === 'gmdb'
          ? onOfflineVariantChange(event.target.value)
          : onProviderChange(event.target.value)
      }
    >
      {mode === 'online' ? (
        mapProviders
          .filter((item) => item.brand === provider?.brand)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.name)}
            </option>
          ))
      ) : noOfflineMaps ? (
        <option value="">—</option>
      ) : provider?.offlineProvider === 'gmdb' ? (
        offlineRegion?.variants?.length ? (
          offlineRegion.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.providerLabel} /{' '}
              {t(
                (
                  {
                    street: 'Street map',
                    satellite: 'Satellite',
                    hybrid: 'Hybrid',
                    terrain: 'Terrain',
                    topographic: 'Topographic',
                    raster: 'Raster',
                  } as Record<string, string>
                )[variant.mapType] || variant.mapType,
              )}
            </option>
          ))
        ) : (
          <option value="">{t('Pilih paket GMDB')}</option>
        )
      ) : (
        <option value={providerId}>
          {t(
            provider?.offlineProvider === 'mbtiles-raster'
              ? (
                  {
                    nautical: 'Peta Laut',
                    street: 'Street map',
                    satellite: 'Satellite',
                    hybrid: 'Hybrid',
                    terrain: 'Terrain',
                    topographic: 'Topographic',
                  } as Record<string, string>
                )[offlineRegion?.mapType || ''] || 'Raster'
              : provider?.offlineProvider === 'eox-satellite'
                ? 'Satellite'
                : 'Street map',
          )}
        </option>
      )}
    </select>
  );
  const navbar = (
    <header className="map-panel-navbar" aria-label="Navbar Maps">
      <select
        className="map-mode-select"
        aria-label="Map mode"
        title="Mode peta"
        value={mode}
        onChange={(event) => onModeChange(event.target.value as MapMode)}
      >
        <option value="online" translate="no">
          Online
        </option>
        <option value="offline" translate="no">
          Offline
        </option>
      </select>
      <select
        className="map-provider-select"
        aria-label={t('Map provider')}
        title={t('Map provider')}
        disabled={noOfflineMaps}
        value={mode === 'online' ? provider?.brand || 'esri' : noOfflineMaps ? '' : providerId}
        onChange={(event) =>
          onProviderChange(
            mode === 'online'
              ? providerForBrand(event.target.value as OnlineBrand, providerId)
              : event.target.value,
          )
        }
      >
        {mode === 'online' ? (
          onlineBrands.map((item) => (
            <option key={item.id} value={item.id} translate="no">
              {item.name}
            </option>
          ))
        ) : offlineProviders.length ? (
          offlineProviders.map((item) => (
            <option key={item.id} value={item.id} translate="no">
              {item.name}
            </option>
          ))
        ) : (
          <option value="">{t(offlinePlaceholder)}</option>
        )}
      </select>
      {cornerType && typeSelector}
      {cornerType
        ? createPortal(
            <div className="tactical-basemap">
              <button
                aria-pressed={
                  mode === 'online' && provider?.kind !== 'satellite' && provider?.kind !== 'hybrid'
                }
                onClick={() => onProviderChange('esri-dark')}
              >
                <Moon aria-hidden="true" />
                <span>MAP</span>
              </button>
              <button
                aria-pressed={
                  mode === 'online' &&
                  (provider?.kind === 'satellite' || provider?.kind === 'hybrid')
                }
                onClick={() => onProviderChange('esri-hybrid')}
              >
                <SatelliteDish aria-hidden="true" />
                <span>SAT</span>
              </button>
              <span className="tactical-type-select">{typeSelector}</span>
            </div>,
            cornerType,
          )
        : typeSelector}
      {!noOfflineMaps && provider?.offlineProvider === 'openmaptiles' && (
        <select
          className="map-style-select"
          aria-label={t('Map style')}
          title={t('Map style')}
          value={mapStyle}
          onChange={(event) => onStyleChange(event.target.value as MapStyle)}
        >
          <option value="light" translate="no">
            Light
          </option>
          <option value="dark" translate="no">
            Dark
          </option>
          <option value="grayscale" translate="no">
            Grayscale
          </option>
        </select>
      )}
      {mode === 'online' && brand?.needsKey && (
        <button
          type="button"
          className="map-navbar-key"
          title={t('Provider API key')}
          aria-label={t('Provider API key')}
          aria-expanded={Boolean(showKeyForm)}
          onClick={() => setEditingKey((value) => !value)}
        >
          <KeyRound size={12} />
        </button>
      )}
      <HudAccent markers={false} />
      <div className="map-navbar-controls" role="group" aria-label="Zoom dan orientasi peta">
        {cueingEnabled && (
          <select
            className="map-orientation-select"
            aria-label="Orientasi peta"
            title={
              orientation === 'head-up' && heading == null
                ? 'Heading belum tersedia; peta tetap menghadap utara.'
                : 'Orientasi peta'
            }
            value={orientation}
            onChange={(event) => setOrientation(event.target.value as MapOrientation)}
          >
            <option value="north-up" translate="no">
              North Up
            </option>
            <option value="head-up" translate="no">
              Head Up
            </option>
          </select>
        )}
        <div ref={navigation} className="map-navbar-navigation" />
        <div
          ref={scale}
          className="map-navbar-scale"
          aria-label="Skala peta"
          title="Skala jarak peta"
        />
      </div>
      {showKeyForm && (
        <form
          className="map-key-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (brand) onApiKeyChange(brand.id, draftKey);
            setEditingKey(false);
          }}
        >
          <label>
            <span translate="no">{brand?.name}</span> API key{' '}
            <input
              aria-label={t('Provider API key')}
              type="password"
              autoComplete="off"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder={t('Enter API key')}
            />
          </label>
          <button type="submit" title={t('Save')} aria-label={t('Save')}>
            <Save size={13} />
          </button>
          {apiKey && (
            <button
              type="button"
              title={t('Close')}
              aria-label={t('Close')}
              onClick={() => setEditingKey(false)}
            >
              <X size={13} />
            </button>
          )}
          <small>{t('Saved in this browser. Use a website-restricted API key.')}</small>
          <a
            href={
              brand?.id === 'google'
                ? 'https://console.cloud.google.com/google/maps-apis/credentials'
                : 'https://cloud.maptiler.com/account/keys/'
            }
            target="_blank"
            rel="noreferrer"
          >
            {t('Get API key')}
          </a>
        </form>
      )}
    </header>
  );
  // The OSINT toolbar belongs only in its portal host. Rendering it inline while
  // the host is being resolved briefly exposes the legacy map header on refresh.
  if (isOsintMap) return footerHost ? createPortal(navbar, footerHost) : null;
  return navbar;
}
