import { useEffect, useRef, type RefObject } from 'react';

const memoryVisitor: string = crypto.randomUUID();
let memorySession: string = crypto.randomUUID();
function identity(storage: Storage, key: string, fallback: string) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    storage.setItem(key, fallback);
  } catch {
    /* Private browsing may disable storage. */
  }
  return fallback;
}
export function track(kind: string, camera?: string, seconds?: number) {
  if (navigator.doNotTrack === '1') return;
  let visitor = memoryVisitor,
    session = memorySession;
  try {
    visitor = identity(localStorage, 'jejak.analytics.visitor', memoryVisitor);
    const last = Number(sessionStorage.getItem('jejak.analytics.last') || 0);
    if (Date.now() - last > 30 * 60000) {
      memorySession = crypto.randomUUID();
      sessionStorage.removeItem('jejak.analytics.session');
    }
    sessionStorage.setItem('jejak.analytics.last', String(Date.now()));
    session = identity(sessionStorage, 'jejak.analytics.session', memorySession);
  } catch {
    /* Use ephemeral identifiers when storage is unavailable. */
  }
  let referrer = 'direct';
  try {
    const host = new URL(document.referrer).hostname;
    if (host !== location.hostname)
      referrer = /google|bing|duckduckgo|yahoo/.test(host)
        ? 'search'
        : /facebook|instagram|twitter|t.co|youtube|tiktok/.test(host)
          ? 'social'
          : 'other';
  } catch {
    /* No referrer. */
  }
  void fetch('/api/analytics/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      visitor,
      session,
      kind,
      camera,
      seconds,
      referrer,
    }),
  }).catch(() => {});
}
export function useVisitTracking() {
  useEffect(() => {
    const start = setTimeout(() => track('visit'), 0);
    const timer = setInterval(() => {
      if (!document.hidden) track('heartbeat');
    }, 60000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, []);
}
export function useCameraTracking(
  id: string | undefined,
  status: string,
  monitor: RefObject<HTMLElement>,
) {
  const currentId = useRef(id);
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => track('camera_open', id), 0);
    return () => clearTimeout(timer);
  }, [id]);
  useEffect(() => {
    if (!id) {
      currentId.current = undefined;
      reported.current.clear();
      return;
    }
    if (currentId.current !== id) {
      currentId.current = id;
      reported.current.clear();
      return;
    }
    if (reported.current.has(status)) return;
    reported.current.add(status);
    if (['LIVE', 'REKAMAN', 'SNAPSHOT'].includes(status)) track('camera_play', id);
    if (status === 'STREAM TIDAK TERSEDIA') track('camera_error', id);
  }, [id, status]);
  useEffect(() => {
    if (!id) return;
    let seconds = 0,
      previous = -1;
    const timer = setInterval(() => {
      const video = monitor.current?.querySelector('video');
      if (
        video &&
        !document.hidden &&
        !video.paused &&
        video.readyState >= 2 &&
        video.currentTime !== previous
      )
        seconds++;
      previous = video?.currentTime ?? -1;
      if (seconds >= 30) {
        track('watch', id, 30);
        seconds = 0;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [id, monitor]);
}
