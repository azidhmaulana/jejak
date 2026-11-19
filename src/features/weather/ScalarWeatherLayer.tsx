import { useMapTools } from '../../modules/drawing/mapToolsStore';
import { useEffect, useState } from 'react';
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useOsintWeather } from './osintWeatherStore';
import { useScalarWeather } from './scalarWeatherStore';
import {
  sampleScalar,
  scalarFields,
  scalarRgb,
  validScalarGrid,
  type ScalarGrid,
} from './scalarWeather';
import { pressureContours, pressureCenters } from './pressureContours';
const cache = new Map<string, { grid: ScalarGrid; expires: number }>();
const id = 'jejak-weather-scalar',
  contours = id + '-isobars';
function gridCanvas(grid: ScalarGrid) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!,
    img = ctx.createImageData(1024, 1024),
    stops = scalarFields[grid.field].stops;
  const min = stops[0][0],
    max = stops[stops.length - 1][0],
    palette = Array.from({ length: 256 }, (_, i) =>
      scalarRgb(grid.field, min + ((max - min) * i) / 255),
    );
  for (let y = 0; y < 1024; y++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / 1024))) * 180) / Math.PI;
    for (let x = 0; x < 1024; x++) {
      const value = sampleScalar(grid, ((x + 0.5) / 1024) * 360 - 180, lat);
      if (value === null) continue;
      const color =
          palette[Math.round(Math.max(0, Math.min(255, ((value - min) / (max - min)) * 255)))],
        i = (y * 1024 + x) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
export default function ScalarWeatherLayer({ map }: { map: MapLibreMap | null }) {
  const field = useOsintWeather((s) => s.scalarField),
    hour = useScalarWeather((s) => s.hour),
    retry = useScalarWeather((s) => s.retry);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!field) return;
    const timer = setInterval(() => {
      if (!document.hidden) setRefresh((n) => n + 1);
    }, 20 * 60000);
    return () => clearInterval(timer);
  }, [field]);
  useEffect(() => {
    if (!map || !field) return;
    let disposed = false,
      installing = false,
      grid: ScalarGrid | null = null,
      canvas: HTMLCanvasElement | null = null,
      tiles: string | null = null;
    let pressure: ReturnType<typeof pressureContours> | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    useScalarWeather.setState({ loading: true, error: false, grid: null, sample: null });
    const install = () => {
      if (
        disposed ||
        installing ||
        (!map.getSource(id) && !map.isStyleLoaded()) ||
        (!canvas && !tiles)
      )
        return;
      installing = true;
      try {
        if (!map.getSource(id)) {
          if (tiles)
            map.addSource(id, {
              type: 'raster',
              tiles: [tiles],
              tileSize: 256,
              maxzoom: 7,
              attribution: 'NASA GIBS / Aqua MODIS',
            });
          else
            map.addSource(id, {
              type: 'canvas',
              canvas: canvas!,
              animate: false,
              coordinates: [
                [-180, 85.05112878],
                [180, 85.05112878],
                [180, -85.05112878],
                [-180, -85.05112878],
              ],
            });
        }
        const anchor = map
          .getStyle()
          .layers?.find(
            (l) =>
              l.id !== id &&
              !l.id.startsWith(contours) &&
              (l.id === 'jejak-wind-flow' ||
                l.type === 'symbol' ||
                l.type === 'circle' ||
                /jejak-(province|route)|terra-draw/.test(l.id)),
          )?.id;
        if (!map.getLayer(id))
          map.addLayer(
            {
              id,
              type: 'raster',
              source: id,
              paint: {
                'raster-opacity': useScalarWeather.getState().opacity,
                'raster-fade-duration': 0,
              },
            },
            anchor,
          );
        if (pressure) {
          if (!map.getSource(contours + '-centers') && grid)
            map.addSource(contours + '-centers', { type: 'geojson', data: pressureCenters(grid) });
          if (!map.getLayer(contours + '-centers'))
            map.addLayer(
              {
                id: contours + '-centers',
                type: 'symbol',
                source: contours + '-centers',
                layout: { 'text-field': ['get', 'label'], 'text-size': 20 },
                paint: {
                  'text-color': ['match', ['get', 'label'], 'L', '#ffd3c5', '#fff'],
                  'text-halo-color': '#14382e',
                  'text-halo-width': 2,
                },
              },
              anchor,
            );
          if (!map.getSource(contours))
            map.addSource(contours, { type: 'geojson', data: pressure });
          if (!map.getLayer(contours))
            map.addLayer(
              {
                id: contours,
                type: 'line',
                source: contours,
                paint: { 'line-color': '#f3f6e9', 'line-opacity': 0.75, 'line-width': 1 },
              },
              anchor,
            );
          if (!map.getLayer(contours + '-labels'))
            map.addLayer(
              {
                id: contours + '-labels',
                type: 'symbol',
                source: contours,
                layout: {
                  'symbol-placement': 'line',
                  'text-field': ['to-string', ['get', 'pressure']],
                  'text-size': 10,
                  'symbol-spacing': 250,
                },
                paint: { 'text-color': '#fff', 'text-halo-color': '#17352b', 'text-halo-width': 1 },
              },
              anchor,
            );
        }
      } finally {
        installing = false;
      }
    };
    const loaded = () => {
      if (!disposed && !map.getLayer(id)) install();
      if (!disposed && tiles && map.getSource(id) && map.isSourceLoaded(id))
        useScalarWeather.setState({ loading: false });
    };
    const error = (e: unknown) => {
      if ((e as { sourceId?: string }).sourceId === id && !disposed)
        useScalarWeather.setState({ loading: false, error: true });
    };
    map.on('styledata', install);
    map.on('idle', install);
    map.on('sourcedata', loaded);
    map.on('error', error);
    const click = (e: MapMouseEvent) => {
      if (!['render', 'select'].includes(useMapTools.getState().mode)) return;
      const overlays = map
        .queryRenderedFeatures(e.point)
        .some(
          (f) =>
            f.layer.id !== id &&
            !f.layer.id.startsWith(contours) &&
            /camera|hotspot|earthquake|cyclone|terra-draw/i.test(f.layer.id),
        );
      if (overlays || !grid) return;
      useScalarWeather.setState({
        sample: {
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          value: sampleScalar(grid, e.lngLat.lng, e.lngLat.lat),
        },
      });
    };
    map.on('click', click);
    const unsubscribe = useScalarWeather.subscribe((s, p) => {
      if (s.opacity !== p.opacity && map.getLayer(id))
        map.setPaintProperty(id, 'raster-opacity', s.opacity);
    });
    const requestTimer = setTimeout(() => {
      void (async () => {
        try {
          if (field === 'surface') {
            const response = await fetch('/api/weather/surface', { signal: controller.signal });
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (disposed) return;
            if (
              typeof data.tiles !== 'string' ||
              !data.tiles.startsWith('https://gibs.earthdata.nasa.gov/wmts/') ||
              !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
            )
              throw new Error();
            tiles = data.tiles;
            useScalarWeather.setState({ surfaceDate: data.date });
            install();
          } else {
            const key = `${field}:${hour}`,
              hit = cache.get(key);
            if (hit && hit.expires > Date.now()) grid = hit.grid;
            else {
              const response = await fetch(`/api/weather/fields/${field}?hour=${hour}`, {
                signal: controller.signal,
              });
              if (!response.ok) throw new Error();
              const data = await response.json();
              if (!validScalarGrid(data) || data.field !== field) throw new Error();
              grid = data;
              cache.set(key, { grid: data, expires: Date.now() + 5 * 60000 });
              while (cache.size > 8) cache.delete(cache.keys().next().value!);
            }
            if (disposed || !grid) return;
            canvas = gridCanvas(grid);
            if (field === 'pressure') pressure = pressureContours(grid);
            useScalarWeather.setState({ grid, loading: false });
            install();
          }
        } catch {
          if (!disposed) useScalarWeather.setState({ error: true, loading: false });
        } finally {
          clearTimeout(timeout);
        }
      })();
    }, 250);
    return () => {
      clearTimeout(requestTimer);
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
      unsubscribe();
      map.off('styledata', install);
      map.off('idle', install);
      map.off('sourcedata', loaded);
      map.off('error', error);
      map.off('click', click);
      for (const layer of [contours + '-labels', contours + '-centers', contours, id])
        if (map.getLayer(layer)) map.removeLayer(layer);
      for (const source of [contours + '-centers', contours, id])
        if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, field, hour, retry, refresh]);
  return null;
}
