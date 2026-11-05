import { useEffect } from 'react';

/** Keep the static splash above React until the styled workspace has painted. */
export default function BootReady() {
  useEffect(() => {
    let second = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const splash = document.getElementById('jejak-boot');
        splash?.classList.add('boot-complete');
        timer = setTimeout(() => splash?.remove(), 450);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(timer);
    };
  }, []);
  return null;
}
