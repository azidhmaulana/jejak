import { filterRegionPoints, useRegion } from '../regions/regionStore';
import { readLocalToggle, persistLocalToggle } from '../../shared/stores/localToggle';
import { useEffect } from 'react';
import { create } from 'zustand';

export type HotspotSource = 'firms' | 'sipongi';
export type Hotspot = {
  id: string;
  lat: number;
  lng: number;
  time: number;
  satellite: string;
  confidence: 'low' | 'medium' | 'high' | 'unknown';
  frp: number | null;
  place: string;
  providers: HotspotSource[];
};
export type HotspotProvider = {
  id: string;
  name: string;
  kind: 'points' | 'image';
  active: boolean;
  configured: boolean;
  url: string;
};
type SourceStatus = { status: string; fetchedAt?: number; unavailable?: string[] };
type DayResult = { items: Hotspot[]; sources: Record<string, SourceStatus> };
const day = (time: number) => new Date(time).toISOString().slice(0, 10);
export const useHotspots = create<{
  enabled: boolean;
  mode: 'recent' | 'history';
  hours: number;
  loadedHours: number;
  source: 'all' | HotspotSource;
  items: Hotspot[];
  selected: Hotspot | null;
  providers: HotspotProvider[];
  start: string;
  end: string;
  days: string[];
  frame: number;
  cumulative: boolean;
  playing: boolean;
  confidence: string;
  satellite: string;
  loading: boolean;
  completed: number;
  total: number;
  error: boolean;
  cancelled: boolean;
  statuses: Record<string, SourceStatus>;
  loaded: boolean;
}>(() => ({
  enabled: readLocalToggle('jejak-hotspots-enabled', true),
  mode: 'recent',
  hours: 24,
  loadedHours: 24,
  source: 'all',
  items: [],
  selected: null,
  providers: [],
  start: '',
  end: '',
  days: [],
  frame: 0,
  cumulative: false,
  playing: false,
  confidence: 'all',
  satellite: 'all',
  loading: false,
  completed: 0,
  total: 0,
  error: false,
  cancelled: false,
  statuses: {},
  loaded: false,
}));
let pending: AbortController | null = null;
export async function loadHotspotProviders() {
  const response = await fetch('/api/hotspots/sources', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('sources');
  const data = await response.json();
  useHotspots.setState({ providers: data.sources });
  return data.sources as HotspotProvider[];
}
export function cancelHotspots() {
  pending?.abort();
  pending = null;
  useHotspots.setState((s) => ({
    loading: false,
    playing: false,
    cancelled: s.completed < s.total,
  }));
}
export async function searchHotspots(start?: string, end?: string) {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const state = useHotspots.getState(),
    history = Boolean(start && end);
  const now = Date.now(),
    minimum = history ? Date.parse(start!) : now - state.hours * 3600000;
  const maximum = history ? Date.parse(end!) + 86400000 - 1 : now;
  if (
    ![minimum, maximum].every(Number.isFinite) ||
    minimum > maximum ||
    (history && end! > day(now)) ||
    maximum - minimum >= 31 * 86400000 ||
    minimum > now ||
    day(minimum) < '2000-01-01'
  ) {
    pending = null;
    useHotspots.setState({ error: true, loading: false, playing: false });
    return;
  }
  const days: string[] = [];
  for (let t = Date.parse(day(minimum)); t <= Math.min(maximum, now); t += 86400000)
    days.push(day(t));
  useHotspots.setState({
    mode: history ? 'history' : 'recent',
    loadedHours: state.hours,
    enabled: true,
    loading: true,
    error: false,
    cancelled: false,
    playing: false,
    selected: null,
    items: [],
    days,
    start: day(minimum),
    end: day(maximum),
    frame: 0,
    completed: 0,
    total: days.length,
    statuses: {},
    loaded: false,
  });
  const events = new Map<string, Hotspot>(),
    statuses: Record<string, SourceStatus> = {};
  try {
    const providers = await loadHotspotProviders();
    if (pending !== controller) return;
    for (let i = 0; i < days.length; i++) {
      const response = await fetch(
        `/api/hotspots?${new URLSearchParams({ day: days[i], source: state.source })}`,
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]) },
      );
      if (!response.ok) throw Error('source');
      const result: DayResult = await response.json();
      if (pending !== controller) return;
      for (const [id, value] of Object.entries(result.sources)) {
        if (value.status !== 'ok' || !statuses[id]) statuses[id] = value;
      }
      const active = new Set(providers.filter((p) => p.active).map((p) => p.id));
      for (const item of result.items)
        if (
          item.time >= minimum &&
          item.time <= maximum &&
          item.providers.some((p) => active.has(p))
        )
          events.set(item.id, item);
      useHotspots.setState({
        items: [...events.values()],
        completed: i + 1,
        frame: i,
        statuses: { ...statuses },
      });
    }
    useHotspots.setState({ loaded: true });
  } catch {
    if (!controller.signal.aborted && pending === controller) useHotspots.setState({ error: true });
  } finally {
    if (pending === controller) {
      useHotspots.setState({ loading: false });
      pending = null;
    }
  }
}
export function visibleHotspots(state = useHotspots.getState(), region = useRegion.getState()) {
  if (!state.enabled) return [];
  const active = new Set(state.providers.filter((p) => p.active).map((p) => p.id));
  const selectedDay = state.days[state.frame];
  return filterRegionPoints(state.items.filter(
    (item) =>
      item.providers.some((p) => active.has(p) && (state.source === 'all' || p === state.source)) &&
      (state.confidence === 'all' || item.confidence === state.confidence) &&
      (state.satellite === 'all' || item.satellite === state.satellite) &&
      (state.mode !== 'history' ||
        (selectedDay &&
          (state.cumulative ? day(item.time) <= selectedDay : day(item.time) === selectedDay))),
  ), region);
}
export function useHotspotPolling() {
  const enabled = useHotspots((s) => s.enabled);
  useEffect(() => {
    if (!enabled) {
      cancelHotspots();
      return;
    }
    const initial = useHotspots.getState();
    if (initial.mode === 'recent' && !initial.items.length && !initial.loaded && !initial.loading) void searchHotspots();
    const timer = window.setInterval(() => {
      const s = useHotspots.getState();
      if (s.mode === 'recent' && !s.loading) void searchHotspots();
    }, 600000);
    return () => clearInterval(timer);
  }, [enabled]);
}

persistLocalToggle(useHotspots, 'enabled', 'jejak-hotspots-enabled');
