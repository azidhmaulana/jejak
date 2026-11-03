import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Crosshair, Lock, Pencil, Trash2, Unlock } from 'lucide-react';
import { useMapTools } from './mapToolsStore';
import { objectLocked, objectName } from './drawingObjects';

export default function DrawingContextMenu() {
  const { contextMenu: menu, controller, features } = useMapTools();
  const ref = useRef<HTMLDivElement>(null);
  const feature = features.find((f) => f.id === menu?.id);
  const close = () => useMapTools.setState({ contextMenu: null });
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
        previous?.focus();
      }
      if (e.key === 'Tab') close();
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [],
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);
  if (!menu || !feature) return null;
  const locked = objectLocked(feature);
  const run = (fn: () => void) => {
    close();
    fn();
  };
  return createPortal(
    <div
      ref={ref}
      className="map-context-menu corner-frame"
      role="menu"
      aria-label={`Aksi ${objectName(feature)}`}
      style={{
        left: Math.max(8, Math.min(menu.x, innerWidth - 208)),
        top: Math.max(8, Math.min(menu.y, innerHeight - 246)),
      }}
    >
      <strong translate="no">{objectName(feature)}</strong>
      <button
        role="menuitem"
        disabled={locked}
        onClick={() => run(() => controller?.select(feature.id!))}
      >
        <Pencil size={14} />
        Edit properti
      </button>
      <button role="menuitem" onClick={() => run(() => controller?.focusDrawing(feature.id!))}>
        <Crosshair size={14} />
        Fokus objek
      </button>
      <button role="menuitem" onClick={() => run(() => controller?.duplicate(feature.id!))}>
        <Copy size={14} />
        Duplikat
      </button>
      <button
        role="menuitem"
        onClick={() => run(() => controller?.setLocked(feature.id!, !locked))}
      >
        {locked ? <Unlock size={14} /> : <Lock size={14} />} {locked ? 'Buka kunci' : 'Kunci'}
      </button>
      <button
        role="menuitem"
        disabled={locked}
        onClick={() => run(() => controller?.remove(feature.id!))}
      >
        <Trash2 size={14} />
        Hapus
      </button>
    </div>,
    document.body,
  );
}
