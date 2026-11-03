import type { StyleSpecification } from 'maplibre-gl';

export type OnlineBrand = 'esri' | 'google' | 'osm' | 'carto' | 'eox' | 'maptiler';
export type MapKind = 'satellite' | 'street' | 'hybrid' | 'topographic' | 'dark' | 'light';
export interface MapProvider {
  id: string;
  name: string;
  brand?: OnlineBrand;
  kind?: MapKind;
  offlineProvider?: string;
  style: StyleSpecification | string;
  maptilerStyle?: string;
}
export const EMPTY_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'map-empty', type: 'background', paint: { 'background-color': '#081820' } }],
};
export function rasterStyle(
  id: string,
  tiles: string[],
  attribution: string,
  maxzoom = 19,
): StyleSpecification {
  return {
    version: 8,
    sources: { [id]: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom } },
    // Limit requests at the source while retaining overzoom at larger display scales.
    layers: [{ id: `${id}-tiles`, type: 'raster', source: id }],
  };
}
const ESRI_ATTR =
  '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community';
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTR = `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const esriStyle = (id: string, service: string, maxzoom = 19) =>
  rasterStyle(
    id,
    [
      `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`,
    ],
    ESRI_ATTR,
    maxzoom,
  );
const hybrid = esriStyle('esri-hybrid', 'World_Imagery');
const labels = esriStyle('esri-labels', 'Reference/World_Boundaries_and_Places', 19);
Object.assign(hybrid.sources, labels.sources);
hybrid.layers.push(...labels.layers);

export const onlineBrands: {
  id: OnlineBrand;
  name: string;
  defaultId: string;
  needsKey?: boolean;
}[] = [
  { id: 'esri', name: 'ArcGIS', defaultId: 'satellite' },
  { id: 'google', name: 'Google Maps', defaultId: 'google-satellite', needsKey: true },
  { id: 'osm', name: 'OpenStreetMap', defaultId: 'osm' },
  { id: 'carto', name: 'CARTO', defaultId: 'carto-dark' },
  { id: 'eox', name: 'EOX', defaultId: 'eox-satellite' },
  { id: 'maptiler', name: 'MapTiler', defaultId: 'maptiler-satellite', needsKey: true },
];
// Retain existing IDs so saved online and offline selections migrate without resetting.
export const mapProviders: MapProvider[] = [
  {
    id: 'offline-mbtiles-raster',
    name: 'MBTiles Raster',
    offlineProvider: 'mbtiles-raster',
    style: '/offline-maps/style.json?provider=mbtiles-raster',
  },
  {
    id: 'offline-gmdb',
    name: 'GMDB / GMap.NET',
    offlineProvider: 'gmdb',
    style: '/offline-maps/style.json?provider=gmdb',
  },
  {
    id: 'offline-openmaptiles',
    name: 'OpenMapTiles',
    offlineProvider: 'openmaptiles',
    style: '/offline-maps/style.json?provider=openmaptiles',
  },
  {
    id: 'offline',
    name: 'Protomaps',
    offlineProvider: 'protomaps',
    style: '/offline-maps/style.json',
  },
  {
    id: 'offline-satellite',
    name: 'Satellite / EOX',
    offlineProvider: 'eox-satellite',
    style: '/offline-maps/style.json?provider=eox-satellite',
  },
  {
    id: 'satellite',
    brand: 'esri',
    kind: 'satellite',
    name: 'Satellite',
    style: esriStyle('satellite', 'World_Imagery'),
  },
  {
    id: 'esri-street',
    brand: 'esri',
    kind: 'street',
    name: 'Street map',
    style: esriStyle('esri-street', 'World_Street_Map'),
  },
  { id: 'esri-hybrid', brand: 'esri', kind: 'hybrid', name: 'Hybrid', style: hybrid },
  {
    id: 'esri-topographic',
    brand: 'esri',
    kind: 'topographic',
    name: 'Topographic',
    style: esriStyle('esri-topographic', 'World_Topo_Map'),
  },
  {
    id: 'esri-dark',
    brand: 'esri',
    kind: 'dark',
    name: 'Dark',
    style: esriStyle('esri-dark', 'Canvas/World_Dark_Gray_Base', 16),
  },
  {
    id: 'osm',
    brand: 'osm',
    kind: 'street',
    name: 'Street map',
    style: rasterStyle('osm', ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], OSM_ATTR),
  },
  {
    id: 'carto-dark',
    brand: 'carto',
    kind: 'dark',
    name: 'Dark',
    style: rasterStyle(
      'carto-dark',
      ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      CARTO_ATTR,
      20,
    ),
  },
  {
    id: 'carto-light',
    brand: 'carto',
    kind: 'light',
    name: 'Light',
    style: rasterStyle(
      'carto-light',
      ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      CARTO_ATTR,
      20,
    ),
  },
  {
    id: 'carto-street',
    brand: 'carto',
    kind: 'street',
    name: 'Street map',
    style: rasterStyle(
      'carto-street',
      ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
      CARTO_ATTR,
      20,
    ),
  },
  {
    id: 'eox-satellite',
    brand: 'eox',
    kind: 'satellite',
    name: 'Satellite',
    style: rasterStyle(
      'eox-satellite',
      ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
      '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by <a href="https://eox.at">EOX</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017) / <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
      18,
    ),
  },
  ...(['satellite', 'street', 'hybrid', 'topographic'] as const).map((kind) => ({
    id: `google-${kind}`,
    brand: 'google' as const,
    kind,
    name: {
      satellite: 'Satellite',
      street: 'Street map',
      hybrid: 'Hybrid',
      topographic: 'Terrain',
    }[kind],
    style: EMPTY_MAP_STYLE,
  })),
  ...(['satellite', 'street', 'hybrid', 'topographic'] as const).map((kind) => ({
    id: `maptiler-${kind}`,
    brand: 'maptiler' as const,
    kind,
    name: {
      satellite: 'Satellite',
      street: 'Street map',
      hybrid: 'Hybrid',
      topographic: 'Topographic',
    }[kind],
    maptilerStyle: {
      satellite: 'satellite',
      street: 'streets-v4',
      hybrid: 'hybrid',
      topographic: 'topo-v2',
    }[kind],
    style: EMPTY_MAP_STYLE,
  })),
];
export const OFFLINE_STYLE_URL = '/offline-maps/style.json';
export const DEFAULT_PROVIDER_ID =
  import.meta.env.VITE_MAP_MODE === 'offline'
    ? 'offline'
    : import.meta.env.VITE_MAP_PROVIDER || 'esri-hybrid';
export const getMapProvider = (id: string) => mapProviders.find((provider) => provider.id === id);
export const offlineProviderFor = (id: string) => getMapProvider(id)?.offlineProvider;
export function getMapStyle(providerId = DEFAULT_PROVIDER_ID): StyleSpecification | string {
  return (getMapProvider(providerId) || getMapProvider('esri-dark')!).style;
}
export function providerForBrand(brand: OnlineBrand, previousId: string): string {
  const kind = getMapProvider(previousId)?.kind;
  return (
    mapProviders.find((provider) => provider.brand === brand && provider.kind === kind)?.id ||
    onlineBrands.find((provider) => provider.id === brand)!.defaultId
  );
}
