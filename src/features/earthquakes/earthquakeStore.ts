import { create } from 'zustand';
import { useEffect } from 'react';

export interface Earthquake {
  id: string; time: number; lat: number; lng: number; magnitude: number; depth: number;
  place: string; source: string; felt: string; potential: string; url: string; shakemap: string;
}
interface Result {
  total?: number; scanned?: number; items: Earthquake[]; latest: Earthquake | null; hasMore: boolean; historyUnavailable: boolean;
  status: { bmkgUpdatedAt?: string; usgsUpdatedAt?: string; bmkgStale?: boolean; usgsStale?: boolean };
}
type Mode = 'latest' | 'recent' | 'history';
export const useEarthquakes = create<{
  live: Earthquake[]; latest: Earthquake | null; history: Earthquake[]; status: Result['status']; enabled: boolean;
  mode: Mode; selected: Earthquake | null; loading: boolean; error: boolean;
  loaded: number; total: number | null; liveError: boolean; partial: boolean; hasMore: boolean; start: string; end: string; page: number; minMagnitude: number;
}>(() => ({ live: [], latest: null, history: [], status: {}, enabled: true, mode: 'recent', selected: null,
  loaded: 0, total: null, loading: false, error: false, liveError: false, partial: false, hasMore: false, start: '', end: '', page: 0, minMagnitude: 0 }));
let pending: AbortController | null = null;
async function read(url: string, signal?: AbortSignal): Promise<Result> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error('Earthquake request failed');
  return response.json();
}
export function useEarthquakePolling() {
  useEffect(() => {
    let stopped = false, busy = false;
    const controller = new AbortController();
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await read('/api/earthquakes', AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
        if (!stopped) useEarthquakes.setState({ live: result.items, latest: result.latest, status: result.status, liveError: false });
      } catch { if (!stopped) useEarthquakes.setState({ liveError: true }); }
      finally { busy = false; }
    };
    void poll(); const timer = setInterval(poll, 60000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, []);
}
export async function searchEarthquakes(start: string, end: string, more = false, minMagnitude = useEarthquakes.getState().minMagnitude) {
  pending?.abort(); const controller = new AbortController(); pending = controller;
  const state = useEarthquakes.getState(); let page = more ? state.page + 1 : 0;
  let items = more ? state.history : []; let loaded = more ? state.loaded : 0;
  useEarthquakes.setState({ mode: 'history', loading: true, error: false, start, end, minMagnitude,
    ...(!more ? { history: [], loaded: 0, total: null, selected: null, hasMore: false, partial: false } : {}) });
  try {
    do {
    const result = await read(`/api/earthquakes?${new URLSearchParams({ start, end, page: String(page), minMagnitude: String(minMagnitude) })}`, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
    if (controller.signal.aborted) return;
    if (result.historyUnavailable) {
      useEarthquakes.setState({ partial: true, loading: false });
      return;
    }
    items = [...items, ...result.items];
    loaded += result.scanned ?? result.items.filter(q => q.source === 'USGS').length;
    useEarthquakes.setState({ history: [...new Map(items.map(q => [q.id, q])).values()].sort((a, b) => b.magnitude - a.magnitude || b.time - a.time),
      hasMore: result.hasMore, partial: false, page, loaded, total: result.total ?? null, loading: result.hasMore });
    if (!result.hasMore) break;
    page++;
    } while (!controller.signal.aborted);
  } catch { if (!controller.signal.aborted) useEarthquakes.setState({ error: true, loading: false }); }
}
export function setEarthquakeMode(mode: Mode) {
  pending?.abort(); useEarthquakes.setState({ mode, loading: false, selected: null, error: false, partial: false });
}
export function visibleEarthquakes(state: ReturnType<typeof useEarthquakes.getState>) {
  return state.mode === 'history' ? state.history : state.mode === 'latest' ? (state.latest ? [state.latest] : []) : state.live;
}
export const quakeTime = (time: number, en: boolean) => new Intl.DateTimeFormat(en ? 'en-GB' : 'id-ID', {
  timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
}).format(time) + ' WIB';
