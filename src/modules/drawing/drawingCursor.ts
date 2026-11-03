import type { Map as LibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Drawing } from './mapToolsStore';
import { drawingCursorMeasurement } from './mapMeasurements';

/** Transient readout: stays by the pointer and never becomes saved map geometry. */
export function createDrawingCursor(map: LibreMap) {
  const element = document.createElement('div');
  element.className = 'map-drawing-cursor';
  element.setAttribute('role', 'tooltip');
  element.setAttribute('aria-label', 'Ukuran gambar');
  element.hidden = true;
  map.getContainer().append(element);
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  const position = () => {
    frame = 0;
    element.hidden = !pointer || !element.textContent;
    if (element.hidden || !pointer) return;
    const canvas = map.getCanvas();
    const width = element.offsetWidth,
      height = element.offsetHeight;
    // Flip beside the pointer near an edge, then clamp for small hybrid panels.
    const x = pointer.x + width + 16 > canvas.clientWidth ? pointer.x - width - 16 : pointer.x + 16;
    const y =
      pointer.y + height + 20 > canvas.clientHeight ? pointer.y - height - 16 : pointer.y + 20;
    element.style.left = `${Math.max(4, Math.min(x, canvas.clientWidth - width - 4))}px`;
    element.style.top = `${Math.max(4, Math.min(y, canvas.clientHeight - height - 4))}px`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(position);
  };
  const move = (event: MapMouseEvent) => {
    pointer = event.point;
    schedule();
  };
  const leave = () => {
    pointer = null;
    element.hidden = true;
  };
  map.on('mousemove', move);
  map.on('resize', schedule);
  map.getCanvas().addEventListener('mouseleave', leave);
  return {
    update(feature: Drawing | null) {
      element.textContent = drawingCursorMeasurement(feature);
      if (!element.textContent) element.hidden = true;
      schedule();
    },
    destroy() {
      cancelAnimationFrame(frame);
      map.off('mousemove', move);
      map.off('resize', schedule);
      map.getCanvas().removeEventListener('mouseleave', leave);
      element.remove();
    },
  };
}
