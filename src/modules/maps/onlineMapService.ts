import { EMPTY_MAP_STYLE, getMapProvider, rasterStyle, type MapKind } from './mapProviders';
import type { StyleSpecification } from 'maplibre-gl';

export type OnlineMapResult = {
  style: StyleSpecification | string;
  session?: string;
  expiry?: number;
};
export function googleSessionOptions(kind?: MapKind) {
  return {
    mapType: kind === 'street' ? 'roadmap' : kind === 'topographic' ? 'terrain' : 'satellite',
    language: 'id-ID',
    region: 'ID',
    ...(kind === 'hybrid' || kind === 'topographic'
      ? { layerTypes: ['layerRoadmap'], overlay: false }
      : {}),
  };
}
export async function resolveOnlineMap(
  id: string,
  key: string,
  signal: AbortSignal,
): Promise<OnlineMapResult> {
  const provider = getMapProvider(id);
  if (!provider || provider.offlineProvider) return { style: EMPTY_MAP_STYLE };
  if (provider.brand === 'maptiler') {
    if (!key) throw Error('API key required');
    return {
      style: `https://api.maptiler.com/maps/${provider.maptilerStyle}/style.json?key=${encodeURIComponent(key)}`,
    };
  }
  if (provider.brand !== 'google') return { style: provider.style };
  if (!key) throw Error('API key required');
  const response = await fetch(
    `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(googleSessionOptions(provider.kind)),
      signal,
    },
  );
  if (!response.ok)
    throw Error('Could not load map. Check connection, API key and provider quota.');
  const data = await response.json();
  if (
    typeof data.session !== 'string' ||
    !data.session ||
    !Number.isFinite(Number(data.expiry)) ||
    Number(data.expiry) * 1000 <= Date.now()
  ) {
    throw Error('Invalid map session. Try again.');
  }
  const style = rasterStyle(
    'google',
    [
      `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(data.session)}&key=${encodeURIComponent(key)}`,
    ],
    'Google Maps',
    22,
  );
  if (data.tileWidth === 512) (style.sources.google as { tileSize: number }).tileSize = 512;
  return { style, session: data.session, expiry: Number(data.expiry) * 1000 };
}
export function googleViewportUrl(
  session: string,
  key: string,
  zoom: number,
  bounds: { north: number; south: number; east: number; west: number },
) {
  const wrap = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;
  const world = bounds.east - bounds.west >= 360;
  const params = new URLSearchParams({
    session,
    key,
    zoom: String(Math.max(0, Math.min(22, Math.floor(zoom)))),
    north: String(Math.min(85.051129, bounds.north)),
    south: String(Math.max(-85.051129, bounds.south)),
    east: String(world ? 179.999999 : wrap(bounds.east)),
    west: String(world ? -179.999999 : wrap(bounds.west)),
  });
  return `https://tile.googleapis.com/tile/v1/viewport?${params}`;
}
