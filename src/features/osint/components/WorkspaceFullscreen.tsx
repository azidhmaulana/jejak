import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { toast } from '../../../shared/components/Toast';

export default function WorkspaceFullscreen() {
  const en = useLanguage() === 'en';
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(document.fullscreenElement === document.documentElement);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const label = active ? (en ? 'Exit fullscreen' : 'Keluar layar penuh') : (en ? 'Fullscreen workspace' : 'Layar penuh');
  return <button aria-label={label} title={label} aria-pressed={active} onClick={async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast(en ? 'Fullscreen is unavailable.' : 'Layar penuh tidak tersedia.', 'error');
    }
  }}>{active ? <Minimize /> : <Maximize />}</button>;
}
