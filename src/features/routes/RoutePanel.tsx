import { useEffect, useState } from 'react';
import { X, MapPin, Trash2, Car, Bike, Minimize2, Maximize2, Video, Route } from 'lucide-react';
import { api, useAuth } from '../auth/authStore';
import { useRoute, type Point, type TravelMode } from './routeStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { selectCamera } from '../osint/components/CameraDock';
import { useCameraCatalog } from '../osint/hooks/useCameraCatalog';
import './RoutePanel.css';
import PlaceSearch from '../../shared/components/PlaceSearch';
type Saved = {
  id: string;
  name: string;
  start: Point;
  end: Point;
  tolerance: number;
  mode?: TravelMode;
};
export default function RoutePanel() {
  const s = useRoute(),
    user = useAuth((state) => state.user),
    cameras = useCameraCatalog();
  const en = useLanguage() === 'en',
    tx = (id: string, english: string) => (en ? english : id);
  const [saved, setSaved] = useState<Saved[]>([]),
    [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
  const [inputReset, setInputReset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(Boolean(s.result));
  }, [s.result]);
  const canSave = user?.permissions.includes('routes.save');
  const routeCameras =
    s.result?.cameras.filter((camera) => cameras.some((source) => source.id === camera.id)) || [];
  const load = async () => {
    const owner = useAuth.getState().user?.id;
    const data = await api('/routes');
    if (
      owner &&
      useAuth.getState().user?.id === owner &&
      useAuth.getState().user?.permissions.includes('routes.save')
    )
      setSaved(data.routes);
  };
  useEffect(() => {
    setSaved([]);
    setMessage('');
    if (s.open && canSave) void load().catch((e) => setMessage(e.message));
  }, [s.open, user?.id, canSave]);
  if (!s.open || !user?.permissions.includes('routes.use')) return null;
  const change = (key: 'start' | 'end', point: Point | null) =>
    useRoute.setState({ [key]: point, result: null, filter: false });
  return (
    <section
      data-expanded={expanded && Boolean(s.result)}
      className="route-panel"
      translate="no"
      aria-label={tx('Rute CCTV', 'CCTV route')}
    >
      <header>
        <strong>
          <Route size={20} />
          {tx('Rute CCTV', 'CCTV route')}
        </strong>
        <div className="route-header-actions">
          {s.result && (
            <button
              aria-label={expanded ? 'Not expand' : 'Expand'}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          <button
            aria-label="Close route"
            onClick={() => useRoute.setState({ open: false, picking: null })}
          >
            <X size={15} />
          </button>
        </div>
      </header>
      <div className="route-columns">
        <div className="route-editor">
          <div className="route-modes" role="group" aria-label={tx('Kendaraan', 'Vehicle')}>
            <button
              aria-pressed={s.mode === 'car'}
              onClick={() => useRoute.setState({ mode: 'car' })}
            >
              <Car size={16} />
              {tx('Mobil', 'Car')}
            </button>
            <button
              aria-pressed={s.mode === 'motorcycle'}
              onClick={() => useRoute.setState({ mode: 'motorcycle' })}
            >
              <Bike size={16} />
              {tx('Motor', 'Motorcycle')}
            </button>
          </div>
          <PlaceSearch
            key={`start-${inputReset}`}
            label={tx('A · Titik awal', 'A · Start')}
            point={s.start}
            onChange={(p) => change('start', p)}
          />
          <PlaceSearch
            key={`end-${inputReset}`}
            label={tx('B · Tujuan', 'B · Destination')}
            point={s.end}
            onChange={(p) => change('end', p)}
          />
          <small className="route-hint">
            Photon /{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          </small>
          <label>
            {tx('Jarak CCTV dari jalur', 'Camera distance from route')}
            <select
              value={s.tolerance}
              onChange={(e) =>
                useRoute.setState({
                  tolerance: Number(e.target.value),
                  result: null,
                  filter: false,
                })
              }
            >
              {[25, 50, 100].map((v) => (
                <option key={v} value={v}>
                  {v} m
                </option>
              ))}
            </select>
          </label>
          <div className="route-actions">
            <button disabled={!s.start || !s.end || s.busy} onClick={() => void s.calculate()}>
              {s.busy ? tx('Menghitung...', 'Calculating...') : tx('Cari rute', 'Find route')}
            </button>
            <button
              className="route-pick"
              aria-pressed={Boolean(s.picking)}
              onClick={() => useRoute.setState({ picking: s.picking ? null : 'start' })}
            >
              <MapPin size={13} />
              {tx('Isi A & B', 'Fill A & B')}
            </button>
            <button
              className="route-clear"
              onClick={() => {
                s.clear();
                setInputReset((value) => value + 1);
              }}
            >
              {tx('Bersihkan', 'Clear')}
            </button>
          </div>
          {s.picking && (
            <p role="status" className="route-hint">
              {tx(
                `Klik titik ${s.picking === 'start' ? 'A' : 'B'} di peta`,
                `Click point ${s.picking === 'start' ? 'A' : 'B'} on the map`,
              )}
            </p>
          )}
          {s.error && <p role="alert">{s.error}</p>}
          {s.result && (
            <>
              <p>
                {(s.result.distance / 1000).toFixed(1)} km · {Math.round(s.result.duration / 60)}{' '}
                {tx('menit', 'min')} · {routeCameras.length} CCTV
              </p>
              <label className="route-filter">
                <input
                  type="checkbox"
                  checked={s.filter}
                  onChange={(e) => useRoute.setState({ filter: e.target.checked })}
                />
                {tx('Tampilkan CCTV sepanjang rute saja', 'Show only CCTV along route')}
              </label>
              <p className="route-hint">
                {tx(
                  'Dicocokkan berdasarkan jarak lokasi, bukan arah pandang kamera.',
                  'Matched by location distance, not camera viewing direction.',
                )}
              </p>
              {canSave && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSaving(true);
                    setMessage('');
                    void api('/routes', 'POST', { ...s.result, name })
                      .then(async () => {
                        setName('');
                        await load();
                        setMessage(tx('Rute tersimpan.', 'Route saved.'));
                      })
                      .catch((e) => setMessage(e.message))
                      .finally(() => setSaving(false));
                  }}
                >
                  <label>
                    {tx('Nama rute', 'Route name')}
                    <input
                      value={name}
                      maxLength={80}
                      required
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <button disabled={saving}>{tx('Simpan rute', 'Save route')}</button>
                </form>
              )}
              <small>
                {s.result.provider.split(' / ')[0]} /{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap
                </a>{' '}
                &middot;{' '}
                <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">
                  {tx('Perbaiki peta', 'Fix the map')}
                </a>
              </small>
            </>
          )}
          {message && <p role="status">{message}</p>}
          {canSave && (
            <>
              <h4>{tx('Rute tersimpan', 'Saved routes')}</h4>
              {!saved.length && <p>{tx('Belum ada rute tersimpan.', 'No saved routes yet.')}</p>}
              {saved.map((r) => (
                <div className="saved-route" key={r.id}>
                  <button
                    disabled={s.busy}
                    onClick={() => {
                      useRoute.setState({
                        start: r.start,
                        end: r.end,
                        tolerance: r.tolerance,
                        mode: r.mode || 'car',
                      });
                      void useRoute.getState().calculate();
                    }}
                  >
                    {r.name}
                  </button>
                  <button
                    aria-label={`${tx('Hapus', 'Delete')} ${r.name}`}
                    onClick={() => {
                      void api(`/routes/${r.id}`, 'DELETE')
                        .then(load)
                        .catch((e) => setMessage(e.message));
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="route-results-shell" aria-hidden={!expanded || !s.result}>
          {s.result && expanded && (
            <section
              className="route-results"
              aria-label={tx('CCTV sepanjang rute', 'CCTV along route')}
            >
              <header>
                <strong>
                  <Video size={18} />
                  {tx('CCTV sepanjang rute', 'CCTV along route')}
                </strong>
                <span>{routeCameras.length} CCTV</span>
              </header>
              <ol className="route-cameras">
                {routeCameras.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        const source = cameras.find((v) => v.id === c.id);
                        if (source) selectCamera(source);
                      }}
                    >
                      <Video size={19} className="route-camera-icon" />
                      <span>
                        {c.name}
                        <small>
                          {(c.distanceAlongRoute / 1000).toFixed(1)} km · {c.distanceFromRoute} m{' '}
                          {tx('dari jalur', 'from route')}
                        </small>
                      </span>
                      <MapPin size={17} />
                    </button>
                  </li>
                ))}
              </ol>
              {!routeCameras.length && (
                <p>
                  {tx(
                    'Tidak ada CCTV pada jarak yang dipilih.',
                    'No CCTV within the selected distance.',
                  )}
                </p>
              )}

              <div className="route-summary">
                <Route size={16} /> A &rarr; B{' '}
                <span>{(s.result.distance / 1000).toFixed(1)} km</span>
                <span>{routeCameras.length} CCTV</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
