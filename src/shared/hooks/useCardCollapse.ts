import { useLayoutEffect, useRef, useState } from 'react';

export function useCardCollapse(id: string, { persist = true } = {}) {
  const cardRef = useRef<HTMLElement>(null);
  const startHeight = useRef<number | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (!persist) return false;
    try {
      return JSON.parse(localStorage.getItem('bms-card-collapse') || '{}')?.[id] === true;
    } catch {
      return false;
    }
  });
  useLayoutEffect(() => {
    const card = cardRef.current,
      body = card?.ownerDocument.getElementById(`${id}-body`);
    if (!card || !body) return;
    body.hidden = collapsed;
    body.inert = collapsed;
    body.setAttribute('aria-hidden', String(collapsed));
    const from = startHeight.current;
    startHeight.current = null;
    if (from === null || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = card.getBoundingClientRect().height;
    body.hidden = false;
    const frame = (height: number) => ({
      height: `${height}px`,
      flexBasis: `${height}px`,
      minHeight: `${height}px`,
      maxHeight: `${height}px`,
      flexGrow: 0,
      flexShrink: 0,
    });
    const options = {
      duration: 220,
      easing: 'cubic-bezier(.22,.61,.36,1)',
      fill: 'forwards' as const,
    };
    const size = card.animate([frame(from), frame(to)], options);
    const content = body.animate(
      collapsed
        ? [
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 0, transform: 'translateY(-6px)' },
          ]
        : [
            { opacity: 0, transform: 'translateY(-6px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
      options,
    );
    size.onfinish = () => {
      body.hidden = collapsed;
      size.cancel();
      content.cancel();
    };
    return () => {
      size.onfinish = null;
      size.cancel();
      content.cancel();
    };
  }, [collapsed, id]);
  const toggle = () => {
    startHeight.current = cardRef.current?.getBoundingClientRect().height ?? null;
    const next = !collapsed;
    setCollapsed(next);
    if (!persist) return;
    try {
      const saved = JSON.parse(localStorage.getItem('bms-card-collapse') || '{}');
      localStorage.setItem('bms-card-collapse', JSON.stringify({ ...saved, [id]: next }));
    } catch {
      /* Collapsing still works for this session. */
    }
  };
  return { collapsed, toggle, cardRef };
}
