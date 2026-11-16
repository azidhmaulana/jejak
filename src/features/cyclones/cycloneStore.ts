import { create } from 'zustand';
import { readLocalToggle, persistLocalToggle } from '../../shared/stores/localToggle';
export type Cyclone = {
  id: string;
  name: string;
  designation: string;
  lat: number;
  lng: number;
  time: number;
  windKnots: number | null;
  gustKnots: number | null;
  direction: number | null;
  speedKnots: number | null;
  source: string;
};
export const useCyclones = create<{
  enabled: boolean;
  items: Cyclone[];
  selected: string | null;
  loading: boolean;
  error: boolean;
  feedTime: number | null;
}>(() => ({
  enabled: readLocalToggle('jejak-cyclones', false),
  items: [],
  selected: null,
  loading: false,
  error: false,
  feedTime: null,
}));
persistLocalToggle(useCyclones, 'enabled', 'jejak-cyclones');
let pending: Promise<void> | null = null;
export function loadCyclones() {
  if (pending) return pending;
  useCyclones.setState({ loading: true, error: false });
  pending = (async () => {
    try {
      const r = await fetch('/api/weather/cyclones', { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (
        !Array.isArray(data.items) ||
        data.items.length > 20 ||
        !Number.isFinite(data.feedTime) ||
        data.items.some(
          (c: Cyclone) =>
            typeof c.id !== 'string' ||
            typeof c.name !== 'string' ||
            !Number.isFinite(c.time) ||
            !Number.isFinite(c.lat) ||
            !Number.isFinite(c.lng) ||
            Math.abs(c.lat) > 90 ||
            Math.abs(c.lng) > 180 ||
            !/^https:\/\/www\.metoc\.navy\.mil\/jtwc\/products\/(wp|io|sh|ep|cp)\d{4}web\.txt$/.test(
              c.source,
            ),
        )
      )
        throw new Error();
      useCyclones.setState({ items: data.items, feedTime: data.feedTime });
    } catch {
      useCyclones.setState({ error: true, items: [] });
    } finally {
      useCyclones.setState({ loading: false });
      pending = null;
    }
  })();
  return pending;
}
