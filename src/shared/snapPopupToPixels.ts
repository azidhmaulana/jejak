/** Map anchors use percentage offsets, which can put text between physical pixels. */
export function snapPopupToPixels(element: HTMLElement) {
  const snap = () => {
    const transform = getComputedStyle(element).transform;
    if (transform === 'none') {
      if (element.style.translate) element.style.removeProperty('translate');
      return;
    }
    const matrix = new DOMMatrixReadOnly(transform);
    const ratio = window.devicePixelRatio || 1;
    const x = Math.round(matrix.m41 * ratio) / ratio;
    const y = Math.round(matrix.m42 * ratio) / ratio;
    const dx = x - matrix.m41;
    const dy = y - matrix.m42;
    const [currentX = 0, currentY = 0] = element.style.translate.split(' ').filter(Boolean).map(Number.parseFloat);
    // CSS normalizes decimal strings; compare numbers so the observer cannot feed itself.
    if (Math.abs(currentX - dx) > 0.000001 || Math.abs(currentY - dy) > 0.000001)
      element.style.translate = `${dx}px ${dy}px`;
  };
  const mutations = new MutationObserver(snap);
  mutations.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
  const resize = new ResizeObserver(snap);
  resize.observe(element);
  window.addEventListener('resize', snap);
  snap();
  return () => { mutations.disconnect(); resize.disconnect(); window.removeEventListener('resize', snap); };
}
