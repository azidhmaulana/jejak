import { useEffect, type RefObject } from 'react';

// Keep native dialog focus/Escape behavior while allowing bounded header dragging.
export function useDraggableDialog(dialog: RefObject<HTMLDialogElement>) {
  useEffect(() => {
    const element = dialog.current;
    const header = element?.querySelector<HTMLElement>('[data-dialog-handle]');
    if (!element || !header) return;
    let positioned = false;
    let drag: { id: number; x: number; y: number } | null = null;
    header.tabIndex = 0;
    header.title = 'Geser untuk memindahkan jendela';
    header.setAttribute(
      'aria-label',
      'Geser jendela. Tombol panah untuk memindahkan, Home untuk ke tengah.',
    );
    const move = (x: number, y: number) => {
      const rect = element.getBoundingClientRect();
      Object.assign(element.style, {
        position: 'fixed',
        margin: '0',
        right: 'auto',
        bottom: 'auto',
        left: `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`,
        top: `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`,
      });
      positioned = true;
    };
    const constrain = () => {
      if (element.open && positioned) {
        const rect = element.getBoundingClientRect();
        move(rect.left, rect.top);
      }
    };
    const end = () => {
      const id = drag?.id;
      drag = null;
      if (id !== undefined && header.hasPointerCapture(id)) header.releasePointerCapture(id);
      header.classList.remove('is-dragging');
    };
    const down = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        (event.target as Element).closest('button, input, select, textarea, a')
      )
        return;
      event.preventDefault();
      header.focus({ preventScroll: true });
      const rect = element.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
      header.classList.add('is-dragging');
    };
    const pointerMove = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) move(event.clientX - drag.x, event.clientY - drag.y);
    };
    const key = (event: KeyboardEvent) => {
      if (event.target !== header) return;
      const rect = element.getBoundingClientRect(),
        step = event.shiftKey ? 5 : 20;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (event.key === 'Home') {
        event.preventDefault();
        move((innerWidth - rect.width) / 2, (innerHeight - rect.height) / 2);
      } else if (directions[event.key]) {
        event.preventDefault();
        const [x, y] = directions[event.key];
        move(rect.left + x, rect.top + y);
      }
    };
    header.addEventListener('pointerdown', down);
    header.addEventListener('pointermove', pointerMove);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      header.addEventListener(name, end);
    header.addEventListener('keydown', key);
    window.addEventListener('resize', constrain);
    const observer = new ResizeObserver(constrain);
    observer.observe(element);
    return () => {
      end();
      observer.disconnect();
      window.removeEventListener('resize', constrain);
      header.removeEventListener('pointerdown', down);
      header.removeEventListener('pointermove', pointerMove);
      header.removeEventListener('keydown', key);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        header.removeEventListener(name, end);
    };
  }, [dialog]);
}
