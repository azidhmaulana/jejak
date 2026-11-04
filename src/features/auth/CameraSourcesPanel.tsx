import { useEffect, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
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
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
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
      </div>
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
            {filtered.map((source) => (
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
      <p className="cms-source-note">
        {tx(
          'Katalog bawaan server. URL feed bukan indikator online; sumber manual di browser tidak dihitung. Cimahi masih berupa tautan embed.',
          'Server catalog. Feed URLs do not indicate online status; browser-local manual sources are excluded. Cimahi currently uses embed links.',
        )}
      </p>
    </section>
  );
}
