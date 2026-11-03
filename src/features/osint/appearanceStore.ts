import { create } from 'zustand';

const defaults = { primary: '#00cfff', secondary: '#40d9ff', glow: 35, controls: true };
const key = 'osint-sidebar-style-v2';
function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return {
      primary: /^#[0-9a-f]{6}$/i.test(saved?.primary) ? saved.primary : defaults.primary,
      secondary: /^#[0-9a-f]{6}$/i.test(saved?.secondary) ? saved.secondary : defaults.secondary,
      glow: Number.isFinite(saved?.glow) ? Math.max(0, Math.min(100, saved.glow)) : defaults.glow,
      controls: typeof saved?.controls === 'boolean' ? saved.controls : true,
    };
  } catch {
    return defaults;
  }
}
export const useAppearance = create(read);
useAppearance.subscribe((state) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* Keep the current session usable. */
  }
});
export function resetAppearance() {
  useAppearance.setState(defaults);
}
