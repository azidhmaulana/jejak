import { useEffect, useState } from 'react';
import { X, MapPin, Trash2 } from 'lucide-react';
import { api, useAuth } from '../auth/authStore';
import { useRoute, type Point } from './routeStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { selectCamera } from '../osint/components/CameraDock';
import { useCameraCatalog } from '../osint/hooks/useCameraCatalog';
import './RoutePanel.css';
type Saved = { id: string; name: string; start: Point; end: Point; tolerance: number };
function Coordinate({
  label,
  point,
  onChange,
}: {
  label: string;
  point: Point | null;
  onChange: (p: Point) => void;
}) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(point ? `${point[1].toFixed(6)}, ${point[0].toFixed(6)}` : ''), [point]);
  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        placeholder="-6.9175, 107.6191"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const parts = value.split(',').map(Number);
          if (
            parts.length === 2 &&
            parts.every(Number.isFinite) &&
            Math.abs(parts[0]) <= 85 &&
            Math.abs(parts[1]) <= 180
          )
            onChange([parts[1], parts[0]]);
          else setValue(point ? `${point[1]}, ${point[0]}` : '');
        }}
      />
    </label>
  );
}
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
  const change = (key: 'start' | 'end', point: Point) =>
    useRoute.setState({ [key]: point, result: null, filter: false });
  return (
    <section className="route-panel" translate="no" aria-label={tx('Rute CCTV', 'CCTV route')}>
      <header>
        <strong>{tx('Rute CCTV', 'CCTV route')}</strong>
        <button
          aria-label="Close route"
          onClick={() => useRoute.setState({ open: false, picking: null })}
        >
          <X size={15} />
        </button>
      </header>
      <Coordinate
        label={tx('A · Titik awal (lat, lon)', 'A · Start (lat, lon)')}
        point={s.start}
        onChange={(p) => change('start', p)}
      />
      <Coordinate
        label={tx('B · Tujuan (lat, lon)', 'B · Destination (lat, lon)')}
        point={s.end}
        onChange={(p) => change('end', p)}
      />
      <button onClick={() => useRoute.setState({ picking: 'start' })}>
        <MapPin size={13} />
        {s.picking
          ? tx(
              `Klik titik ${s.picking === 'start' ? 'A' : 'B'} di peta`,
              `Click point ${s.picking === 'start' ? 'A' : 'B'} on the map`,
            )
          : tx('Pilih A & B di peta', 'Pick A & B on map')}
      </button>
      <label>
        {tx('Jarak CCTV dari jalur', 'Camera distance from route')}
        <select
          value={s.tolerance}
          onChange={(e) =>
            useRoute.setState({ tolerance: Number(e.target.value), result: null, filter: false })
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
        <button onClick={s.clear}>{tx('Bersihkan', 'Clear')}</button>
      </div>
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
          <ol className="route-cameras">
            {routeCameras.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    const source = cameras.find((v) => v.id === c.id);
                    if (source) selectCamera(source);
                  }}
                >
                  {c.name}
                  <small>
                    {(c.distanceAlongRoute / 1000).toFixed(1)} km · {c.distanceFromRoute} m{' '}
                    {tx('dari jalur', 'from route')}
                  </small>
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
            OSRM /{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            ?{' '}
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
                  useRoute.setState({ start: r.start, end: r.end, tolerance: r.tolerance });
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
    </section>
  );
}
