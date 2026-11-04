import { useEffect, useState } from 'react';
import { Languages, Maximize, Minimize, RefreshCw } from 'lucide-react';
import { getLocale, setLanguage } from '../../i18n/runtime.js';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './WorkspaceHeader.module.css';

export default function WorkspaceHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const language = useLanguage();
  const [now, setNow] = useState(new Date());
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => {
      clearInterval(timer);
      document.removeEventListener('fullscreenchange', changed);
    };
  }, []);
  async function toggleFullscreen() {
    try {
      setError('');
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError('Fullscreen tidak tersedia pada browser ini.');
    }
  }
  const date = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(getLocale(), { timeZone: 'Asia/Jakarta', ...options }).format(now);
  return (
    <header className={`${styles.navbar} ${styles.minimal}`}>
      <div className={styles.navLeft}>
        <img src="/jejak-logo.svg" alt="" className={styles.logo} />
        <span className={styles.title} translate="no">
          {title}
        </span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>
      <div className={styles.navCenter}>
        <div className="hud-line" />
      </div>
      <div className={styles.navRight}>
        <div className={styles.timeBlock}>
          <span className={styles.timeDigits}>
            {date({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
          <span className={styles.timeDivider}>|</span>
          <div className={styles.timeMeta}>
            <span className={styles.timeWeekday}>{date({ weekday: 'long' })}</span>
            <span className={styles.timeDate}>
              {date({ day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className={styles.iconsGroup}>
          <button
            className={`${styles.iconBtn} ${styles.languageBtn}`}
            aria-label="Ganti bahasa"
            onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
          >
            <Languages size={15} />
            <span>{language.toUpperCase()}</span>
          </button>
          <button
            className={styles.iconBtn}
            aria-label="Refresh halaman"
            onClick={() => location.reload()}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className={styles.iconBtn}
            aria-label="Toggle fullscreen"
            aria-pressed={fullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
        {error && <span role="status">{error}</span>}
      </div>
    </header>
  );
}
