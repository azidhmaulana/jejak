import { create } from 'zustand';
import { useEffect } from 'react';
import { useOsintWeather } from './osintWeatherStore';
export type SatelliteFrame = { id: string; time: number };
export const HIMAWARI_HISTORY_ENABLED = false;
type State = {
  mode: 'recent' | 'history';
  product: 'auto' | 'visible' | 'ir' | 'blue' | 'enhanced';
  historyDate: string;
  historyFrame: SatelliteFrame | null;
  unavailable: boolean;
  frames: SatelliteFrame[];
  index: number;
  hours: number;
  opacity: number;
  playing: boolean;
  fetching: boolean;
  loading: boolean;
  error: boolean;
  tileError: boolean;
  revision: number;
  stale: boolean;
  displayed: string | null;
};
function cachedSatellite(): {frame: SatelliteFrame; product: 'blue' | 'enhanced'} | null {
  try {
    const data = JSON.parse(sessionStorage.getItem('jejak-satellite-preview-v6') || 'null');
    if (!data || !/^\d{14}$/.test(data.frame?.id) || !Number.isFinite(data.frame.time)
      || data.frame.time > Date.now() || Date.now() - data.frame.time > 24 * 3600000
      || !['blue','enhanced'].includes(data.product)) return null;
    return data;
  } catch {return null;}
}
const cached = cachedSatellite();
export function rememberSatellite(frame: SatelliteFrame, product: string) {
  if (product !== 'blue' && product !== 'enhanced') return;
  try {sessionStorage.setItem('jejak-satellite-preview-v6', JSON.stringify({frame,product}));} catch { /* Storage may be disabled. */ }
}
export const useHimawari = create<State>(() => ({
  mode: 'recent',
  product: cached?.product ?? 'auto',
  historyDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  historyFrame: null,
  unavailable: false,
  frames: cached ? [cached.frame] : [],
  index: -1,
  hours: 12,
  opacity: 1,
  playing: false,
  revision: 0,
  fetching: false,
  loading: false,
  error: false,
  tileError: false,
  stale: false,
  displayed: null,
}));
export function satelliteFrames(state = useHimawari.getState()) {
  if (state.mode === 'history') return state.historyFrame ? [state.historyFrame] : [];
  const latest = state.frames[state.frames.length - 1]?.time || 0;
  return state.frames.filter((frame) => frame.time >= latest - state.hours * 3600000);
}
export function satelliteFrame(state = useHimawari.getState()) {
  const frames = satelliteFrames(state);
  return frames[state.index < 0 ? frames.length - 1 : Math.min(state.index, frames.length - 1)];
}
const requests = new Map<string, Promise<void>>();
export function loadHimawari() {
  const { mode, historyDate } = useHimawari.getState();
  const key = mode === 'recent' ? '/frames?detail=1' : `/history?date=${encodeURIComponent(historyDate)}`;
  if (requests.has(key)) return requests.get(key)!;
  const current = () => {
    const state = useHimawari.getState();
    return state.mode === mode && (mode === 'recent' || state.historyDate === historyDate);
  };
  useHimawari.setState({ fetching: true, error: false, unavailable: false });
  const request = (async () => {
    try {
      const response = await fetch('/api/weather/himawari' + key, {
        signal: AbortSignal.timeout(15000),
      });
      if (!current()) return;
      if (response.status === 404 && mode === 'history') {
        useHimawari.setState({ unavailable: true, historyFrame: null });
        return;
      }
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (!Array.isArray(data.frames) || !data.frames.length) throw new Error('Empty timeline');
      const frames = data.frames
        .filter(
          (frame: SatelliteFrame) =>
            (mode === 'history' ? /^h\d{14}$/ : /^\d{14}$/).test(frame.id) &&
            Number.isFinite(frame.time),
        )
        .slice(-73);
      if (!frames.length) throw new Error('Invalid timeline');
      if (!current()) return;
      if (mode === 'history') {
        useHimawari.setState({ historyFrame: frames[0], index: -1, stale: false, error: false });
        return;
      }
      const state = useHimawari.getState(),
        selected = satelliteFrame(state)?.id;
      const next = { ...state, frames };
      const index =
        state.index < 0 ? -1 : satelliteFrames(next).findIndex((frame) => frame.id === selected);
      useHimawari.setState({ frames, index, stale: Boolean(data.stale), error: false });
    } catch {
      if (current()) useHimawari.setState({ error: true, playing: false });
    } finally {
      if (current()) useHimawari.setState({ fetching: false });
      requests.delete(key);
    }
  })();
  requests.set(key, request);
  return request;
}
export function useHimawariTimeline() {
  const enabled = useOsintWeather((state) => state.clouds);
  const warm = useOsintWeather((state) => state.clouds || state.rain);
  const { playing, loading, fetching, index, frames, hours, mode, historyDate } = useHimawari();
  useEffect(() => {
    if (!HIMAWARI_HISTORY_ENABLED && mode !== 'recent') {
      useHimawari.setState({
        mode: 'recent',
        index: -1,
        playing: false,
        historyFrame: null,
        unavailable: false,
        error: false,
      });
    }
  }, [mode]);
  useEffect(() => {
    if (!warm) {
      useHimawari.setState({ playing: false });
      return;
    }
    const refresh = () => {
      if (!document.hidden) void loadHimawari();
    };
    const visibility = () => {
      if (document.hidden) useHimawari.setState({ playing: false });
      else refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 120000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [warm, mode, historyDate]);
  useEffect(() => {
    if (!enabled || !playing || loading || fetching || document.hidden) return;
    if (mode === 'history') {
      const timer = setTimeout(() => {
        const next = new Date(Date.parse(historyDate) + 86400000).toISOString().slice(0, 10);
        if (next > new Date().toISOString().slice(0, 10)) {
          useHimawari.setState({ playing: false });
          return;
        }
        useHimawari.setState({ historyDate: next, historyFrame: null });
        void loadHimawari();
      }, 1800);
      return () => clearTimeout(timer);
    }
    const count = satelliteFrames().length;
    if (count < 2) return;
    const timer = setTimeout(
      () => useHimawari.setState({ index: index < 0 ? 0 : (index + 1) % count }),
      window.innerWidth <= 700 ? 1800 : 1200,
    );
    return () => clearTimeout(timer);
  }, [enabled, playing, loading, fetching, index, frames, hours, mode, historyDate]);
}
