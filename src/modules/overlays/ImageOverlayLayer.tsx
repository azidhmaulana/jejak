import { useEffect } from 'react';
import type { Map, ImageSource, MapMouseEvent } from 'maplibre-gl';
import { corners, overlayRequest, useOverlays, type Overlay } from './imageOverlayStore';
import { useMapTools } from '../drawing/mapToolsStore';
const valid = (o: Overlay) =>
  o.image &&
  [o.west, o.east, o.south, o.north, o.rotation].every(Number.isFinite) &&
  o.west < o.east &&
  o.south < o.north;
export default function ImageOverlayLayer({
  map,
  editable = true,
}: {
  map: Map | null;
  editable?: boolean;
}) {
  useEffect(() => {
    useOverlays.setState({ editable });
    void overlayRequest().catch((e) => useOverlays.setState({ error: e.message }));
  }, [editable]);
  useEffect(() => {
    if (!map) return;
    const images = new globalThis.Map<string, string>();
    const render = () => {
      if (!map.getStyle()?.layers) return;
      const { items, draft, hidden } = useOverlays.getState();
      const list = (draft ? [...items.filter((o) => o.id !== draft.id), draft] : items).filter(
        valid,
      );
      for (const layer of map.getStyle().layers || [])
        if (
          layer.id.startsWith('image-overlay-') &&
          !list.some((o) => 'image-overlay-' + o.id === layer.id)
        ) {
          map.removeLayer(layer.id);
          if (map.getSource(layer.id)) map.removeSource(layer.id);
          images.delete(layer.id);
        }
      for (const item of list) {
        const id = 'image-overlay-' + item.id,
          coordinates = corners(item);
        const source = map.getSource(id) as ImageSource | undefined;
        if (!source) {
          map.addSource(id, { type: 'image', url: item.image, coordinates });
          const before = map
            .getStyle()
            .layers?.find((l) => l.id.startsWith('bms-drawing') || l.type === 'symbol')?.id;
          map.addLayer(
            {
              id,
              type: 'raster',
              source: id,
              paint: { 'raster-opacity': item.opacity, 'raster-fade-duration': 0 },
            },
            before,
          );
          images.set(id, item.image);
        } else if (images.get(id) !== item.image) {
          source.updateImage({ url: item.image, coordinates });
          images.set(id, item.image);
        } else source.setCoordinates(coordinates);
        map.setPaintProperty(id, 'raster-opacity', item.opacity);
        map.setLayoutProperty(id, 'visibility', hidden.includes(item.id) ? 'none' : 'visible');
      }
    };
    const hit = (o: Overlay, e: MapMouseEvent) => {
      const p = corners(o).map((c) => map.project(c));
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        if (
          p[i].y > e.point.y !== p[j].y > e.point.y &&
          e.point.x < ((p[j].x - p[i].x) * (e.point.y - p[i].y)) / (p[j].y - p[i].y) + p[i].x
        )
          inside = !inside;
      }
      return inside;
    };
    const click = (event: MapMouseEvent) => {
      const s = useOverlays.getState();
      if (s.draft || !['render', 'select'].includes(useMapTools.getState().mode)) return;
      const item = [...s.items]
        .reverse()
        .find((o) => valid(o) && !s.hidden.includes(o.id) && hit(o, event));
      if (item) {
        useOverlays.setState({ open: true, draft: { ...item }, error: '' });
      }
    };
    let drag: { item: Overlay; lng: number; lat: number; pan: boolean } | null = null;
    const down = (event: MapMouseEvent) => {
      const s = useOverlays.getState(),
        o = s.draft;
      if (
        !o ||
        o.locked ||
        !s.editable ||
        !valid(o) ||
        !hit(o, event) ||
        event.originalEvent.button !== 0
      )
        return;
      event.preventDefault();
      drag = {
        item: { ...o },
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
        pan: map.dragPan.isEnabled(),
      };
      map.dragPan.disable();
    };
    const move = (event: MapMouseEvent) => {
      if (!drag) return;
      const dx = event.lngLat.lng - drag.lng,
        dy = event.lngLat.lat - drag.lat,
        o = drag.item;
      const next = {
        ...o,
        west: o.west + dx,
        east: o.east + dx,
        south: o.south + dy,
        north: o.north + dy,
      };
      if (next.west >= -180 && next.east <= 180 && next.south >= -85 && next.north <= 85)
        useOverlays.setState({ draft: next });
    };
    const up = () => {
      if (drag?.pan) map.dragPan.enable();
      drag = null;
    };
    const viewport = () => {
      const b = map.getBounds();
      useOverlays.setState({
        viewport: {
          west: Math.max(-180, b.getWest()),
          east: Math.min(180, b.getEast()),
          south: Math.max(-85, b.getSouth()),
          north: Math.min(85, b.getNorth()),
        },
      });
    };
    viewport();
    map.on('moveend', viewport);
    const unsubscribe = useOverlays.subscribe((s, p) => {
      if (s.items !== p.items || s.draft !== p.draft || s.hidden !== p.hidden) render();
    });
    render();
    map.on('style.load', render);
    map.on('load', render);
    map.on('click', click);
    map.on('mousedown', down);
    map.on('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    return () => {
      up();
      unsubscribe();
      map.off('moveend', viewport);
      map.off('style.load', render);
      map.off('load', render);
      map.off('click', click);
      map.off('mousedown', down);
      map.off('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
    };
  }, [map]);
  return null;
}
