import { useEffect, useState } from 'react';
import { Marker, type Map } from 'maplibre-gl';
import { useCyclones, loadCyclones } from './cycloneStore';
import { useWorkspace } from '../osint/workspaceStore';
import './Cyclones.css';
export default function CycloneLayer({ map }: { map: Map | null }) {
  const { enabled, items, selected } = useCyclones();
  type TrackPoint = {
    time: number;
    lat: number;
    lng: number;
    windKnots: number | null;
    pressureHpa?: number | null;
  };
  const [history, setHistory] = useState<{ id: string; points: TrackPoint[] }>({
    id: '',
    points: [],
  });
  useEffect(() => {
    setHistory({ id: '', points: [] });
    useCyclones.setState({
      historyStatus: 'idle',
      historyCount: 0,
    });
    if (!enabled || !selected) return;
    useCyclones.setState({ historyStatus: 'loading' });
    const controller = new AbortController();
    void fetch(`/api/weather/cyclones/${encodeURIComponent(selected)}/history`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.id !== selected || !Array.isArray(data.points) || data.points.length > 240)
          throw new Error();
        const points = data.points.filter(
          (p: TrackPoint) =>
            Number.isFinite(p.time) &&
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) &&
            Math.abs(p.lat) <= 90 &&
            Math.abs(p.lng) <= 180 &&
            (p.windKnots === null ||
              (Number.isFinite(p.windKnots) && p.windKnots >= 0 && p.windKnots <= 250)),
        );
        setHistory({ id: selected, points });
        useCyclones.setState({
          historyStatus: points.length ? 'ready' : 'empty',
          historyCount: points.length,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) useCyclones.setState({ historyStatus: 'error' });
      });
    return () => controller.abort();
  }, [enabled, selected]);
  useEffect(() => {
    if (!enabled) return;
    void loadCyclones();
    const timer = setInterval(() => {
      if (!document.hidden) void loadCyclones();
    }, 10 * 60000);
    return () => clearInterval(timer);
  }, [enabled]);
  useEffect(() => {
    if (!map || !enabled) return;
    const markers = items
      .filter((c) => Date.now() - c.time <= 36 * 3600000)
      .map((c) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'cyclone-marker';
        element.dataset.selected = String(selected === c.id);
        element.setAttribute('aria-label', c.name + ' · ' + c.designation);
        const symbol = document.createElement('span');
        symbol.className = 'cyclone-marker-symbol';
        const icon = document.createElement('img');
        icon.src = '/images/weather/cyclone.svg';
        icon.alt = '';
        icon.draggable = false;
        symbol.append(icon);
        symbol.dataset.hemisphere = c.lat < 0 ? 'south' : 'north';
        symbol.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = c.name;
        element.append(symbol, label);
        element.onclick = () => {
          useCyclones.setState({ selected: c.id });
          useWorkspace.setState({ panel: 'cyclones' });
        };
        return new Marker({ element, anchor: 'center', subpixelPositioning: false })
          .setLngLat([c.lng, c.lat])
          .addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [map, enabled, items, selected]);
  useEffect(() => {
    if (!map) return;
    const focus = (e: Event) => {
      const c = useCyclones.getState().items.find((c) => c.id === (e as CustomEvent).detail);
      if (c) map.flyTo({ center: [c.lng, c.lat], zoom: 5 });
    };
    window.addEventListener('jejak-focus-cyclone', focus);
    return () => window.removeEventListener('jejak-focus-cyclone', focus);
  }, [map]);
  useEffect(() => {
    if (!map || !enabled) return;
    const storm = items.find((c) => c.id === selected);
    if (!storm) return;
    const past = history.id === storm.id ? history.points.filter((p) => p.time < storm.time) : [];
    const future = storm.forecast || [];
    if (!past.length && !future.length) return;
    const id = 'jejak-cyclone-forecast';
    const points: TrackPoint[] = [...past, storm, ...future];
    // Unwrap longitude so tracks crossing the dateline follow the short path.
    const coordinates: number[][] = [];
    for (const point of points) {
      let lng = point.lng;
      const previous = coordinates[coordinates.length - 1]?.[0] ?? lng;
      while (lng - previous > 180) lng -= 360;
      while (lng - previous < -180) lng += 360;
      coordinates.push([lng, point.lat]);
    }
    const draw = () => {
      if (!map.getStyle()?.layers || map.getSource(id)) return;
      map.addSource(id, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            ...(past.length
              ? [
                  {
                    type: 'Feature' as const,
                    properties: { kind: 'history' },
                    geometry: {
                      type: 'LineString' as const,
                      coordinates: coordinates.slice(0, past.length + 1),
                    },
                  },
                ]
              : []),
            ...(future.length
              ? [
                  {
                    type: 'Feature' as const,
                    properties: { kind: 'forecast' },
                    geometry: {
                      type: 'LineString' as const,
                      coordinates: coordinates.slice(past.length),
                    },
                  },
                ]
              : []),
          ],
        },
      });
      map.addLayer({
        id,
        type: 'line',
        source: id,
        filter: ['==', ['get', 'kind'], 'forecast'],
        paint: { 'line-color': '#fff1d0', 'line-width': 2, 'line-dasharray': [3, 3] },
      });
    };
    const labels = points.map((point, index) => {
      // Keep all track vertices; show labels at six-hour intervals plus the endpoints.
      if (
        index !== 0 &&
        index < past.length &&
        index !== points.length - 1 &&
        point.time % (6 * 3600000) !== 0
      )
        return null;
      const node = document.createElement('div');
      node.className = 'cyclone-forecast-point';
      node.dataset.kind =
        index < past.length ? 'history' : index === past.length ? 'current' : 'forecast';
      const dot = document.createElement('span');
      dot.className = 'cyclone-forecast-dot';
      const label = document.createElement('span');
      label.className = 'cyclone-forecast-label';
      const date = document.createElement('strong');
      date.textContent = new Date(point.time).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const value = document.createElement('span');
      value.textContent = `${point.windKnots ?? '-'} kt${point.pressureHpa ? ' | ' + point.pressureHpa + ' hPa' : ''}`;
      label.append(date, value);
      node.append(dot, label);
      return new Marker({
        element: node,
        anchor: 'left',
        offset: [-4, 0],
        subpixelPositioning: false,
      })
        .setLngLat(coordinates[index] as [number, number])
        .addTo(map);
    });
    const drawTracks = () => {
      draw();
      if (map.getSource(id) && !map.getLayer(id + '-history'))
        map.addLayer({
          id: id + '-history',
          type: 'line',
          source: id,
          filter: ['==', ['get', 'kind'], 'history'],
          paint: { 'line-color': '#d3d9d5', 'line-width': 2 },
        });
    };
    drawTracks();
    map.on('style.load', drawTracks);
    return () => {
      map.off('style.load', drawTracks);
      labels.forEach((label) => label?.remove());
      if (map.getLayer(id + '-history')) map.removeLayer(id + '-history');
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, enabled, items, selected, history]);
  return null;
}
