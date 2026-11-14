import { useRegion } from '../regions/regionStore';
import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { Activity, Search, X } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useWorkspace } from '../osint/workspaceStore';
import { quakeTime, searchEarthquakes, setEarthquakeMode, useEarthquakes, visibleEarthquakes } from './earthquakeStore';
import './Earthquakes.css';

export default function EarthquakePanel() {
  const region = useRegion();
  const en = useLanguage() === 'en', tx = (id: string, english: string) => en ? english : id;
  const state = useEarthquakes(), items = visibleEarthquakes(state, region);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const [start, setStart] = useState(state.start || today), [end, setEnd] = useState(state.end || today);
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(Number((state.start || today).slice(0, 4)));
  const annual = year < currentYear - 5;
  const [minimum, setMinimum] = useState(state.minMagnitude);
  const [shown, setShown] = useState(30);
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const trigger = document.querySelector('[data-earthquake-trigger]');
    if (!trigger) return;
    const align = () => {
      const rect = trigger.getBoundingClientRect();
      setPosition({ position: 'fixed', top: rect.top, left: rect.right + 8,
        maxHeight: Math.min(window.innerHeight * 0.6, window.innerHeight - rect.top - 70),
        maxWidth: window.innerWidth - rect.right - 16 });
    };
    align(); const observer = new ResizeObserver(align);
    observer.observe(document.body); observer.observe(trigger);
    window.addEventListener('resize', align);
    return () => { observer.disconnect(); window.removeEventListener('resize', align); };
  }, []);
  const stale = state.liveError || state.status.bmkgStale || state.status.usgsStale;
  return <aside style={position} className="public-analytics earthquake-panel" aria-label={tx('Gempa bumi', 'Earthquakes')} translate="no">
    <header className="public-analytics-heading"><Activity size={18} /><h2>{tx('Gempa bumi', 'Earthquakes')}</h2>
      <button className="analytics-close" aria-label={tx('Tutup gempa', 'Close earthquakes')} onClick={() => useWorkspace.setState({ panel: null })}><X size={12} /></button>
    </header>
    <div className="public-analytics-body">
      <label className="quake-toggle">{tx('Marker gempa', 'Earthquake markers')}<input type="checkbox" role="switch" checked={state.enabled} onChange={e => useEarthquakes.setState({ enabled: e.target.checked })} /><b>{items.length}</b></label>
      <div className="quake-tabs">{(['latest', 'recent', 'history'] as const).map((mode, index) => <button key={mode} aria-pressed={state.mode === mode} onClick={() => { setEarthquakeMode(mode); setShown(30); }}>{[tx('Terbaru', 'Latest'), tx('48 jam', '48 hours'), tx('Riwayat', 'History')][index]}</button>)}</div>
      {state.mode === 'history' && <form className="quake-range" onSubmit={e => { e.preventDefault(); setShown(30); void searchEarthquakes(annual ? `${year}-01-01` : start, annual ? `${year}-12-31` : end, false, minimum); }}>
        <label>{tx('Tahun', 'Year')}<select aria-label={tx('Tahun riwayat', 'History year')} value={year} onChange={e => { const y = Number(e.target.value); setYear(y); setStart(`${y}-01-01`); setEnd(y === currentYear ? today : `${y}-12-31`); }}>{Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i).map(y => <option key={y} value={y}>{y}</option>)}</select></label>
        {!annual && <><label>{tx('Dari (WIB)', 'From (WIB)')}<input aria-label={tx('Tanggal mulai', 'Start date')} type="date" min={`${year}-01-01`} max={end || today} value={start} required onChange={e => setStart(e.target.value)} /></label>
        <label>{tx('Sampai (WIB)', 'To (WIB)')}<input aria-label={tx('Tanggal akhir', 'End date')} type="date" min={start} max={year === currentYear ? today : `${year}-12-31`} value={end} required onChange={e => setEnd(e.target.value)} /></label></>}
        <label>{tx('Magnitudo minimum', 'Minimum magnitude')}<select value={minimum} onChange={e => setMinimum(Number(e.target.value))}>{[0, 5, 6, 7, 8, 9].map(value => <option key={value} value={value}>{value ? `M ${value}+` : tx('Semua', 'All')}</option>)}</select></label>
        <button type="submit" disabled={state.loading}><Search size={12} />{state.loading ? tx('Mencari…', 'Searching…') : tx('Cari', 'Search')}</button>
      </form>}
      {state.mode === 'history' && (state.loading || state.total !== null) && <div className="quake-load" role="status">
        <progress aria-label={tx('Progres arsip', 'Archive progress')} max={state.total || 1} value={state.total === null ? undefined : state.total === 0 ? 1 : Math.min(state.loaded, state.total)} />
        <small>{state.total === null ? tx('Menghitung data dari USGS...', 'Counting USGS records...') : `${tx('Diproses', 'Processed')}: ${Math.min(100, state.total ? Math.floor(state.loaded / state.total * 100) : 100)}% ? ${state.loaded}/${state.total}`}{state.loading ? tx(' ? Memuat', ' ? Loading') : ''}</small>
      </div>}
      {state.mode === 'history' && <p className="quake-note">{tx('Arsip USGS, magnitudo terbesar dahulu. Maksimal satu tahun per pencarian. Data dimuat otomatis bertahap. Arsip lebih dari lima tahun lalu dipilih per tahun. Nama lokasi dapat berbeda (Aceh: Sumatra; Tasikmalaya: Java).', 'USGS archive, largest magnitude first. Search up to one year. Records load automatically in batches. Archives older than five years use whole years. Location names may differ (Aceh: Sumatra; Tasikmalaya: Java).')}</p>}
      <p className="quake-note">{tx('Indonesia & perairan sekitar. Semua magnitudo yang tersedia; bukan katalog lengkap. Catatan BMKG dan USGS dapat merujuk gempa yang sama.', 'Indonesia & surrounding waters. All available magnitudes; not a complete catalog. BMKG and USGS records may describe the same event.')}</p>
      {stale && <p role="status" className="quake-warning">{tx('Sumber belum diperbarui. Data terakhir tetap ditampilkan.', 'Source not updated. Showing the last available data.')}</p>}
      {(state.error || state.partial) && <p role="alert" className="quake-warning">{tx('Pencarian arsip gagal atau belum lengkap. Coba cari ulang.', 'Archive search failed or is incomplete. Please retry.')}</p>}
      <p className="quake-note">BMKG: {state.status.bmkgUpdatedAt ? quakeTime(Date.parse(state.status.bmkgUpdatedAt), en) : tx('Menunggu pembaruan', 'Awaiting update')}<br />USGS: {state.status.usgsUpdatedAt ? quakeTime(Date.parse(state.status.usgsUpdatedAt), en) : '—'}</p>
      {state.mode === 'history' && state.hasMore && !state.loading && <p role="status" className="quake-warning">{tx(`${items.length} catatan sudah dimuat. Masih ada hasil lain; gunakan Muat arsip berikutnya di bawah.`, `${items.length} records loaded. More results are available; use Load next archive page below.`)}</p>}
      <div className="quake-results">{items.slice(0, shown).map(q => <button className="quake-row" key={q.id} aria-pressed={state.selected?.id === q.id} onClick={() => useEarthquakes.setState({ selected: q, enabled: true })}>
        <b data-large={q.magnitude >= 6}>M {q.magnitude.toFixed(1)}</b><span>{q.place}<small>{quakeTime(q.time, en)} · {q.depth} km · {q.source}</small></span>
      </button>)}</div>
      {!items.length && !state.loading && <p>{state.mode === 'history' && !state.start ? tx('Pilih rentang tanggal lalu klik Cari.', 'Choose dates and click Search.') : tx('Tidak ada data tersedia dalam rentang ini.', 'No available records in this range.')}</p>}
      {items.length > shown && <button className="quake-more" onClick={() => setShown(v => v + 30)}>{tx('Tampilkan lagi', 'Show more')}</button>}
      {state.mode === 'history' && state.hasMore && <button className="quake-more" disabled={state.loading} onClick={() => void searchEarthquakes(state.start, state.end, true)}>{tx('Muat arsip berikutnya', 'Load next archive page')}</button>}
      <p className="quake-note"><a href="https://data.bmkg.go.id/gempabumi/" target="_blank" rel="noreferrer">BMKG</a> · <a href="https://earthquake.usgs.gov/" target="_blank" rel="noreferrer">USGS</a> · {tx('Diperiksa setiap 60 detik', 'Checked every 60 seconds')}</p>
    </div>
  </aside>;
}
