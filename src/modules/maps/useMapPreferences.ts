import { mapStorageKey } from './mapWorkspace';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PROVIDER_ID, mapProviders, offlineProviderFor } from './mapProviders';

export type MapMode = 'online' | 'offline';
export type MapStyle = 'light' | 'dark' | 'grayscale';
export const mapStyles: MapStyle[] = ['light', 'dark', 'grayscale'];
type Preferences = {
  mapStyle: MapStyle;
  mode: MapMode;
  onlineProvider: string;
  offlineProvider: string;
};
const key = mapStorageKey('bms-map-preferences-v1');
const validOnline = (id: unknown): id is string =>
  typeof id === 'string' && mapProviders.some((p) => p.id === id && !p.offlineProvider);
const validOffline = (id: unknown): id is string =>
  typeof id === 'string' && Boolean(offlineProviderFor(id));
const defaultOnline = validOnline(DEFAULT_PROVIDER_ID) ? DEFAULT_PROVIDER_ID : 'esri-dark';
function read(): Preferences {
  const defaults: Preferences = {
    mapStyle: 'light',
    mode: validOffline(DEFAULT_PROVIDER_ID) ? 'offline' : 'online',
    onlineProvider: defaultOnline,
    offlineProvider: validOffline(DEFAULT_PROVIDER_ID) ? DEFAULT_PROVIDER_ID : 'offline',
  };
  try {
    const legacy = localStorage.getItem(mapStorageKey('bms-map-provider-v1'));
    if (validOffline(legacy)) {
      defaults.mode = 'offline';
      defaults.offlineProvider = legacy;
    } else if (validOnline(legacy)) {
      defaults.mode = 'online';
      defaults.onlineProvider = legacy;
    }
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && (saved.mode === 'online' || saved.mode === 'offline')) {
      return {
        mapStyle: mapStyles.includes(saved.mapStyle) ? saved.mapStyle : 'light',
        mode: saved.mode,
        onlineProvider: validOnline(saved.onlineProvider)
          ? saved.onlineProvider
          : defaults.onlineProvider,
        offlineProvider: validOffline(saved.offlineProvider)
          ? saved.offlineProvider
          : defaults.offlineProvider,
      };
    }
  } catch {
    /* Keep a usable selection if browser storage is unavailable or malformed. */
  }
  return defaults;
}

export function useMapPreferences() {
  const [preferences, setPreferences] = useState(read);
  const providerId =
    preferences.mode === 'offline' ? preferences.offlineProvider : preferences.onlineProvider;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
      localStorage.setItem(mapStorageKey('bms-map-provider-v1'), providerId);
    } catch {}
  }, [preferences, providerId]);
  const setMode = useCallback((mode: MapMode) => {
    setPreferences((previous) => (previous.mode === mode ? previous : { ...previous, mode }));
  }, []);
  const setProvider = useCallback((id: string) => {
    if (validOffline(id))
      setPreferences((previous) => ({ ...previous, mode: 'offline', offlineProvider: id }));
    else if (validOnline(id))
      setPreferences((previous) => ({ ...previous, mode: 'online', onlineProvider: id }));
  }, []);
  const setMapStyle = useCallback((mapStyle: MapStyle) => {
    if (mapStyles.includes(mapStyle)) setPreferences((previous) => ({ ...previous, mapStyle }));
  }, []);
  return {
    mode: preferences.mode,
    mapStyle: preferences.mapStyle,
    setMapStyle,
    providerId,
    setMode,
    setProvider,
  };
}
