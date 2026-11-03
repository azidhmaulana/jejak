import { useEffect, useState } from 'react';
import type { Map as LibreMap } from 'maplibre-gl';
import { EMPTY_MAP_STYLE, getMapProvider, onlineBrands } from './mapProviders';
import { googleViewportUrl, resolveOnlineMap, type OnlineMapResult } from './onlineMapService';

export function useOnlineMap(id: string, key: string, enabled: boolean) {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<
    OnlineMapResult & { token: string; loading: boolean; error: string }
  >({
    token: '',
    style: EMPTY_MAP_STYLE,
    loading: false,
    error: '',
  });
  const token = JSON.stringify([id, key, enabled, attempt]);
  const needsKey =
    enabled &&
    Boolean(onlineBrands.find((brand) => brand.id === getMapProvider(id)?.brand)?.needsKey) &&
    !key;
  useEffect(() => {
    const controller = new AbortController();
    let renewal: ReturnType<typeof setTimeout>;
    setState({ token, style: EMPTY_MAP_STYLE, loading: enabled && !needsKey, error: '' });
    if (enabled && !needsKey)
      void resolveOnlineMap(
        id,
        key,
        AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          setState({ token, ...result, loading: false, error: '' });
          if (result.expiry)
            renewal = setTimeout(
              () => retry((value) => value + 1),
              Math.max(1000, result.expiry - Date.now() - 60000),
            );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({
              token,
              style: EMPTY_MAP_STYLE,
              loading: false,
              error: 'Could not load map. Check connection, API key and provider quota.',
            });
        });
    return () => {
      controller.abort();
      clearTimeout(renewal);
    };
  }, [token]);
  const current =
    state.token === token
      ? state
      : { style: EMPTY_MAP_STYLE, loading: enabled && !needsKey, error: '', session: undefined };
  return { ...current, needsKey, retry: () => retry((value) => value + 1) };
}

export function useGoogleCopyright(map: LibreMap | null, session: string | undefined, key: string) {
  const [copyright, setCopyright] = useState('');
  useEffect(() => {
    setCopyright('');
    if (!map || !session) return;
    let controller: AbortController | undefined;
    let stopped = false;
    const update = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const b = map.getBounds();
      try {
        const response = await fetch(
          googleViewportUrl(session, key, map.getZoom(), {
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          }),
          { signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) },
        );
        if (!response.ok) return;
        const result = await response.json();
        if (!stopped && !request.signal.aborted && typeof result.copyright === 'string')
          setCopyright(result.copyright);
      } catch {
        /* Keep the last attribution until the next viewport update. */
      }
    };
    void update();
    map.on('moveend', update);
    return () => {
      stopped = true;
      controller?.abort();
      map.off('moveend', update);
    };
  }, [map, session, key]);
  return copyright;
}
