import { ScaleControl, type IControl, type Map } from 'maplibre-gl';

export const GRADUATED_SCALE_MAX_WIDTH = 160;

/** Graduated metric scale using MapLibre's projection-aware distance calculation. */
export default class GraduatedScaleControl implements IControl {
  private native = new ScaleControl({ maxWidth: GRADUATED_SCALE_MAX_WIDTH, unit: 'metric' });
  private observer?: MutationObserver;
  private container?: HTMLDivElement;

  onAdd(map: Map): HTMLElement {
    const container = document.createElement('div');
    container.className = 'graduated-map-scale';
    const measure = this.native.onAdd(map);
    measure.setAttribute('aria-hidden', 'true');
    measure.style.position = 'absolute';
    measure.style.visibility = 'hidden';
    const bar = document.createElement('div');
    bar.className = 'graduated-scale-bar';
    container.append(measure, bar);
    const update = () => {
      const match = measure.textContent?.trim().match(/^([\d.,]+)\s*(.*)$/);
      const width = Number.parseFloat(measure.style.width);
      if (!match || !Number.isFinite(width) || width <= 0) return;
      const distance = Number(match[1].replace(',', '.'));
      if (!Number.isFinite(distance)) return;
      bar.style.width = `${width}px`;
      bar.replaceChildren();
      container.setAttribute('aria-label', `0 � ${measure.textContent}`);
      for (const fraction of [0, 0.2, 0.5, 0.75, 1]) {
        const tick = document.createElement('span');
        tick.className = 'graduated-scale-tick';
        tick.style.left = `${fraction * 100}%`;
        if (fraction !== 0.75) {
          const label = document.createElement('span');
          label.textContent = `${Number((distance * fraction).toFixed(2))}${fraction === 1 ? ` ${match[2]}` : ''}`;
          tick.append(label);
        }
        bar.append(tick);
      }
    };
    this.observer = new MutationObserver(update);
    this.observer.observe(measure, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    update();
    this.container = container;
    return container;
  }

  onRemove() {
    this.observer?.disconnect();
    this.native.onRemove();
    this.container?.remove();
  }
}
