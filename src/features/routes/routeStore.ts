import { create } from 'zustand';
import { api, useAuth } from '../auth/authStore';
export type TravelMode = 'car' | 'motorcycle';
export type Point = [number, number];
export type RouteResult = {
  start: Point;
  end: Point;
  tolerance: number;
  mode: TravelMode;
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
  provider: string;
  cameras: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    distanceFromRoute: number;
    distanceAlongRoute: number;
  }[];
};
let revision = 0;
export const useRoute = create<{
  open: boolean;
  picking: 'start' | 'end' | null;
  start: Point | null;
  end: Point | null;
  tolerance: number;
  mode: TravelMode;
  result: RouteResult | null;
  busy: boolean;
  error: string;
  filter: boolean;
  calculate: () => Promise<void>;
  clear: () => void;
}>((set, get) => ({
  open: false,
  picking: null,
  start: null,
  end: null,
  tolerance: 50,
  mode: 'car',
  result: null,
  busy: false,
  error: '',
  filter: false,
  calculate: async () => {
    const { start, end, tolerance, mode } = get();
    if (!start || !end) return;
    const request = ++revision;
    set({ busy: true, error: '', result: null, filter: false, picking: null });
    try {
      const result = await api<RouteResult>('/routes/calculate', 'POST', {
        start,
        end,
        tolerance,
        mode,
      });
      if (request === revision) set({ result, filter: true });
    } catch (e) {
      if (request === revision) set({ error: (e as Error).message });
    } finally {
      if (request === revision) set({ busy: false });
    }
  },
  clear: () => {
    revision++;
    set({
      result: null,
      filter: false,
      picking: null,
      busy: false,
      error: '',
      start: null,
      end: null,
    });
  },
}));
useAuth.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || !state.user?.permissions.includes('routes.use')) {
    useRoute.getState().clear();
    useRoute.setState({ open: false });
  }
});
useRoute.subscribe((state, previous) => {
  if (
    state.start !== previous.start ||
    state.end !== previous.end ||
    state.tolerance !== previous.tolerance ||
    state.mode !== previous.mode
  ) {
    revision++;
    if (state.busy || state.result) useRoute.setState({ busy: false, result: null, filter: false });
  }
});
