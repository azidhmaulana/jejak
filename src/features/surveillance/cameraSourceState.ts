import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { bandungCameras } from './osintSurveillanceStore';
import { useWorkspace } from '../osint/workspaceStore';
const useSourceState = create<{ active: Record<string, boolean> }>(() => ({ active: {} }));
let sequence = 0;
export function applyCameraSourceState(sources: { name: string; active: boolean }[]) {
  sequence++;
  useSourceState.setState({
    active: Object.fromEntries(sources.map((source) => [source.name, source.active])),
  });
}
export function useCameraSourceSync() {
  const active = useSourceState((state) => state.active);
  const selectedId = useWorkspace((state) => state.selectedId);
  useEffect(() => {
    const selected = bandungCameras.find((camera) => camera.id === selectedId);
    if (selected && active[selected.provider || 'ATCS DISHUB BANDUNG'] === false)
      useWorkspace.setState({ selectedId: null });
  }, [active, selectedId]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      const current = ++sequence;
      try {
        const response = await fetch('/api/cctv-source-state', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped && current === sequence) useSourceState.setState({ active: data.active });
      } catch {
        /* Preserve the last known source settings while offline. */
      } finally {
        if (!stopped) timer = setTimeout(poll, 10000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
}
export function useActiveBundledCameras() {
  const active = useSourceState((state) => state.active);
  return useMemo(
    () =>
      bandungCameras.filter((camera) => active[camera.provider || 'ATCS DISHUB BANDUNG'] !== false),
    [active],
  );
}
