import { Search, X, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useAuth } from '../auth/authStore';
import type { Earthquake } from '../earthquakes/earthquakeStore';
import { quakeTime } from '../earthquakes/earthquakeStore';
import { earthquakeStatistics } from './earthquakeStatistics';
import './EarthquakeAnalytics.css';

type YearReport = { year: number; events: Earthquake[] };
export default function EarthquakeAnalytics() {
  const en = useLanguage() === 'en', tx = (id: string, english: string) => en ? english : id;
  const user = useAuth(s => s.user);
  const currentYear = new Date().getFullYear();
  const [start, setStart] = useState(currentYear), [end, setEnd] = useState(currentYear);
  const [reports, setReports] = useState<YearReport[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [progress, setProgress] = useState({ year: currentYear, loaded: 0, total: 0 });
  const [searched, setSearched] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [user?.id]);
  const search = async () => {
    if (!user || start > end || end - start > 4) return;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(false); setSearched(true); setReports([]);
    try {
      for (let year = start; year <= end; year++) {
        let page = 0, more = true, loaded = 0;
        const events: Earthquake[] = [];
        setProgress({ year, loaded: 0, total: 0 });
        while (more) {
          const response = await fetch(`/api/earthquakes?${new URLSearchParams({ start: `${year}-01-01`, end: `${year}-12-31`, page: String(page) })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
          if (!response.ok) throw Error('Archive unavailable');
          const result = await response.json();
          if (controller.signal.aborted) return;
          if (result.historyUnavailable || !Array.isArray(result.items)) throw Error('Incomplete archive');
          events.push(...result.items.filter((q: Earthquake) => q.source === 'USGS'));
          loaded += result.scanned ?? result.items.length;
          setProgress({ year, loaded, total: result.total || 0 });
          more = result.hasMore; page++;
          if (more && page > 100) throw Error('Archive limit');
        }
        setReports(values => [...values, { year, events }]);
      }
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const summary = earthquakeStatistics(reports.flatMap(report => report.events));
  const years = reports.map(report => ({ year: report.year, ...earthquakeStatistics(report.events) }));
  const maximum = Math.max(1, ...years.map(year => year.total));
  const regionMax = Math.max(1, ...summary.regions.map(region => region.count));
  return <div className="earthquake-analytics">
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="earthquake-analytics-controls">
      <label>{tx('Dari tahun', 'From year')}<select value={start} onChange={event => { const year = Number(event.target.value); setStart(year); setEnd(value => Math.max(year, Math.min(value, year + 4))); }}>{Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index).map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      <label>{tx('Sampai tahun', 'To year')}<select value={end} onChange={event => setEnd(Number(event.target.value))}>{Array.from({ length: Math.min(currentYear, start + 4) - start + 1 }, (_, index) => start + index).map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      <button className="quake-analytics-show" type="submit" disabled={busy || !user || start < 1900 || end > currentYear || end < start || end - start > 4}>{busy ? <Loader2 size={13} className="is-loading" /> : <Search size={13} />}<span>{tx('Tampilkan', 'Show')}</span></button>
    </form>
    <p className="quake-note">{tx('Maksimal 5 tahun, dimuat satu tahun per proses. USGS saja; Indonesia dan perairan sekitar (92–142° BT, 12° LS–8° LU). Tahun berjalan belum lengkap.', 'Up to 5 years, loaded one year at a time. USGS only; Indonesia and surrounding waters (92–142° E, 12° S–8° N). The current year is incomplete.')}</p>
    {busy && <div className="quake-analytics-loading" role="status">
      <div className="quake-analytics-loading-heading"><span>{tx('Memuat tahun', 'Loading year')} <b>{progress.year}</b></span><strong>{progress.total ? `${Math.min(100, Math.floor(progress.loaded / progress.total * 100))}%` : tx('Menghitung...', 'Counting...')}</strong></div>
      <progress aria-label={tx('Progres tahun aktif', 'Current year progress')} max={progress.total || 1} value={progress.total ? Math.min(progress.loaded, progress.total) : undefined} />
      <div className="quake-analytics-loading-footer"><small>{progress.total ? `${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()}` : 'USGS'}</small><button type="button" onClick={() => { pending.current?.abort(); setBusy(false); setError(true); }}><X size={12} /><span>{tx('Batalkan', 'Cancel')}</span></button></div>
    </div>}
    {error && <p role="alert">{tx('Pemuatan belum lengkap. Hanya tahun yang selesai ditampilkan. Klik Tampilkan untuk mencoba ulang.', 'Loading is incomplete. Only completed years are shown. Click Show to retry.')}</p>}
    {!searched && <p>{tx('Pilih tahun lalu klik Tampilkan.', 'Choose years and click Show.')}</p>}
    {reports.length > 0 && <>
      <div className="earthquake-summary"><div><b>{summary.total.toLocaleString()}</b>{tx('Gempa tercatat', 'Recorded events')}</div><div><b>{summary.groups.slice(1).reduce((a, b) => a + b, 0).toLocaleString()}</b>M ≥5</div><div><b>{summary.largest ? `M${summary.largest.magnitude.toFixed(1)}` : '—'}</b>{tx('Terbesar', 'Largest')}</div></div>
      <section><h3>{tx('Jumlah gempa per tahun', 'Earthquakes per year')}</h3>{years.map(year => <div className="quake-stat-bar" key={year.year}><span>{year.year}</span><meter min="0" max={maximum} value={year.total} aria-label={`${year.year}`} /><b>{year.total.toLocaleString()}</b></div>)}</section>
      <section><h3>{tx('Kelompok magnitudo', 'Magnitude groups')}</h3><div className="quake-magnitude-groups">{['<5', '5–5.9', '6–6.9', '7–7.9', '≥8'].map((label, index) => <div key={label}><span>M {label}</span><b>{summary.groups[index].toLocaleString()}</b></div>)}</div></section>
      <section><h3>{tx('Magnitudo terbesar per tahun', 'Largest magnitude per year')}</h3>{years.map(year => <div className="quake-stat-bar" key={year.year}><span>{year.year}</span><meter min="0" max="10" value={year.largest?.magnitude || 0} aria-label={`M ${year.year}`} /><b>{year.largest ? year.largest.magnitude.toFixed(1) : '—'}</b></div>)}</section>
      <section><h3>{tx('Lokasi referensi terbanyak', 'Most frequent reference locations')}</h3><p className="quake-note">{tx('Nama referensi lokasi USGS, bukan agregasi batas provinsi.', 'USGS reference location names, not province boundary totals.')}</p>{summary.regions.slice(0, 5).map(region => <div className="quake-stat-bar region" key={region.name}><span>{region.name}</span><meter min="0" max={regionMax} value={region.count} aria-label={region.name} /><b>{region.count}</b></div>)}</section>
      <section aria-label={tx('Top 5 gempa terbesar', 'Top 5 largest earthquakes')}>
        <h3>{tx('Top 5 gempa terbesar', 'Top 5 largest earthquakes')}</h3>
        {(busy || error) && <p className="quake-note">{tx('Peringkat sementara dari tahun yang selesai dimuat.', 'Provisional ranking from completed years.')}</p>}
        <ol className="quake-top-five">{summary.top.map(quake => <li key={quake.id}>
          <a href={quake.url} target="_blank" rel="noreferrer"><b>M{quake.magnitude.toFixed(1)}</b> {quake.place} ↗</a>
          <small>{quakeTime(quake.time, en)} · {tx('Kedalaman', 'Depth')} {quake.depth} km · USGS</small>
        </li>)}</ol>
      </section>
      {!summary.total && <p>{tx('Tidak ada gempa tersedia untuk tahun yang selesai dimuat.', 'No events available for the loaded years.')}</p>}
    </>}
    <p className="quake-note">{tx('Statistik memakai label lokasi Indonesia dari USGS, bukan batas maritim. Catatan tanpa label negara tidak dihitung kecuali peristiwa yang telah diverifikasi. Perbedaan cakupan katalog antar tahun memengaruhi perbandingan; bukan prediksi gempa.', 'Statistics use USGS Indonesia location labels, not maritime boundaries. Unlabeled records are excluded unless the event has been verified. Catalog coverage varies by year and affects comparisons; this is not an earthquake prediction.')}</p>
  </div>;
}
