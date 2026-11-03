import { useEffect, useState, useReducer, useMemo } from 'react';
import { mapProviders } from './mapProviders';
export type OfflineRegion = {
  id: string;
  name: string;
  title?: string;
  file?: string;
  bounds: [number, number, number, number];
  maxzoom: number;
  provider?: string;
  sourceDate?: string;
  mapType?: string;
  selectedVariant?: string;
  providerLabel?: string;
  attribution?: string;
  variants?: { id: string; providerLabel: string; mapType: string }[];
};
type Catalog = {
  regions: OfflineRegion[];
  activeId?: string | null;
  activeByProvider?: Record<string, string | null>;
};
export type OfflineProviderOption = { id: string; name: string; region: OfflineRegion };
export function useOfflineMap(provider?: string) {
  const [refreshKey, refresh] = useReducer((value: number) => value + 1, 0);
  const [state, setState] = useState<{ catalog: Catalog | null; error: string }>({
    catalog: null,
    error: '',
  });
  useEffect(() => {
    let stopped = false,
      timer: number | undefined;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch('/api/offline-maps/regions', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw Error('Layanan peta offline belum tersedia.');
        const result: Catalog = await response.json();
        if (!Array.isArray(result.regions)) throw Error('Invalid offline map catalog');
        if (!stopped)
          setState((previous) =>
            JSON.stringify(previous.catalog) === JSON.stringify(result) && !previous.error
              ? previous
              : { catalog: result, error: '' },
          );
      } catch {
        if (!stopped)
          setState((previous) => ({ ...previous, error: 'Layanan peta offline belum tersedia.' }));
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 3000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [refreshKey]);
  const availableProviders = useMemo(() => {
    const result: OfflineProviderOption[] = [],
      catalog = state.catalog;
    if (!catalog) return result;
    for (const item of mapProviders) {
      if (!item.offlineProvider) continue;
      const activeId = Object.prototype.hasOwnProperty.call(
        catalog.activeByProvider || {},
        item.offlineProvider,
      )
        ? catalog.activeByProvider?.[item.offlineProvider]
        : catalog.activeId;
      const region = catalog.regions.find(
        (region) =>
          region.id === activeId &&
          region.file &&
          (region.provider || 'protomaps') === item.offlineProvider,
      );
      if (region) result.push({ id: item.id, name: region.title || region.name, region });
    }
    return result;
  }, [state.catalog]);
  // Resolve stale saved selections against the current catalog without activating any OFF package.
  const selected = provider
    ? availableProviders.find((item) => (item.region.provider || 'protomaps') === provider) ||
      availableProviders[0]
    : undefined;
  return {
    region: selected?.region || null,
    selectedProviderId: selected?.id,
    availableProviders,
    loaded: Boolean(state.catalog),
    error: state.error,
    refresh,
  };
}
