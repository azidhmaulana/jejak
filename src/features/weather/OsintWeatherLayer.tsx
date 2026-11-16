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
  const existing = map.getSource(id) as RasterTileSource | undefined;
  if (existing) {
    existing.setTiles(tiles);
    return;
  }
  map.addSource(id, { type: 'raster', tiles, tileSize: 256, maxzoom, attribution });
  const before = map
    .getStyle()
    ?.layers?.find((l) => l.type === 'symbol' || l.id.startsWith('bms-drawing'))?.id;
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
  const rain = useOsintWeather((s) => s.rain);
  useEffect(() => {
    if (!map || !rain) return;
    const id = prefix + 'rain',
      abort = new AbortController();
    let frames: RadarFrame[] = [],
      host = '',
      disposed = false;
    const render = () => {
      if (!map.getStyle()?.layers || !frames.length) return;
      const s = useOsintWeather.getState(),
        frame =
          frames[s.rainIndex < 0 ? frames.length - 1 : Math.min(s.rainIndex, frames.length - 1)];
      raster(
        map,
        id,
        [`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`],
        7,
        '<a href="https://www.rainviewer.com/">RainViewer</a>',
        0.65,
      );
    };
    const refresh = async () => {
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
        useOsintWeather.setState({ frames, rainIndex: -1 });
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
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 600000);
    const playback = setInterval(() => {
      const s = useOsintWeather.getState();
      if (!document.hidden && s.playing && s.rainTime && frames.length > 1)
        useOsintWeather.setState({ rainIndex: (s.rainIndex + 1) % frames.length });
    }, 1000);
    const unsub = useOsintWeather.subscribe((s, p) => {
      if (s.rainIndex !== p.rainIndex) render();
    });
    map.on('style.load', render);
    return () => {
      disposed = true;
      abort.abort();
      clearInterval(timer);
      clearInterval(playback);
      unsub();
      map.off('style.load', render);
      remove(map, id);
    };
  }, [map, rain]);
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
