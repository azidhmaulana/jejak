import { useEffect, useState } from 'react';
import { useActiveBundledCameras } from '../cameraSourceState';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import {
  useSurveillance,
  cameraAvailability,
  saveSurveillance,
  hasCameraFeed,
  bandungSource,
  bandungRetrievedAt,
  setBandung,
  type SurveillanceSource,
} from '../osintSurveillanceStore';
export default function OsintSurveillancePanel({
  config,
  onBack,
}: {
  config: boolean;
  onBack: () => void;
}) {
  const state = useSurveillance();
  const bandungCameras = useActiveBundledCameras();
  const bandungFeedCameras = bandungCameras.filter(hasCameraFeed);
  const [draft, setDraft] = useState(() => state.sources.map((s) => ({ ...s }))),
    [message, setMessage] = useState('');
  const manualCameras = state.sources.filter((s) => s.kind === 'camera').length,
    cameras = manualCameras + (state.bandung ? bandungCameras.length : 0),
    news = state.sources.filter((s) => s.kind === 'news').length;
  const [, refreshAge] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refreshAge((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const offlineCount = [...(state.bandung ? bandungCameras : []), ...state.sources].filter(
    (source) => source.kind === 'camera' && cameraAvailability(source).status === 'offline',
  ).length;
  const patch = (id: string, value: Partial<SurveillanceSource>) =>
    setDraft(draft.map((s) => (s.id === id ? { ...s, ...value } : s)));
  if (config)
    return (
      <section className="osint-surveillance-config">
        <header>
          <button aria-label="Back to surveillance" title="Back" onClick={onBack}>
            <ArrowLeft size={14} />
          </button>
          <strong>SURVEILLANCE CONFIG</strong>
        </header>
        <p className="osint-empty">
          Konfigurasi khusus OSINT, disimpan di browser ini. Terpisah dari kamera dan pengaturan
          BMS.
        </p>
        <fieldset>
          <legend>SUMBER PUBLIK BANDUNG</legend>
          <label className="osint-weather-toggle">
            <input
              type="checkbox"
              checked={state.bandung}
              onChange={(e) => {
                try {
                  setBandung(e.target.checked);
                } catch {
                  setMessage('Gagal menyimpan pilihan sumber.');
                }
              }}
            />
            <span>
              CCTV / {bandungFeedCameras.length} feed /{' '}
              {bandungCameras.length - bandungFeedCameras.length} titik belum memiliki feed
              terverifikasi
            </span>
          </label>
          <p className="osint-empty">
            Katalog {bandungRetrievedAt}. Koordinat mengikuti lokasi simpang. Ketersediaan stream
            bergantung pada penyedia. Preview HLS terbuka pada skala 500 m atau lebih dekat,
            maksimal 4 lokasi sekaligus.
          </p>
          <a href={bandungSource} target="_blank" rel="noreferrer">
            Portal resmi ATCS
          </a>
        </fieldset>
        {draft.map((s) => (
          <fieldset key={s.id}>
            <legend>{s.name || 'Sumber baru'}</legend>
            <label>
              Nama
              <input
                maxLength={100}
                value={s.name}
                onChange={(e) => patch(s.id, { name: e.target.value })}
              />
            </label>
            <label>
              Jenis
              <select
                value={s.kind}
                onChange={(e) =>
                  patch(s.id, { kind: e.target.value as SurveillanceSource['kind'] })
                }
              >
                <option value="camera">CCTV camera</option>
                <option value="news">Live news</option>
              </select>
            </label>
            <label>
              URL halaman / player
              <input
                type="url"
                placeholder="https://…"
                value={s.url}
                onChange={(e) => patch(s.id, { url: e.target.value })}
              />
            </label>
            <label>
              URL gambar preview (opsional)
              <input
                type="url"
                placeholder="https://…/snapshot.jpg"
                value={s.previewUrl}
                onChange={(e) => patch(s.id, { previewUrl: e.target.value })}
              />
            </label>
            <div className="osint-coordinate-fields">
              <label>
                Latitude
                <input
                  type="number"
                  min="-85"
                  max="85"
                  step="any"
                  value={Number.isNaN(s.latitude) ? '' : (s.latitude ?? '')}
                  onChange={(e) => patch(s.id, { latitude: e.target.valueAsNumber })}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={Number.isNaN(s.longitude) ? '' : (s.longitude ?? '')}
                  onChange={(e) => patch(s.id, { longitude: e.target.valueAsNumber })}
                />
              </label>
            </div>
            <button
              aria-label={'Delete ' + (s.name || 'source')}
              title="Hapus sumber"
              onClick={() => setDraft(draft.filter((v) => v.id !== s.id))}
            >
              <Trash2 size={13} />
            </button>
          </fieldset>
        ))}
        <div className="osint-config-actions">
          <button
            disabled={draft.length >= 200}
            onClick={() =>
              setDraft([
                ...draft,
                {
                  id: crypto.randomUUID(),
                  name: '',
                  kind: 'camera',
                  url: '',
                  previewUrl: '',
                  latitude: NaN,
                  longitude: NaN,
                },
              ])
            }
          >
            <Plus size={13} />
            Tambah sumber
          </button>
          <button
            onClick={() => {
              try {
                saveSurveillance(draft);
                setMessage('Konfigurasi OSINT tersimpan.');
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Gagal menyimpan konfigurasi.');
              }
            }}
          >
            <Save size={13} />
            Simpan
          </button>
        </div>
        <p className="osint-empty">
          Gunakan URL HTTP(S) tanpa kredensial. Preview mendukung gambar/snapshot, bukan RTSP.
          Sumber dibuka melalui player/halaman aslinya.
        </p>
        {message && (
          <p role="status" className="osint-empty">
            {message}
          </p>
        )}
      </section>
    );
  return (
    <section className="osint-surveillance-panel">
      <label className="osint-weather-toggle">
        <input
          role="switch"
          type="checkbox"
          checked={state.cameras}
          onChange={(e) => useSurveillance.setState({ cameras: e.target.checked })}
        />
        <span>
          <strong>CCTV CAMERAS</strong>
        </span>
        <output>{cameras.toLocaleString('id-ID')}</output>
      </label>
      <div className="osint-weather-children">
        <label className="osint-weather-toggle">
          <input
            role="switch"
            type="checkbox"
            disabled={!state.cameras}
            checked={state.previews}
            onChange={(e) => useSurveillance.setState({ previews: e.target.checked })}
          />
          <span>
            <strong>LIVE PREVIEWS</strong>
          </span>
        </label>
      </div>
      <div className="osint-weather-children">
        <label className="osint-weather-toggle">
          <input
            role="switch"
            type="checkbox"
            disabled={!state.cameras}
            checked={state.showOffline}
            onChange={(e) => useSurveillance.setState({ showOffline: e.target.checked })}
          />
          <span>
            <strong>CAMERA OFFLINE</strong>
          </span>
          <output aria-label="Jumlah kamera offline" aria-live="polite">
            {offlineCount.toLocaleString('id-ID')}
          </output>
        </label>
      </div>
      <label className="osint-weather-toggle">
        <input
          role="switch"
          type="checkbox"
          checked={state.news}
          onChange={(e) => useSurveillance.setState({ news: e.target.checked })}
        />
        <span>
          <strong>LIVE NEWS FEEDS</strong>
        </span>
        <output>{news.toLocaleString('id-ID')}</output>
      </label>
      {!state.sources.length && !state.bandung && (
        <p className="osint-empty">Belum ada sumber. Tambahkan melalui ikon setting.</p>
      )}
    </section>
  );
}
