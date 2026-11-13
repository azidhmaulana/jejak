import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import './WorkspaceClock.css';

type Preferences = { zone: string; date: string; time: string };
const defaults: Preferences = { zone: 'auto', date: 'long', time: '24s' };
const offsets = Array.from({ length: 105 }, (_, i) => i * 15 - 720);
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('jejak-clock') || '{}');
    return {
      zone: value.zone === 'auto' || offsets.includes(Number(value.zone)) ? value.zone : 'auto',
      date: ['long', 'short', 'iso'].includes(value.date) ? value.date : 'long',
      time: ['24s', '24', '12s', '12'].includes(value.time) ? value.time : '24s',
    };
  } catch { return defaults; }
}
function offsetLabel(minutes: number) {
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? '-' : '+'}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, '0')}` : ''}`;
}

export default function WorkspaceClock() {
  const en = useLanguage() === 'en';
  const [now, setNow] = useState(() => new Date());
  const [preferences, setPreferences] = useState(readPreferences);
  const [open, setOpen] = useState<keyof Preferences | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => { clearInterval(timer); document.removeEventListener('pointerdown', outside); };
  }, []);
  const auto = preferences.zone === 'auto';
  const offset = auto ? -now.getTimezoneOffset() : Number(preferences.zone);
  const date = new Date(now.getTime() + offset * 60000);
  const locale = en ? 'en-GB' : 'id-ID';
  const formatDate = (format: string) => format === 'iso' ? date.toISOString().slice(0, 10) : new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', day: '2-digit', month: format === 'long' ? 'long' : '2-digit', year: 'numeric',
  }).format(date);
  const formatTime = (format: string) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', ...(format.endsWith('s') ? { second: '2-digit' as const } : {}), hour12: format.startsWith('12'),
  }).format(date);
  const options = {
    zone: [{ value: 'auto', label: `${en ? 'Device' : 'Perangkat'} (${Intl.DateTimeFormat().resolvedOptions().timeZone})` }, ...offsets.map(value => ({ value: String(value), label: offsetLabel(value) }))],
    date: ['long', 'short', 'iso'].map(value => ({ value, label: formatDate(value) })),
    time: ['24s', '24', '12s', '12'].map(value => ({ value, label: formatTime(value) })),
  };
  const names = { zone: en ? 'Time zone' : 'Zona waktu', date: en ? 'Date format' : 'Format tanggal', time: en ? 'Time format' : 'Format jam' };
  const select = (key: keyof Preferences, value: string) => {
    const next = { ...preferences, [key]: value }; setPreferences(next); setOpen(null);
    try { localStorage.setItem('jejak-clock', JSON.stringify(next)); } catch { /* Clock remains usable when storage is unavailable. */ }
    root.current?.querySelector<HTMLButtonElement>(`[data-clock-trigger="${key}"]`)?.focus();
  };
  return <div ref={root} className="workspace-clock" onKeyDown={event => { if (event.key === 'Escape') { setOpen(null); root.current?.querySelector<HTMLButtonElement>(`[data-clock-trigger="${open}"]`)?.focus(); } }}>
    {(['zone', 'date', 'time'] as const).map(key => <div className="clock-part" key={key}>
      {key === 'time' && <i className="clock-separator" aria-hidden="true" />}
      <button type="button" data-clock-trigger={key} aria-label={names[key]} aria-expanded={open === key} aria-controls={`clock-${key}`} onClick={() => setOpen(open === key ? null : key)}>
        {key === 'zone' ? offsetLabel(offset) : key === 'date' ? formatDate(preferences.date) : formatTime(preferences.time)}
      </button>
      <div id={`clock-${key}`} className="clock-dropdown" data-open={open === key} aria-hidden={open !== key}>
        <strong>{names[key]}</strong>
        {options[key].map(option => <button type="button" tabIndex={open === key ? 0 : -1} key={option.value} aria-pressed={preferences[key] === option.value} onClick={() => select(key, option.value)}>{option.label}</button>)}
      </div>
    </div>)}
    <i className="clock-trailing" aria-hidden="true">-</i>
  </div>;
}
