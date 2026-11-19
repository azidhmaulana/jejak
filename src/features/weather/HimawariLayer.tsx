import { useEffect } from 'react';
import type { Map as MapLibreMap, ErrorEvent } from 'maplibre-gl';
import { useOsintWeather } from './osintWeatherStore';
import { satelliteFrame, rememberSatellite, useHimawari, useHimawariTimeline } from './himawariStore';

export default function HimawariLayer({ map }: { map: MapLibreMap | null }) {
  useHimawariTimeline();
  useEffect(() => {
    if (!map) return;
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
      requested = '';
      if (failed) remove(failed);
      useHimawari.setState({ loading: false, tileError: true, playing: false });
      const state = useHimawari.getState(), frame = satelliteFrame(state);
      const product = state.product === 'auto' ? 'blue' : state.product;
      if (!displayed && frame && failed !== `jejak-himawari-${frame.id}-${product}`) render();
    };
    const ensureSource = (id: string, frame: { id: string }, product: string) => {
      if (map.getSource(id)) return;
      const detailed = !frame.id.startsWith('h') && (product === 'blue' || product === 'enhanced');
      owned.add(id);
      for (const candidate of owned) {
        if (owned.size <= 4) break;
        if (candidate !== id && candidate !== pending && candidate !== displayed) remove(candidate);
      }
      map.addSource(id, {
        type: 'raster',
        tiles: [
          detailed
            ? `${location.origin}/api/weather/himawari/detail/${frame.id}/{z}/{x}/{y}.png?product=${product}&resolution=6`
            : `${location.origin}/api/weather/himawari/tiles/${frame.id}/{z}/{x}/{y}.jpg?product=${product}&composite=2`,
        ],
        tileSize: detailed ? 512 : 256,
        minzoom: 3,
        maxzoom: detailed ? 8 : 5,
        bounds: [80, -60, 179.99, 60],
        attribution:
          detailed && product === 'enhanced'
            ? '<a href="https://registry.opendata.aws/noaa-himawari/" target="_blank" rel="noopener">Himawari Band 13 / JMA / NOAA</a> / <a href="/satellite-sources.html" target="_blank" rel="noopener">IR processing</a>'
            : detailed
              ? '<a href="https://slider.cira.colostate.edu/" target="_blank" rel="noopener">Himawari / JMA / RAMMB-CIRA</a>'
              : frame.id.startsWith('h')
                ? '<a href="https://www.earthdata.nasa.gov/data/tools/worldview" target="_blank" rel="noopener">Himawari infrared · JMA / NASA GIBS</a>'
                : '<a href="https://www.jma.go.jp/bosai/map.html#contents=himawari" target="_blank" rel="noopener">Himawari / JMA</a> / <a href="/satellite-sources.html" target="_blank" rel="noopener">Satellite credits</a>',
      });
      const before = map
        .getStyle()
        ?.layers?.find(
          (layer) =>
            layer.id === 'osint-weather-rain' ||
            (layer.type !== 'background' && layer.type !== 'raster'),
        )?.id;
      map.addLayer(
        {
          id: id,
          type: 'raster',
          source: id,
          paint: {
            'raster-opacity': 0,
            'raster-saturation': frame.id.startsWith('h') ? -1 : 0,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
            'raster-opacity-transition': { duration: 0 },
          },
        },
        before,
      );
    };
    const prewarm = () => {
      const state = useHimawari.getState();
      const weather = useOsintWeather.getState();
      const frame = satelliteFrame(state);
      if (
        !weather.clouds ||
        document.hidden ||
        state.playing ||
        pending ||
        !frame ||
        frame.id.startsWith('h')
      )
        return;
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection;
      if (connection?.saveData) return;
      const other = state.product === 'enhanced' ? 'blue' : 'enhanced';
      ensureSource(`jejak-himawari-${frame.id}-${other}`, frame, other);
    };
    const render = () => {
      if (!map.getStyle()?.layers) return;
      const weather = useOsintWeather.getState();
      for (const id of owned) {
        if (map.getLayer(id))
          map.setPaintProperty(
            id,
            'raster-opacity',
            weather.clouds && id === displayed ? useHimawari.getState().opacity : 0,
          );
      }
      if (!weather.clouds && !weather.rain) return;
      const state = useHimawari.getState(),
        frame = satelliteFrame(state);
      if (!frame) {
        clearTimeout(timeout);
        if (!displayed) { for (const id of owned) remove(id); }
        pending = requested = '';
        if (state.loading) useHimawari.setState({ loading: false });
        return;
      }
      if (displayed && map.getLayer(displayed))
        map.setPaintProperty(displayed, 'raster-opacity', weather.clouds ? state.opacity : 0);
      const product = frame.id.startsWith('h')
        ? 'ir'
        : state.product === 'auto'
          ? 'blue'
          : state.product;
      const key = frame.id + '-' + product;
      if (requested === key) {
        prewarm();
        return;
      }
      // Finish the cached preview first when newer metadata arrives during startup.
      if (pending && !displayed && requested !== key) return;
      requested = key;
      pending = '';
      clearTimeout(timeout);
      pending = `jejak-himawari-${frame.id}-${product}`;
      if (pending === displayed) {
        pending = '';
        useHimawari.setState({ loading: false });
        return;
      }
      useHimawari.setState({ loading: true, tileError: false });
      if (map.getSource(pending)) {
        loaded({ sourceId: pending });
        if (pending) timeout = setTimeout(fail, 30000);
        return;
      }
      ensureSource(pending, frame, product);
      timeout = setTimeout(fail, 30000);
    };
    const viewportLoading = (event: {sourceId?: string}) => {
      if (event.sourceId !== displayed || pending || !displayed || !useOsintWeather.getState().clouds) return;
      const loading = Boolean(map.getSource(displayed)) && !map.isSourceLoaded(displayed);
      if (useHimawari.getState().loading !== loading) useHimawari.setState({loading});
    };
    const loaded = (event: { sourceId?: string }) => {
      viewportLoading(event);
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
      map.setPaintProperty(
        displayed,
        'raster-opacity',
        useOsintWeather.getState().clouds ? useHimawari.getState().opacity : 0,
      );
      if (old && old !== displayed && map.getLayer(old))
        map.setPaintProperty(old, 'raster-opacity', 0);
      owned.delete(displayed);
      owned.add(displayed);
      useHimawari.setState({
        loading: false,
        tileError: false,
        displayed: displayed
          .replace('jejak-himawari-', '')
          .replace(/-(auto|visible|ir|blue|enhanced)$/, ''),
      });
      const match = displayed.match(/^jejak-himawari-(\d{14})-(blue|enhanced)$/);
      if (match) {
        const id = match[1];
        const time = Date.parse(id.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z'));
        rememberSatellite({id,time}, match[2]);
      }
      render();
      prewarm();
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
    const unsubscribeWeather = useOsintWeather.subscribe((s, p) => {
      if (s.clouds !== p.clouds || s.rain !== p.rain) render();
    });
    map.on('sourcedataloading', viewportLoading);
    map.on('sourcedata', loaded);
    map.on('moveend', prewarm);
    map.on('error', error);
    map.on('style.load', style);
    render();
    return () => {
      unsubscribe();
      unsubscribeWeather();
      clearTimeout(timeout);
      map.off('sourcedataloading', viewportLoading);
      map.off('sourcedata', loaded);
      map.off('moveend', prewarm);
      map.off('error', error);
      map.off('style.load', style);
      for (const id of owned) remove(id);
      useHimawari.setState({ loading: false, displayed: null });
    };
  }, [map]);
  return null;
}
