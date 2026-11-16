import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

type Entry = { source: string; compact: boolean; visible: boolean };
const entries = new Map<symbol, Entry>();
const listeners = new Set<() => void>();
let allowed = new Set<symbol>();
function update() {
  const next = new Set<symbol>();
  if (!document.hidden) {
    const mains = [...entries].filter(([, e]) => e.visible && !e.compact);
    mains.forEach(([key]) => next.add(key));
    const sources = new Set(mains.map(([, e]) => e.source));
    let budget = window.innerWidth <= 700 ? (mains.length ? 0 : 1) : 3;
    for (const [key, entry] of entries) {
      if (!entry.compact || !entry.visible || sources.has(entry.source) || budget <= 0) continue;
      next.add(key);
      sources.add(entry.source);
      budget--;
    }
  }
  allowed = next;
  listeners.forEach((notify) => notify());
}
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
export function useStreamActivity(host: RefObject<HTMLElement>, source: string, compact: boolean) {
  const key = useRef(Symbol('stream'));
  const active = useSyncExternalStore(
    subscribe,
    () => allowed.has(key.current),
    () => false,
  );
  useEffect(() => {
    const token = key.current;
    entries.set(token, { source, compact, visible: false });
    const observer = new IntersectionObserver(([entry]) => {
      const item = entries.get(token);
      if (item) item.visible = entry.isIntersecting;
      update();
    });
    if (host.current) observer.observe(host.current);
    if (entries.size === 1) {
      document.addEventListener('visibilitychange', update);
      window.addEventListener('resize', update);
    }
    update();
    return () => {
      observer.disconnect();
      entries.delete(token);
      if (entries.size === 0) {
        document.removeEventListener('visibilitychange', update);
        window.removeEventListener('resize', update);
      }
      update();
    };
  }, [host, source, compact]);
  return active;
}
