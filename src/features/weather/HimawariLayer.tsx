import { useEffect } from 'react';
import type { Map as MapLibreMap, ErrorEvent } from 'maplibre-gl';
import { useOsintWeather } from './osintWeatherStore';
import { satelliteFrame, useHimawari, useHimawariTimeline } from './himawariStore';

export default function HimawariLayer({ map }: { map: MapLibreMap | null }) {
  useHimawariTimeline();
  const enabled = useOsintWeather((state) => state.clouds);
  useEffect(() => {
    if (!map || !enabled) return;
    const owned = new Set<string>();
    let displayed = '',
      pending = '',
      requested = '';
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const remove = (id: string) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      owned.delete(id);
    };
    const fail = () => {
      clearTimeout(timeout);
      const failed = pending;
      pending = '';
      if (failed) remove(failed);
      useHimawari.setState({ loading: false, tileError: true, playing: false });
    };
    const render = () => {
      if (!map.getStyle()?.layers) return;
      const state = useHimawari.getState(),
        frame = satelliteFrame(state);
      if (!frame) {
        clearTimeout(timeout);
        for (const id of owned) remove(id);
        displayed = pending = requested = '';
        if (state.displayed || state.loading)
          useHimawari.setState({ displayed: null, loading: false });
        return;
      }
      if (displayed && map.getLayer(displayed))
        map.setPaintProperty(displayed, 'raster-opacity', state.opacity);
      const product = frame.id.startsWith('h') ? 'ir' : state.product;
      const key = frame.id + '-' + product;
      if (requested === key) return;
      requested = key;
      if (pending) remove(pending);
      clearTimeout(timeout);
      pending = `jejak-himawari-${frame.id}-${product}`;
      if (pending === displayed) {
        pending = '';
        useHimawari.setState({ loading: false });
        return;
      }
      useHimawari.setState({ loading: true, tileError: false });
      owned.add(pending);
      map.addSource(pending, {
        type: 'raster',
        tiles: [
          `${location.origin}/api/weather/himawari/tiles/${frame.id}/{z}/{x}/{y}.jpg?product=${product}`,
        ],
        tileSize: 256,
        minzoom: 3,
        maxzoom: 5,
        bounds: [80, -60, 179.99, 60],
        attribution: frame.id.startsWith('h')
          ? '<a href="https://www.earthdata.nasa.gov/data/tools/worldview" target="_blank" rel="noopener">Himawari infrared · JMA / NASA GIBS</a>'
          : '<a href="https://www.jma.go.jp/bosai/map.html#contents=himawari" target="_blank" rel="noopener">Himawari infrared · JMA</a>',
      });
      const before = map
        .getStyle()
        ?.layers?.find((layer) => layer.type !== 'background' && layer.type !== 'raster')?.id;
      map.addLayer(
        {
          id: pending,
          type: 'raster',
          source: pending,
          paint: {
            'raster-opacity': 0,
            'raster-saturation': frame.id.startsWith('h') ? -1 : 0,
            'raster-fade-duration': 0,
            'raster-opacity-transition': { duration: 0 },
          },
        },
        before,
      );
      timeout = setTimeout(fail, 15000);
    };
    const loaded = (event: { sourceId?: string }) => {
      if (
        !pending ||
        event.sourceId !== pending ||
        !map.getSource(pending) ||
        !map.isSourceLoaded(pending)
      )
        return;
      clearTimeout(timeout);
      const old = displayed;
      displayed = pending;
      pending = '';
      map.setPaintProperty(displayed, 'raster-opacity', useHimawari.getState().opacity);
      if (old && old !== displayed) remove(old);
      useHimawari.setState({
        loading: false,
        tileError: false,
        displayed: displayed.replace('jejak-himawari-', '').replace(/-(auto|visible|ir)$/, ''),
      });
    };
    const error = (event: ErrorEvent & { sourceId?: string }) => {
      if (event.sourceId === pending && pending) fail();
    };
    const style = () => {
      clearTimeout(timeout);
      owned.clear();
      displayed = '';
      pending = '';
      requested = '';
      useHimawari.setState({ displayed: null });
      render();
    };
    const unsubscribe = useHimawari.subscribe((state, previous) => {
      if (state.mode !== previous.mode) {
        clearTimeout(timeout);
        for (const id of owned) remove(id);
        displayed = pending = requested = '';
        useHimawari.setState({ displayed: null, loading: false, tileError: false });
      }
      if (state.revision !== previous.revision) requested = '';
      if (
        state.product !== previous.product ||
        state.revision !== previous.revision ||
        state.mode !== previous.mode ||
        state.historyFrame !== previous.historyFrame ||
        state.frames !== previous.frames ||
        state.index !== previous.index ||
        state.hours !== previous.hours ||
        state.opacity !== previous.opacity
      )
        render();
    });
    map.on('sourcedata', loaded);
    map.on('error', error);
    map.on('style.load', style);
    render();
    return () => {
      unsubscribe();
      clearTimeout(timeout);
      map.off('sourcedata', loaded);
      map.off('error', error);
      map.off('style.load', style);
      for (const id of owned) remove(id);
      useHimawari.setState({ loading: false, displayed: null });
    };
  }, [map, enabled]);
  return null;
}
