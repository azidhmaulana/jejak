import { useEffect, useState } from 'react';
import { ExternalLink, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCameraCheck, type CameraCheckJob } from './cameraCheckStore';
import { api, useAuth } from './authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './CameraSourcesPanel.css';
import { applyCameraSourceState } from '../surveillance/cameraSourceState';
import { toast } from '../../shared/components/Toast';

type Catalog = {
  sourceCount: number;
  cameraCount: number;
  feedCount: number;
  sources: {
    name: string;
    province: string;
    city: string;
    active: boolean;
    cameraCount: number;
    feedCount: number;
    linkOnlyCount: number;
    origins: string[];
    retrievedAt: string;
  }[];
};
export default function CameraSourcesPanel() {
  const user = useAuth((state) => state.user);
  const en = useLanguage() === 'en';
  const tx = (id: string, english: string) => (en ? english : id);
  const reasons: Record<string, string> = {
    replacement_empty: tx('URL baru ditemukan, playlist masih kosong', 'New URL found, playlist is empty'),
    replacement_unavailable: tx('URL baru ditemukan, stream belum tersedia', 'New URL found, stream unavailable'),
    empty_manifest: tx('Playlist sumber kosong', 'Source playlist is empty'),
    stream_unavailable: tx('Stream tidak dapat diakses', 'Stream unavailable'),
  };
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState(false);
  const { job, error: checkError } = useCameraCheck();
  const running = job?.status === 'running';
  useEffect(() => setPage(1), [query, province, city]);
  const startCheck = async () => {
    const owner = user?.id;
    setStarting(true);
    setError('');
    try {
      const result = await api<{ job: CameraCheckJob }>('/cctv-sources/check', 'POST', {});
      if (useAuth.getState().user?.id !== owner) return;
      useCameraCheck.setState({ job: result.job, error: '' });
      toast(
        tx(
          'Pengecekan dimulai. Anda boleh menutup modal ini.',
          'Check started. You may close this modal.',
        ),
      );
    } catch (e) {
      if (useAuth.getState().user?.id === owner) setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };
  useEffect(() => {
    let stopped = false;
    setCatalog(null);
    setError('');
    if (user?.role !== 'superadmin') return;
    void api<Catalog>('/cctv-sources')
      .then((data) => {
        if (!stopped) setCatalog(data);
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [user?.id, user?.role]);
  if (user?.role !== 'superadmin') return null;
  if (error && !catalog) return <p role="alert">{error}</p>;
  if (!catalog)
    return <p role="status">{tx('Memuat sumber kamera...', 'Loading camera sources...')}</p>;
  const provinceLabel = (name: string) =>
    name === 'Jawa Barat'
      ? tx('Jawa Barat', 'West Java')
      : name || tx('Belum ditentukan', 'Unspecified');
  const provinces = [
    ...new Set(catalog.sources.map((source) => source.province).filter(Boolean)),
  ].sort();
  const cityLabel = (name: string) =>
    en
      ? name.replace(/^Kota (.+)$/, '$1 City').replace(/^Kabupaten (.+)$/, '$1 Regency') ||
        'Unspecified'
      : name || 'Belum ditentukan';
  const cities = [
    ...new Set(
      catalog.sources
        .filter((source) => !province || source.province === province)
        .map((source) => source.city)
        .filter(Boolean),
    ),
  ].sort();
  const filtered = catalog.sources.filter(
    (source) =>
      (!province || source.province === province) &&
      (!city || source.city === city) &&
      `${source.name} ${source.province} ${provinceLabel(source.province)} ${source.city} ${cityLabel(source.city)} ${source.origins.join(' ')}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const toggle = async (name: string, active: boolean) => {
    if (saving) return;
    const owner = user.id;
    setSaving(name);
    setError('');
    setCatalog({
      ...catalog,
      sources: catalog.sources.map((source) =>
        source.name === name ? { ...source, active } : source,
      ),
    });
    try {
      const result = await api<Catalog>('/cctv-sources', 'PATCH', { name, active });
      applyCameraSourceState(result.sources);
      if (useAuth.getState().user?.id !== owner) return;
      setCatalog(result);
      toast(tx('Status source CCTV disimpan.', 'CCTV source status saved.'));
    } catch (e) {
      setCatalog(catalog);
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * 8;
  const labels = {
    online: tx('Tersedia', 'Available'),
    updated: tx('URL diperbarui', 'URL updated'),
    failed: tx('Gagal / perlu ditinjau', 'Failed / needs review'),
    skipped: tx('Tanpa feed / dilewati', 'No feed / skipped'),
  };
  return (
    <section className="cms-camera-sources">
      {error && <p role="alert">{error}</p>}
      <div className="cms-source-summary">
        <span>
          <strong>{catalog.sourceCount}</strong> {tx('provider', 'providers')}
        </span>
        <span>
          <strong>{catalog.cameraCount}</strong> {tx('kamera', 'cameras')}
        </span>
        <span>
          <strong>{catalog.feedCount}</strong> {tx('memiliki URL feed', 'with feed URLs')}
        </span>
        <button
          className="cms-source-check-button"
          disabled={starting || running}
          onClick={() => void startCheck()}
        >
          <RefreshCw size={13} className={running ? 'source-check-spin' : ''} />
          {running ? tx('Memeriksa...', 'Checking...') : 'Check'}
        </button>
      </div>
      <div className="cms-source-check-toolbar">
        <span role="status">
          {job
            ? `${job.done}/${job.total} · ${labels.online}: ${job.online} · ${labels.updated}: ${job.updated} · ${tx('Gagal', 'Failed')}: ${job.failed} · ${tx('Dilewati', 'Skipped')}: ${job.skipped}`
            : tx('Belum ada pemeriksaan.', 'No checks yet.')}
        </span>
      </div>
      {job && (
        <progress
          aria-label={tx('Progres pemeriksaan', 'Check progress')}
          max={job.total || 1}
          value={job.done}
        />
      )}
      {checkError && <p role="alert">{checkError}</p>}
      <div className="cms-source-filters">
        <label className="cms-source-field cms-source-search-field">
          <span>{tx('Pencarian', 'Search')}</span>
          <span className="cms-search">
            <Search size={15} />
            <input
              aria-label={tx('Cari source CCTV', 'Search CCTV sources')}
              placeholder={tx('Cari provider atau wilayah...', 'Search provider or region...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        </label>
        <label className="cms-source-field">
          <span>{tx('Provinsi', 'Province')}</span>
          <select
            aria-label={tx('Filter provinsi', 'Filter province')}
            value={province}
            onChange={(event) => {
              setProvince(event.target.value);
              setCity('');
            }}
          >
            <option value="">{tx('Semua provinsi', 'All provinces')}</option>
            {provinces.map((name) => (
              <option key={name} value={name}>
                {provinceLabel(name)}
              </option>
            ))}
          </select>
        </label>
        <label className="cms-source-field">
          <span>{tx('Kota / Kabupaten', 'City / Regency')}</span>
          <select
            aria-label={tx('Filter kota', 'Filter city')}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          >
            <option value="">{tx('Semua kota / kabupaten', 'All cities / regencies')}</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {cityLabel(name)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cms-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tx('Provider / sumber', 'Provider / source')}</th>
              <th>{tx('Provinsi', 'Province')}</th>
              <th>{tx('Kota / Kabupaten', 'City / Regency')}</th>
              <th>{tx('Aktif', 'Active')}</th>
              <th>{tx('Kamera', 'Cameras')}</th>
              <th>Feed URL</th>
              <th>{tx('Tautan saja', 'Link only')}</th>
              <th>{tx('Tanggal katalog', 'Catalog date')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(offset, offset + 8).map((source) => (
              <tr key={source.name}>
                <td>
                  <strong>{source.name}</strong>
                  {source.origins.map((origin) => (
                    <a key={origin} href={origin} target="_blank" rel="noopener noreferrer">
                      {new URL(origin).host} <ExternalLink size={11} />
                    </a>
                  ))}
                </td>
                <td>{provinceLabel(source.province)}</td>
                <td>{cityLabel(source.city)}</td>
                <td>
                  <input
                    type="checkbox"
                    className="cms-source-active"
                    aria-label={`${tx('Aktif', 'Active')} ${source.name}`}
                    checked={source.active}
                    disabled={saving !== null}
                    onChange={(event) => void toggle(source.name, event.target.checked)}
                  />
                </td>
                <td>{source.cameraCount}</td>
                <td>{source.feedCount}</td>
                <td>{source.linkOnlyCount}</td>
                <td>{source.retrievedAt}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={8}>{tx('Tidak ada source yang cocok.', 'No matching sources.')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="cms-pagination" aria-label={tx('Halaman sumber CCTV', 'CCTV sources pages')}>
        <span>
          {filtered.length ? offset + 1 : 0}-{Math.min(offset + 8, filtered.length)} /{' '}
          {filtered.length}
        </span>
        <button
          aria-label={tx('Halaman sebelumnya', 'Previous page')}
          disabled={currentPage === 1}
          onClick={() => setPage(currentPage - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          {currentPage} / {pages}
        </span>
        <button
          aria-label={tx('Halaman berikutnya', 'Next page')}
          disabled={currentPage === pages}
          onClick={() => setPage(currentPage + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </nav>
      <div
        className="cms-source-terminal"
        role="log"
        aria-label={tx('Log pemeriksaan stream', 'Stream check log')}
      >
        {job?.logs.length ? (
          job.logs.slice(-3).map((line, index) => (
            <div key={`${line.at}-${index}`} title={`${line.name}${line.reason ? ' - ' + (reasons[line.reason] || line.reason) : ''}`}>
              <time>{new Date(line.at).toLocaleTimeString(en ? 'en-GB' : 'id-ID')}</time>{' '}
              {labels[line.status]} · {line.name}
              {line.reason && <> - {reasons[line.reason] || line.reason}</>}
            </div>
          ))
        ) : (
          <div>
            {tx(
              'Siap. Klik Check untuk mulai memeriksa stream.',
              'Ready. Click Check to inspect streams.',
            )}
          </div>
        )}
      </div>
      {job && (
        <small>
          {running
            ? tx(
                'Proses berjalan di server, dua kamera sekaligus.',
                'Running on the server, two cameras at a time.',
              )
            : job.status === 'completed'
              ? tx('Pemeriksaan selesai.', 'Check completed.')
              : tx(
                  'Pemeriksaan terhenti. Mulai ulang untuk mencoba lagi.',
                  'Check interrupted. Start again to retry.',
                )}
        </small>
      )}
      <p className="cms-source-note">
        {tx(
          'Check semua memeriksa seluruh katalog, termasuk source nonaktif. URL Bina Marga dicocokkan dengan direktori resmi dan otomatis disimpan jika stream pengganti lolos pemeriksaan. Perubahan domain atau kamera yang tidak cocok perlu ditinjau. Ketersediaan feed bukan verifikasi gambar live.',
          'Check all covers the entire catalog, including inactive sources. Bina Marga URLs are matched against the official directory and saved when replacement streams pass inspection. Domain changes or unmatched cameras need review. Feed availability does not verify live images.',
        )}
      </p>
    </section>
  );
}
