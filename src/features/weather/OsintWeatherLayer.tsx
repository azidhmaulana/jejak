import { useEffect } from 'react';
import type { Map as MapLibreMap, RasterTileSource, ErrorEvent } from 'maplibre-gl';
import {
  useOsintWeather,
  weatherStatus,
  type WeatherLayer,
  type RadarFrame,
} from './osintWeatherStore';

const prefix = 'osint-weather-';
type WindPoint = {
  latitude: number;
  longitude: number;
  hourly: {
    time: number[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
  };
};
const windCache = new Map<string, { at: number; data: WindPoint[] }>();
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
  const clouds = useOsintWeather((s) => s.clouds),
    rain = useOsintWeather((s) => s.rain),
    wind = useOsintWeather((s) => s.wind);
  useEffect(() => {
    if (!map || !clouds) return;
    const id = prefix + 'clouds';
    const render = () => {
      if (!map.getStyle()?.layers) return;
      const hour = Math.floor((Date.now() - 20 * 60000) / 3600000) * 3600000;
      const url =
        'https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=global_longwave_imagery_mosaic&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=' +
        encodeURIComponent(new Date(hour).toISOString());
      raster(map, id, [url], 6, 'NOAA/NESDIS GMGSI', 0.45);
      weatherStatus('clouds', 'Memuat citra inframerah NOAA…');
    };
    const loaded = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === id && e.isSourceLoaded)
        weatherStatus('clouds', 'Citra NOAA · diperbarui per jam');
    };
    render();
    map.on('style.load', render);
    map.on('sourcedata', loaded);
    const timer = setInterval(render, 3600000);
    return () => {
      clearInterval(timer);
      map.off('style.load', render);
      map.off('sourcedata', loaded);
      remove(map, id);
    };
  }, [map, clouds]);
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
    if (!map || !wind) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'osint-wind-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    map.getCanvasContainer().appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }
    let data: WindPoint[] = [],
      abort: AbortController | undefined,
      disposed = false,
      debounce: ReturnType<typeof setTimeout>,
      animation = 0,
      last = 0;
    let points: { x: number; y: number; u: number; v: number; speed: number }[] = [];
    const particles = Array.from({ length: 160 }, () => ({
      x: Math.random(),
      y: Math.random(),
      age: Math.random() * 100,
    }));
    const project = () => {
      const rect = map.getCanvas().getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const s = useOsintWeather.getState(),
        when = Date.now() / 1000 + (s.windTime ? s.windHour : 0) * 3600;
      points = data.flatMap((d) => {
        let index = 0;
        d.hourly.time.forEach((t, i) => {
          if (Math.abs(t - when) < Math.abs(d.hourly.time[index] - when)) index = i;
        });
        const speed = d.hourly.wind_speed_10m[index],
          direction = d.hourly.wind_direction_10m[index];
        if (
          speed === null ||
          direction === null ||
          !Number.isFinite(speed) ||
          !Number.isFinite(direction)
        )
          return [];
        const p = map.project([d.longitude, d.latitude]);
        const rad = ((direction + 180) * Math.PI) / 180;
        const dest = map.project([
          d.longitude +
            (Math.sin(rad) * 0.01) / Math.max(0.05, Math.cos((d.latitude * Math.PI) / 180)),
          Math.max(-85, Math.min(85, d.latitude + Math.cos(rad) * 0.01)),
        ]);
        const length = Math.hypot(dest.x - p.x, dest.y - p.y) || 1;
        return [
          {
            x: p.x,
            y: p.y,
            u: ((dest.x - p.x) / length) * speed,
            v: ((dest.y - p.y) / length) * speed,
            speed,
          },
        ];
      });
    };
    const load = async () => {
      abort?.abort();
      abort = new AbortController();
      const request = abort;
      const b = map.getBounds(),
        lats: number[] = [],
        lngs: number[] = [];
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          lats.push(
            Number(
              Math.max(
                -85,
                Math.min(85, b.getSouth() + ((b.getNorth() - b.getSouth()) * (y + 0.5)) / 3),
              ).toFixed(2),
            ),
          );
          lngs.push(
            Number(
              (
                ((b.getWest() + ((b.getEast() - b.getWest()) * (x + 0.5)) / 3 + 540) % 360) -
                180
              ).toFixed(2),
            ),
          );
        }
      const query = new URLSearchParams({
          latitude: lats.join(','),
          longitude: lngs.join(','),
          hourly: 'wind_speed_10m,wind_direction_10m',
          past_days: '3',
          forecast_days: '6',
          wind_speed_unit: 'ms',
          timeformat: 'unixtime',
          models: 'gfs_global',
        }),
        key = query.toString();
      try {
        weatherStatus('wind', 'Memuat model angin…');
        const cached = windCache.get(key);
        const result =
          cached && Date.now() - cached.at < 600000
            ? cached.data
            : await json('https://api.open-meteo.com/v1/gfs?' + key, request.signal);
        if (disposed || request !== abort) return;
        if (
          !Array.isArray(result) ||
          result.some(
            (d) =>
              !Array.isArray(d.hourly?.time) ||
              !Array.isArray(d.hourly?.wind_speed_10m) ||
              !Array.isArray(d.hourly?.wind_direction_10m),
          )
        )
          throw new Error('Data angin tidak valid');
        data = result;
        if (windCache.size >= 8) windCache.delete(windCache.keys().next().value!);
        windCache.set(key, { at: Date.now(), data });
        project();
        weatherStatus('wind', 'GFS · 9 sampel area · warna: biru → kuning (0–20+ m/s)');
      } catch (e) {
        if (!disposed && request === abort && !request.signal.aborted) {
          data = [];
          points = [];
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          weatherStatus('wind', 'Angin gagal dimuat. ' + String(e));
        }
      }
    };
    const moved = () => {
      project();
      clearTimeout(debounce);
      debounce = setTimeout(() => void load(), 800);
    };
    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      if (document.hidden || now - last < 33) return;
      const dt = Math.min((now - last) / 1000, 0.06);
      last = now;
      const w = canvas.width,
        h = canvas.height,
        s = useOsintWeather.getState();
      ctx.clearRect(0, 0, w, h);
      if (!points.length || map.isMoving()) return;
      const color = (speed: number) => `hsl(${195 - Math.min(speed, 20) * 7},95%,60%)`;
      if (!s.particles || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const p of points) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.v, p.u));
          ctx.strokeStyle = color(p.speed);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-12, 0);
          ctx.lineTo(12, 0);
          ctx.lineTo(5, -5);
          ctx.moveTo(12, 0);
          ctx.lineTo(5, 5);
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      for (const p of particles) {
        let u = 0,
          v = 0,
          weight = 0;
        for (const sample of points) {
          const f = 1 / Math.max(100, (p.x * w - sample.x) ** 2 + (p.y * h - sample.y) ** 2);
          u += sample.u * f;
          v += sample.v * f;
          weight += f;
        }
        u /= weight;
        v /= weight;
        const speed = Math.hypot(u, v);
        if (p.age > 100 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
          p.x = Math.random();
          p.y = Math.random();
          p.age = 0;
        }
        const x = p.x * w,
          y = p.y * h;
        p.x += (u * dt * 3) / w;
        p.y += (v * dt * 3) / h;
        p.age += dt * 20;
        ctx.strokeStyle = color(speed);
        ctx.globalAlpha = Math.min(1, p.age / 10, (100 - p.age) / 10);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + u * 0.7, y + v * 0.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    void load();
    map.on('moveend', moved);
    map.on('resize', moved);
    const unsub = useOsintWeather.subscribe((s, p) => {
      if (s.windHour !== p.windHour || s.windTime !== p.windTime) project();
    });
    animation = requestAnimationFrame(draw);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 600000);
    return () => {
      disposed = true;
      abort?.abort();
      clearTimeout(debounce);
      clearInterval(timer);
      cancelAnimationFrame(animation);
      unsub();
      map.off('moveend', moved);
      map.off('resize', moved);
      canvas.remove();
    };
  }, [map, wind]);
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
