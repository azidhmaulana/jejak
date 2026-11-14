import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useAuth } from '../auth/authStore';
import type { Hotspot } from '../hotspots/hotspotStore';
import { loadProvinces, useRegion } from '../regions/regionStore';
import { hotspotStatistics } from './hotspotStatistics';
import CameraOpeningChart from './CameraOpeningChart';
import './EarthquakeAnalytics.css';
import './HotspotAnalytics.css';

const date = (time: number) => new Date(time).toISOString().slice(0, 10);
export default function HotspotAnalytics() {
  const en = useLanguage() === 'en',
    tx = (id: string, english: string) => (en ? english : id);
  const user = useAuth((s) => s.user),
    provinces = useRegion((s) => s.provinces);
  const [start, setStart] = useState(date(Date.now() - 6 * 86400000));
  const [end, setEnd] = useState(date(Date.now()));
  const [source, setSource] = useState('all'),
    [province, setProvince] = useState(''),
    [confidence, setConfidence] = useState('all');
  const [report, setReport] = useState<{
    items: Hotspot[];
    days: string[];
    source: string;
    warnings: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    void loadProvinces();
    return () => pending.current?.abort();
  }, []);
  const length = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const valid =
    Number.isFinite(length) &&
    length > 0 &&
    length <= 31 &&
    start >= '2000-01-01' &&
    end <= date(Date.now());
  const summary = useMemo(
    () =>
      report ? hotspotStatistics(report.items, report.days, provinces, province, confidence) : null,
    [report, provinces, province, confidence],
  );
  async function search() {
    if (!valid || !user) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setProgress(0);
    setError(false);
    setReport(null);
    const items: Hotspot[] = [],
      days: string[] = [],
      warnings = new Set<string>();
    try {
      for (let i = 0; i < length; i++) {
        const day = date(Date.parse(start) + i * 86400000);
        const response = await fetch(`/api/hotspots?${new URLSearchParams({ day, source })}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
        });
        if (!response.ok) throw Error('Hotspots unavailable');
        const result = await response.json();
        if (!Array.isArray(result.items)) throw Error('Invalid hotspot data');
        for (const [provider, status] of Object.entries(result.sources || {}) as [
          string,
          { status: string },
        ][]) {
          if (status.status !== 'ok') warnings.add(`${provider}: ${status.status}`);
        }
        if (!Object.keys(result.sources || {}).length) warnings.add('no-source');
        days.push(day);
        items.push(...result.items);
        setProgress(i + 1);
      }
      if (!controller.signal.aborted) {
        setReport({ items, days, source, warnings: [...warnings] });
        setFiltersOpen(false);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (pending.current === controller) {
        setBusy(false);
        pending.current = null;
      }
    }
  }
  return (
    <div className="earthquake-analytics hotspot-analytics">
      <details
        className="hotspot-analytics-filter-box"
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
      >
        <summary>{tx('Filter tanggal dan sumber', 'Date and source filters')}</summary>
        <form
          className="hotspot-analytics-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <label>
            {tx('Dari tanggal', 'From date')}
            <input
              type="date"
              value={start}
              min="2000-01-01"
              max={end}
              disabled={busy}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {tx('Sampai tanggal', 'To date')}
            <input
              type="date"
              value={end}
              min={start}
              max={date(Date.now())}
              disabled={busy}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            {tx('Sumber', 'Source')}
            <select value={source} disabled={busy} onChange={(e) => setSource(e.target.value)}>
              <option value="all">{tx('Semua sumber', 'All sources')}</option>
              <option value="firms">NASA FIRMS</option>
              <option value="sipongi">SIPONGI</option>
            </select>
          </label>
          <label>
            {tx('Provinsi', 'Province')}
            <select value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">{tx('Seluruh Indonesia', 'All Indonesia')}</option>
              {provinces.map((p) => (
                <option key={p.properties.PROVINSI}>{p.properties.PROVINSI}</option>
              ))}
            </select>
          </label>
          <label>
            {tx('Confidence', 'Confidence')}
            <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              {[
                ['all', tx('Semua', 'All')],
                ['high', tx('Tinggi', 'High')],
                ['medium', tx('Sedang', 'Medium')],
                ['low', tx('Rendah', 'Low')],
                ['unknown', tx('Tidak diketahui', 'Unknown')],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="quake-analytics-show" disabled={!valid || busy || !user}>
            <Search size={13} />
            {tx('Tampilkan', 'Show')}
          </button>
        </form>
        <p className="analytics-availability-note">
          {tx(
            'Maksimal 31 hari, berdasarkan tanggal UTC. BMKG berupa gambar, tidak dihitung.',
            'Up to 31 days, using UTC dates. BMKG imagery is excluded from counts.',
          )}
        </p>
      </details>
      {!valid && (
        <p role="alert">
          {tx(
            'Pilih rentang 1-31 hari sampai hari ini.',
            'Choose a range of 1-31 days up to today.',
          )}
        </p>
      )}
      {busy && (
        <div className="quake-analytics-loading" role="status">
          <span>
            {progress} / {length} {tx('hari', 'days')} | {Math.floor((progress / length) * 100)}%
          </span>
          <progress
            aria-label={tx('Progres analitik titik api', 'Hotspot analytics progress')}
            value={progress}
            max={length}
          />
          <div className="quake-analytics-loading-footer">
            <button
              type="button"
              onClick={() => {
                pending.current?.abort();
                pending.current = null;
                setBusy(false);
              }}
            >
              <X size={12} />
              <span>{tx('Batalkan', 'Cancel')}</span>
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert">
          {tx(
            'Data gagal dimuat lengkap. Klik Tampilkan untuk mencoba ulang.',
            'Unable to load the complete range. Click Show to retry.',
          )}
        </p>
      )}
      {!report && !busy && !error && (
        <p>{tx('Pilih periode lalu klik Tampilkan.', 'Choose a period and click Show.')}</p>
      )}
      {report && summary && (
        <>
          <p className="analytics-availability-note">
            {report.days[0]} - {report.days[report.days.length - 1]} |{' '}
            {report.source === 'all'
              ? tx('Semua sumber', 'All sources')
              : report.source.toUpperCase()}
          </p>
          {report.warnings.length > 0 && (
            <p role="alert">
              {tx(
                'Cakupan data belum lengkap; sebagian sumber tidak tersedia atau memakai cache lama.',
                'Coverage is incomplete; some sources are unavailable or using stale data.',
              )}{' '}
              <span>{report.warnings.join(' | ')}</span>
            </p>
          )}
          <div className="earthquake-summary">
            <div>
              <b>{summary.total.toLocaleString()}</b>
              {tx('Deteksi hotspot', 'Hotspot detections')}
            </div>
            <div>
              <b className="hotspot-high">{summary.high.toLocaleString()}</b>
              {tx('Confidence tinggi', 'High confidence')}
            </div>
            <div>
              <b>{summary.regionCount}</b>
              {tx('Provinsi terdeteksi', 'Provinces detected')}
            </div>
          </div>
          <section>
            <h3>{tx('Tren deteksi harian', 'Daily detection trend')} (UTC)</h3>
            <CameraOpeningChart
              rows={summary.trend}
              label={tx('Deteksi hotspot per hari UTC', 'Hotspot detections per UTC day')}
              timezone="UTC"
              showValues
            />
          </section>
          <section>
            <h3>{tx('Top 5 provinsi', 'Top 5 provinces')}</h3>
            {summary.regions.map((r) => (
              <div className="quake-stat-bar region" key={r.name}>
                <span>{r.name}</span>
                <meter
                  min={0}
                  max={Math.max(1, summary.regions[0].count)}
                  value={r.count}
                  aria-label={r.name}
                />
                <b>{r.count.toLocaleString()}</b>
              </div>
            ))}
            {!summary.regions.length && (
              <p>
                {tx(
                  'Belum ada deteksi yang dapat dipetakan ke provinsi.',
                  'No detections could be assigned to a province.',
                )}
              </p>
            )}
          </section>
          {summary.unknown > 0 && (
            <p className="analytics-availability-note">
              {tx('Provinsi belum teridentifikasi', 'Province unidentified')}: {summary.unknown}
            </p>
          )}
          <p className="analytics-availability-note">
            {tx(
              'Jumlah deteksi satelit, bukan jumlah kebakaran. Duplikat satelit, menit, dan koordinat yang sama dihitung sekali.',
              'Satellite detections, not confirmed fires. Duplicate satellite, minute and coordinates are counted once.',
            )}
          </p>
        </>
      )}
    </div>
  );
}
