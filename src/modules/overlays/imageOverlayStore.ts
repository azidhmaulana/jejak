import { overlayApiUrl } from '../maps/mapWorkspace';
import { create } from 'zustand';
import { MercatorCoordinate } from 'maplibre-gl';
export type Overlay = {
  id: string;
  revision: string;
  name: string;
  description: string;
  image: string;
  west: number;
  east: number;
  south: number;
  north: number;
  rotation: number;
  opacity: number;
  locked: boolean;
};
export const useOverlays = create<{
  items: Overlay[];
  draft: Overlay | null;
  open: boolean;
  hidden: string[];
  error: string;
  editable: boolean;
  viewport?: { west: number; east: number; south: number; north: number };
}>(() => ({ items: [], draft: null, open: false, hidden: [], error: '', editable: false }));
export async function overlayRequest(id = '', method = 'GET', body?: unknown) {
  const r = await fetch(overlayApiUrl + (id ? '/' + id : ''), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Overlay request failed');
  useOverlays.setState({ items: data.items, error: '' });
}
type Corners = [[number, number], [number, number], [number, number], [number, number]];
export function corners(o: Overlay): Corners {
  const a = MercatorCoordinate.fromLngLat([o.west, o.north]),
    b = MercatorCoordinate.fromLngLat([o.east, o.south]),
    cx = (a.x + b.x) / 2,
    cy = (a.y + b.y) / 2,
    r = (o.rotation * Math.PI) / 180;
  return [
    [a.x, a.y],
    [b.x, a.y],
    [b.x, b.y],
    [a.x, b.y],
  ].map(([x, y]) => {
    const p = new MercatorCoordinate(
      cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r),
      cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r),
    ).toLngLat();
    return [p.lng, p.lat];
  }) as Corners;
}
