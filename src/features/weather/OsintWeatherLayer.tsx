import { satelliteFrame, useHimawari } from './himawariStore';
import { useEffect } from 'react';
import type { Map as MapLibreMap, RasterTileSource, ErrorEvent } from 'maplibre-gl';
import {
  useOsintWeather,
  weatherStatus,
  type WeatherLayer,
  type RadarFrame,
} from './osintWeatherStore';

const prefix = 'osint-weather-';
async function json(url: string, signal: AbortSignal) {
  const controller = new AbortController(),
    cancel = () => controller.abort();
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
function remove(map: MapLibreMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}
function raster(
  map: MapLibreMap,
  id: string,
  tiles: string[],
  maxzoom: number,
  attribution: string,
  opacity: number,
) {
  const before = map.getStyle()?.layers?.find(l => l.type === 'symbol' || l.type === 'circle' || l.id.startsWith('bms-drawing') || l.id.startsWith('jejak-province'))?.id;
  const existing = map.getSource(id) as RasterTileSource | undefined;
  if (existing) {
    const current = existing.serialize();
    if (JSON.stringify(current.tiles) !== JSON.stringify(tiles)) existing.setTiles(tiles);
    map.setPaintProperty(id, 'raster-opacity', opacity);
    if (map.getLayer(id)) map.moveLayer(id, before);
    return;
  }
  map.addSource(id, { type: 'raster', tiles, tileSize: 256, maxzoom, attribution });
  map.addLayer(
    {
      id,
      type: 'raster',
      source: id,
      paint: { 'raster-opacity': opacity, 'raster-fade-duration': 250 },
    },
    before,
  );
}

export default function OsintWeatherLayer({ map }: { map: MapLibreMap | null }) {
  useEffect(() => {
    if (!map) return;
    const id = prefix + 'rain',
      abort = new AbortController();
    let frames: RadarFrame[] = [],
      host = '',
      disposed = false,
      refreshing = false,
      refreshedAt = 0;
    const render = () => {
      if (!map.getStyle()?.layers || !frames.length) return;
      const s = useOsintWeather.getState();
      if (!s.rain && !s.clouds) {
        if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', 0);
        return;
      }
      let frame =
          frames[s.rainIndex < 0 ? frames.length - 1 : Math.min(s.rainIndex, frames.length - 1)];
      if (s.clouds) {
        const target = satelliteFrame()?.time;
        const candidates = target ? frames.filter(f => Math.abs(f.time * 1000 - target) <= 600000) : [];
        if (!candidates.length) {
          if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', 0);
          return;
        }
        frame = candidates.reduce((a,b) => Math.abs(a.time * 1000 - target!) < Math.abs(b.time * 1000 - target!) ? a : b);
      }
      raster(
        map,
        id,
        [`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`],
        7,
        '<a href="https://www.rainviewer.com/">RainViewer</a>',
        s.rain || (s.clouds && s.radarOverlay) ? 0.85 : 0,
      );
    };
    const refresh = async () => {
      const weather = useOsintWeather.getState();
      if (refreshing || (!weather.rain && !weather.clouds) || Date.now() - refreshedAt < 600000) return;
      refreshing = true;
      try {
        weatherStatus('rain', 'Memuat radar…');
        const data = await json(
          'https://api.rainviewer.com/public/weather-maps.json',
          abort.signal,
        );
        if (disposed) return;
        if (data.host !== 'https://tilecache.rainviewer.com')
          throw new Error('Host radar tidak dikenali');
        frames = (data.radar?.past ?? []).filter(
          (f: RadarFrame) =>
            Number.isFinite(f.time) &&
            typeof f.path === 'string' &&
            /^\/v2\/radar\/[a-zA-Z0-9/_-]+$/.test(f.path),
        );
        host = data.host;
        refreshedAt = Date.now();
        useOsintWeather.setState({ frames });
        render();
        weatherStatus(
          'rain',
          frames.length
            ? 'Radar tersedia · ' +
                new Date(frames[frames.length - 1].time * 1000).toLocaleTimeString('id-ID')
            : 'Data radar belum tersedia',
        );
      } catch (e) {
        if (!disposed) weatherStatus('rain', 'Radar gagal dimuat. ' + String(e));
      } finally { refreshing = false; }
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 600000);
    const playback = setInterval(() => {
      const s = useOsintWeather.getState();
      if (!document.hidden && s.rain && s.playing && s.rainTime && frames.length > 1)
        useOsintWeather.setState({ rainIndex: (s.rainIndex + 1) % frames.length });
    }, 1000);
    const unsub = useOsintWeather.subscribe((s, p) => {
      if (s.rain !== p.rain || s.clouds !== p.clouds) void refresh();
      if (s.rain !== p.rain || s.rainIndex !== p.rainIndex || s.clouds !== p.clouds || s.radarOverlay !== p.radarOverlay) render();
    });
    const unsubscribeSatellite = useHimawari.subscribe((s, p) => {
      if (s.frames !== p.frames || s.index !== p.index || s.mode !== p.mode || s.hours !== p.hours) render();
    });
    const radarLoading = () => {
      const state = useOsintWeather.getState();
      const visible = state.rain || (state.clouds && state.radarOverlay);
      const loading = visible && Boolean(map.getSource(id)) && !map.isSourceLoaded(id);
      if (state.radarLoading !== loading) useOsintWeather.setState({radarLoading: loading});
    };
    const sourceLoading = (event: {sourceId?: string}) => {if(event.sourceId === id) radarLoading();};
    map.on('sourcedataloading', sourceLoading);
    map.on('sourcedata', sourceLoading);
    map.on('idle', radarLoading);
    map.on('style.load', render);
    return () => {
      disposed = true;
      abort.abort();
      clearInterval(timer);
      clearInterval(playback);
      unsub();
      unsubscribeSatellite();
      map.off('sourcedataloading', sourceLoading);
      map.off('sourcedata', sourceLoading);
      map.off('idle', radarLoading);
      useOsintWeather.setState({radarLoading: false});
      map.off('style.load', render);
      remove(map, id);
    };
  }, [map]);
  useEffect(() => {
    if (!map) return;
    const error = (e: ErrorEvent & { sourceId?: string }) => {
      if (e.sourceId?.startsWith(prefix))
        weatherStatus(
          e.sourceId.slice(prefix.length) as WeatherLayer,
          'Sumber cuaca gagal dimuat. Coba matikan lalu aktifkan kembali.',
        );
    };
    map.on('error', error);
    return () => {
      map.off('error', error);
    };
  }, [map]);
  return null;
}
