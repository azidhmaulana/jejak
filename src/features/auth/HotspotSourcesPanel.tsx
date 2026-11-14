import { useEffect, useState } from 'react';
import { Check, RefreshCw, Save } from 'lucide-react';
import { api, useAuth } from './authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { toast } from '../../shared/components/Toast';
import { loadHotspotProviders, type HotspotProvider } from '../hotspots/hotspotStore';
import { sourceStatus } from '../hotspots/HotspotPanel';
import './HotspotSourcesPanel.css';

type Source = HotspotProvider & {
  hasKey: boolean;
  endpoint: string;
  keyRequired: boolean;
  updatedAt: number | null;
};
function SourceEditor({ source, saved }: { source: Source; saved: (s: Source) => void }) {
  const en = useLanguage() === 'en',
    tx = (id: string, english: string) => (en ? english : id);
  const [active, setActive] = useState(source.active),
    [key, setKey] = useState(''),
    [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [status, setStatus] = useState('');
  const owner = useAuth((s) => s.user?.id);
  const current = () =>
    useAuth.getState().user?.id === owner && useAuth.getState().user?.role === 'superadmin';
  const dirty = active !== source.active || Boolean(key.trim()) || clearKey;
  async function save() {
    setBusy(true);
    setStatus('');
    try {
      const result = await api<{ source: Source }>(`/hotspot-sources/${source.id}`, 'PATCH', {
        active,
        ...(key.trim() ? { apiKey: key.trim() } : {}),
        ...(clearKey ? { clearKey: true } : {}),
      });
      if (!current()) return;
      saved(result.source);
      setKey('');
      setClearKey(false);
      toast(tx('Sumber hotspot disimpan.', 'Hotspot source saved.'), 'success');
      await loadHotspotProviders();
    } catch (e) {
      if (current())
        setStatus(e instanceof Error ? e.message : tx('Gagal menyimpan.', 'Save failed.'));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setChecking(true);
    setStatus('');
    try {
      const result = await api<{ status: string; count?: number }>(
        `/hotspot-sources/${source.id}/check`,
        'POST',
        {},
      );
      if (!current()) return;
      setStatus(
        `${sourceStatus(result.status, en)}${result.count === undefined ? '' : ` · ${result.count} ${tx('deteksi kemarin (UTC)', 'detections yesterday (UTC)')}`}`,
      );
      toast(
        tx('Pemeriksaan sumber selesai.', 'Source check completed.'),
        result.status === 'ok' ? 'success' : 'error',
      );
    } catch {
      if (current()) setStatus(tx('Pemeriksaan gagal. Coba lagi.', 'Check failed. Please retry.'));
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="hotspot-source-editor">
      <header>
        <strong>{source.name}</strong>
        <span>
          {source.kind === 'image'
            ? tx('Citra terbaru', 'Latest image')
            : tx('Marker & history', 'Markers & history')}
        </span>
        <label>
          <input
            type="checkbox"
            checked={active}
            disabled={busy || checking}
            onChange={(e) => setActive(e.target.checked)}
          />
          {tx('Aktif', 'Active')}
        </label>
      </header>
      <a href={source.url} target="_blank" rel="noreferrer">
        {source.url}
      </a>
      <p className="hotspot-source-endpoint">{source.endpoint}</p>
      {source.keyRequired ? (
        <>
          <label className="hotspot-source-key">
            NASA FIRMS MAP_KEY{' '}
            <span>
              {source.hasKey
                ? tx(
                    'Key tersimpan; kosongkan jika tidak diganti.',
                    'Key stored; leave blank to keep it.',
                  )
                : tx('Belum diatur', 'Not configured')}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              aria-label="NASA FIRMS MAP_KEY"
              value={key}
              disabled={clearKey || busy || checking}
              placeholder={tx('Masukkan key baru', 'Enter a new key')}
              maxLength={32}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          {source.hasKey && (
            <label>
              <input
                type="checkbox"
                checked={clearKey}
                disabled={busy || checking}
                onChange={(e) => {
                  setClearKey(e.target.checked);
                  setKey('');
                }}
              />
              {tx('Hapus key tersimpan', 'Remove stored key')}
            </label>
          )}
          <a
            href="https://firms.modaps.eosdis.nasa.gov/api/map_key/"
            target="_blank"
            rel="noreferrer"
          >
            {tx('Daftar MAP_KEY gratis', 'Get a free MAP_KEY')}
          </a>
        </>
      ) : (
        <p>
          {source.id === 'bmkg'
            ? tx(
                'Citra resmi ditampilkan utuh. Tidak menyediakan marker atau history pada integrasi ini.',
                'Official image shown intact. This integration does not provide markers or history.',
              )
            : tx(
                'Menggunakan endpoint publik SIPONGI; tidak memerlukan key.',
                'Uses SIPONGI’s public endpoint; no key required.',
              )}
        </p>
      )}
      <footer>
        <span role="status">
          {checking ? tx('Memeriksa sumber...', 'Checking source...') : status}
        </span>
        <button disabled={checking || busy || dirty || !source.active} onClick={() => void check()}>
          <RefreshCw size={12} className={checking ? 'hotspot-spin' : ''} />
          {tx('Cek', 'Check')}
        </button>
        <button disabled={busy || checking || !dirty} onClick={() => void save()}>
          {busy ? <RefreshCw size={12} /> : <Save size={12} />}
          {tx('Simpan', 'Save')}
        </button>
      </footer>
    </section>
  );
}
export default function HotspotSourcesPanel() {
  const user = useAuth((s) => s.user),
    en = useLanguage() === 'en';
  const [sources, setSources] = useState<Source[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    setSources([]);
    setError(false);
    if (user?.role === 'superadmin')
      void api<{ sources: Source[] }>('/hotspot-sources')
        .then((result) => {
          if (!stopped) setSources(result.sources);
        })
        .catch(() => {
          if (!stopped) setError(true);
        });
    return () => {
      stopped = true;
    };
  }, [user?.id, user?.role]);
  if (user?.role !== 'superadmin') return null;
  return (
    <div className="hotspot-sources">
      <p>
        <Check size={12} />
        {en
          ? 'Keys stay encrypted on the server and are never returned to the browser. Save changes before checking.'
          : 'Key disimpan terenkripsi di server dan tidak dikirim kembali ke browser. Simpan perubahan sebelum cek.'}
      </p>
      {error ? (
        <p role="alert">
          {en ? 'Unable to load source settings.' : 'Tidak dapat memuat pengaturan sumber.'}
        </p>
      ) : !sources.length ? (
        <p role="status">{en ? 'Loading...' : 'Memuat...'}</p>
      ) : (
        sources.map((source) => (
          <SourceEditor
            key={`${user.id}:${source.id}`}
            source={source}
            saved={(updated) =>
              setSources((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))
            }
          />
        ))
      )}
    </div>
  );
}
