/** Dismiss before the next marker click selects its replacement. */
export function dismissMarkerPopup(getElement: () => HTMLElement | null | undefined, dismiss: () => void) {
  const outside = (event: PointerEvent) => {
    const element = getElement();
    if (element && !event.composedPath().includes(element)) dismiss();
  };
  document.addEventListener('pointerdown', outside, true);
  return () => document.removeEventListener('pointerdown', outside, true);
}
