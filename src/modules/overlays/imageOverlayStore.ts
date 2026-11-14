import { overlayApiUrl } from '../maps/mapWorkspace';
import { useAuth } from '../../features/auth/authStore';
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
function hiddenStorageKey() {
  const user = useAuth.getState().user;
  return user ? `jejak-hidden-overlays:${user.id}` : null;
}
function readHiddenOverlays(): string[] {
  try {
    const key = hiddenStorageKey();
    const value: unknown = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export const useOverlays = create<{
  items: Overlay[];
  draft: Overlay | null;
  open: boolean;
  hidden: string[];
  error: string;
  editable: boolean;
  viewport?: { west: number; east: number; south: number; north: number };
}>(() => ({ items: [], draft: null, open: false, hidden: readHiddenOverlays(), error: '', editable: false }));
export async function overlayRequest(id = '', method = 'GET', body?: unknown) {
  const owner = useAuth.getState().user;
  if (!owner?.permissions.includes('objects.write')) return;
  const r = await fetch(overlayApiUrl + (id ? '/' + id : ''), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Overlay request failed');
  const current = useAuth.getState().user;
  if (current?.id === owner.id && current.permissions.includes('objects.write'))
    useOverlays.setState({ items: data.items, error: '' });
}
useAuth.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || !state.user?.permissions.includes('objects.write'))
    useOverlays.setState({
      items: [],
      draft: null,
      open: false,
      hidden: readHiddenOverlays(),
      error: '',
      editable: false,
    });
});
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

useOverlays.subscribe((state, previous) => {
  const key = hiddenStorageKey();
  if (!key || state.hidden === previous.hidden) return;
  try {
    localStorage.setItem(key, JSON.stringify(state.hidden));
  } catch {
    // Visibility still works when storage is blocked.
  }
});
