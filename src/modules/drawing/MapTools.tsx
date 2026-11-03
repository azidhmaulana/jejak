import { isOsintMap, mapWorkspaceLabel } from '../maps/mapWorkspace';
import { useOfflineSelection } from '../maps/offlineSelectionStore';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  MousePointer2,
  MapPin,
  Slash,
  Hexagon,
  Square,
  Circle,
  Ruler,
  Search,
  X,
  Image,
  Shield,
  Layers,
  Upload,
  ListFilter,
  Download,
  Crosshair,
} from 'lucide-react';
import { useMapTools, type DrawMode } from './mapToolsStore';
import { formatDistance, measureDrawing, parseCoordinates } from './mapMeasurements';
import { drawingCenter } from './drawingGeometry';
import { objectName, objectFolder, objectZone, objectLocked } from './drawingObjects';
import MapImportPanel from './MapImportPanel';
import DrawingContextMenu from './DrawingContextMenu';
import './MapTools.css';
import ImageOverlayPanel from '../overlays/ImageOverlayPanel';
import { useOverlays, overlayRequest } from '../overlays/imageOverlayStore';

const modes: { mode: DrawMode; label: string; hint: string; icon: ReactNode }[] = [
  {
    mode: 'select',
    label: 'Select / Edit',
    hint: 'Pilih / edit — klik objek lalu geser titiknya',
    icon: <MousePointer2 />,
  },
  { mode: 'point', label: 'Point', hint: 'Titik — klik lokasi di peta', icon: <MapPin /> },
  {
    mode: 'linestring',
    label: 'Line',
    hint: 'Garis — klik titik, klik dua kali untuk selesai',
    icon: <Slash />,
  },
  {
    mode: 'polygon',
    label: 'Polygon',
    hint: 'Polygon — klik titik pertama untuk menutup bidang',
    icon: <Hexagon />,
  },
  {
    mode: 'rectangle',
    label: 'Rectangle',
    hint: 'Kotak — klik dua sudut berseberangan',
    icon: <Square />,
  },
  {
    mode: 'circle',
    label: 'Circle',
    hint: 'Lingkaran — klik pusat lalu tentukan radius',
    icon: <Circle />,
  },
];
export type MapSearchResult = {
  id: string;
  title: string;
  detail: string;
  longitude: number;
  latitude: number;
  drawingId?: string | number;
  folderId?: string;
  onSelect?: () => void;
};

export default function MapTools({
  visible,
  searchItems = [],
}: {
  visible: boolean;
  searchItems?: MapSearchResult[];
}) {
  const state = useMapTools();
  const selectingOffline = useOfflineSelection((s) => s.active);
  const [panel, setPanel] = useState<'search' | 'import' | 'layers' | null>(null);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<MapSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ left: 8, bottom: 50 });
  const anchor = useRef<HTMLDivElement>(null),
    popover = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const ready = visible && Boolean(state.controller) && !selectingOffline;
  const guardSelection = state.features.find((feature) => feature.id === state.selectedId);
  const guardSelected = !!guardSelection && objectZone(guardSelection) === 'guard';
  const canToggleGuard =
    ready &&
    !!guardSelection &&
    guardSelection.geometry.type === 'Polygon' &&
    !objectLocked(guardSelection) &&
    objectZone(guardSelection) !== 'white';
  const showPanel = (next: typeof panel, toggle = true) => {
    const rect = (next === 'search' ? searchBox.current : anchor.current)?.getBoundingClientRect();
    const width = 380;
    setPosition({
      left: Math.max(8, Math.min(rect?.left || 8, innerWidth - width - 8)),
      bottom: innerHeight - (rect?.top || innerHeight - 42) + 8,
    });
    setPanel((current) => (toggle && current === next ? null : next));
  };
  useEffect(() => {
    if (!visible) {
      setPanel(null);
      request.current?.abort();
    }
  }, [visible]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => useMapTools.setState({ notice: '' }), 5000);
    return () => window.clearTimeout(timer);
  }, [state.notice]);
  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !popover.current?.contains(event.target as Node)
      )
        setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null);
        request.current?.abort();
      }
    };
    const resize = () => setPanel(null);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [panel]);
  const setMode = (mode: DrawMode) => {
    state.controller?.mode(mode);
    setPanel(null);
  };
  const measured =
    state.preview ||
    state.features.find((feature) => feature.id === state.selectedId) ||
    [...state.features].reverse().find((feature) => feature.properties.mode === state.mode) ||
    [...state.features]
      .reverse()
      .find((feature) =>
        ['linestring', 'circle', 'rectangle', 'polygon'].includes(String(feature.properties.mode)),
      );
  const measurement = measureDrawing(measured);
  const normalized = query.trim().toLowerCase();
  const extraResults = normalized
    ? searchItems.filter((item) =>
        `${item.title} ${item.detail}`.toLowerCase().includes(normalized),
      )
    : [];
  const local: MapSearchResult[] = [
    ...extraResults,
    ...state.features.map((feature) => {
      const [longitude, latitude] = drawingCenter(feature);
      return {
        id: 'drawing-' + feature.id,
        drawingId: feature.id,
        title: objectName(feature),
        detail: `BMS · ${state.folders.find((f) => f.id === objectFolder(feature))?.name || 'Objek utama'}`,
        longitude,
        latitude,
      };
    }),
    ...state.folders.map((folder) => ({
      id: 'group-' + folder.id,
      folderId: folder.id,
      title: folder.name,
      detail: `Group BMS · ${state.features.filter((f) => objectFolder(f) === folder.id).length} objek`,
      longitude: 0,
      latitude: 0,
    })),
  ]
    .filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(normalized))
    .slice(0, 30);
  const choose = (result: MapSearchResult) => {
    if (result.onSelect) result.onSelect();
    else if (result.drawingId !== undefined) state.controller?.focusDrawing(result.drawingId);
    else if (result.folderId) state.controller?.focusFolder(result.folderId);
    else {
      state.controller?.mode('render');
      state.controller?.focus(result.longitude, result.latitude);
    }
    useMapTools.setState({ notice: result.title });
    setPanel(null);
  };
  const searchLocation = async () => {
    request.current?.abort();
    setError('');
    setRemote([]);
    const coordinate = parseCoordinates(query);
    if (coordinate) {
      choose({
        id: 'coordinate',
        title: query,
        detail: '',
        longitude: coordinate[0],
        latitude: coordinate[1],
      });
      return;
    }
    if (extraResults.length) {
      setLoading(false);
      return;
    }
    if (/^-?[\d.]+\s*,/.test(query.trim())) {
      setError('Koordinat harus berupa latitude, longitude yang valid.');
      return;
    }
    if (query.trim().length < 3) {
      setError('Masukkan minimal tiga karakter untuk mencari lokasi.');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      // Location requests are submitted explicitly; local target/sensor filtering stays offline.
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal, headers: { Accept: 'application/json' } },
      );
      if (!response.ok)
        throw Error('Pencarian lokasi tidak tersedia. Coba koordinat atau data lokal.');
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw Error('Respons pencarian tidak valid.');
      const results = rows
        .filter((row) => Number.isFinite(Number(row.lon)) && Number.isFinite(Number(row.lat)))
        .map((row) => ({
          id: `location-${row.place_id}`,
          title: String(row.display_name),
          detail: 'OpenStreetMap',
          longitude: Number(row.lon),
          latitude: Number(row.lat),
        }));
      if (request.current === controller) {
        setRemote(results);
        if (!results.length) setError('Lokasi tidak ditemukan.');
      }
    } catch (cause) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? 'Pencarian dibatalkan atau melewati batas waktu.'
            : cause instanceof Error
              ? cause.message
              : 'Pencarian gagal.',
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  };
  if (!visible) return null;
  return (
    <>
      <div ref={anchor} className="map-tools" role="toolbar" aria-label="Map tools">
        <form
          ref={searchBox}
          className="map-search-box"
          onSubmit={(event) => {
            event.preventDefault();
            showPanel('search', false);
            void searchLocation();
          }}
        >
          <input
            aria-label="Search map query"
            title="Cari lokasi, target, sensor, atau latitude, longitude"
            aria-expanded={panel === 'search'}
            aria-controls="map-search-results"
            placeholder={isOsintMap ? 'Cari data...' : 'Cari peta...'}
            value={query}
            disabled={!ready}
            onFocus={() => showPanel('search', false)}
            onChange={(event) => {
              request.current?.abort();
              request.current = null;
              setLoading(false);
              setRemote([]);
              setError('');
              setQuery(event.target.value);
              showPanel('search', false);
            }}
          />
          <button
            type="submit"
            aria-label="Search map"
            title="Cari lokasi"
            disabled={!ready || loading}
            aria-busy={loading}
          >
            {loading ? '...' : <Search size={14} />}
          </button>
        </form>
        {!isOsintMap && (
          <button
            type="button"
            aria-label="Download offline map"
            title="Pilih area unduhan peta offline"
            aria-pressed={selectingOffline}
            onClick={() => {
              setPanel(null);
              useOfflineSelection.getState().begin();
            }}
            disabled={selectingOffline}
          >
            <Download />
          </button>
        )}
        <span className="map-tools-separator" />
        <button
          type="button"
          aria-label="Import BMS"
          title="Import KML / GeoJSON"
          disabled={!ready}
          aria-pressed={panel === 'import'}
          onClick={() => showPanel('import')}
        >
          <Upload />
        </button>
        <button
          type="button"
          aria-label="Map layers"
          title="Layer objek, sensor, target"
          disabled={!ready}
          aria-pressed={panel === 'layers'}
          onClick={() => showPanel('layers')}
        >
          <ListFilter />
        </button>
        <button
          type="button"
          className="map-bms-toggle"
          aria-label="BMS drawing tools"
          title="BMS — gambar dan edit objek peta"
          aria-pressed={state.bms}
          disabled={!ready}
          onClick={() => {
            state.controller?.mode(state.bms ? 'render' : 'select');
            setPanel(null);
          }}
        >
          <Layers />
          <span>{mapWorkspaceLabel}</span>
        </button>
        {state.bms && (
          <div className="map-bms-tools" role="group" aria-label="BMS drawing controls">
            <div className="map-bms-group" role="group" aria-label="Bentuk dan seleksi">
              {modes.map(({ mode, label, hint, icon }) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={label}
                  title={hint}
                  aria-pressed={state.mode === mode}
                  disabled={!ready}
                  onClick={() => setMode(mode)}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="map-bms-group" role="group" aria-label="Ukuran">
              <button
                type="button"
                aria-label="Range measurement"
                title="Ukuran BMS: jarak garis, radius, panjang sisi, dan keliling polygon"
                aria-pressed={state.range}
                disabled={!ready}
                onClick={() => useMapTools.setState({ range: !state.range })}
              >
                <Ruler />
              </button>
              {state.range && (
                <output className="map-measurement" aria-live="polite">
                  {measurement
                    ? `${measurement.label}: ${formatDistance(measurement.meters)}`
                    : measured?.geometry.type === 'Point'
                      ? 'Point tidak memiliki panjang'
                      : 'Gambar / pilih objek'}
                </output>
              )}
            </div>
          </div>
        )}
        <span className="map-tools-separator" />
        <button
          type="button"
          aria-label="Vital Point"
          title="Vital Point — tombol disiapkan, fungsi belum diaktifkan"
          disabled
        >
          <MapPin />
          <span className="map-tool-mini">+</span>
        </button>
        <button
          type="button"
          aria-label="Image Overlay"
          title="Image Overlay"
          disabled={!ready}
          onClick={() => {
            setPanel(null);
            useOverlays.setState({ open: true, draft: null });
            void overlayRequest().catch((e) => useOverlays.setState({ error: e.message }));
          }}
        >
          <Image />
        </button>
        {!isOsintMap && (
          <button
            type="button"
            aria-label="Guard Zone"
            aria-pressed={guardSelected}
            title={
              canToggleGuard
                ? `${guardSelected ? 'Nonaktifkan' : 'Aktifkan'} Guard Zone: ${objectName(guardSelection!)}`
                : 'Pilih area polygon, rectangle, atau circle yang tidak dikunci dan bukan White Zone'
            }
            disabled={!canToggleGuard}
            onClick={() =>
              guardSelection &&
              state.controller?.updateDrawing(guardSelection.id!, {
                zone: guardSelected ? 'none' : 'guard',
              })
            }
          >
            <Shield />
          </button>
        )}
      </div>
      {state.notice && (
        <div className="map-tools-notice" role="status">
          {state.notice}
        </div>
      )}
      <DrawingContextMenu />
      {panel &&
        createPortal(
          <div
            ref={popover}
            className="map-tools-popover corner-frame"
            data-panel={panel}
            style={position}
            role="dialog"
            aria-label={
              panel === 'search'
                ? 'Pencarian peta'
                : panel === 'import'
                  ? 'Import BMS'
                  : 'Layer peta'
            }
          >
            <header>
              <strong>
                {panel === 'search'
                  ? 'SEARCH MAP'
                  : panel === 'import'
                    ? 'IMPORT BMS'
                    : 'MAP LAYERS'}
              </strong>
              <button
                type="button"
                aria-label="Close map tool panel"
                onClick={() => setPanel(null)}
              >
                <X size={14} />
              </button>
            </header>
            {panel === 'import' && <MapImportPanel onDone={() => setPanel(null)} />}
            {panel === 'layers' && (
              <div className="map-layer-options">
                {(
                  [
                    { key: 'drawingsVisible', label: 'Objek ' + mapWorkspaceLabel },
                    { key: 'gps', label: 'Sensor' },
                    { key: 'targetsVisible', label: 'Target' },
                  ] as const
                )
                  .filter((item) => !isOsintMap || item.key === 'drawingsVisible')
                  .map(({ key, label }) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={state[key]}
                        onChange={(event) => useMapTools.setState({ [key]: event.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                <small>Tampilan client ini. Status mata objek/group tetap tersimpan bersama.</small>
              </div>
            )}
            {panel === 'search' && (
              <>
                {error && <p role="status">{error}</p>}
                <div id="map-search-results" className="map-search-results">
                  {[...local, ...remote].map((result) => (
                    <button key={result.id} type="button" onClick={() => choose(result)}>
                      <span className="map-search-result-icon" aria-hidden="true">
                        {result.folderId ? (
                          <Layers />
                        ) : result.drawingId !== undefined ? (
                          <Hexagon />
                        ) : result.id.startsWith('target-') ? (
                          <Crosshair />
                        ) : (
                          <MapPin />
                        )}
                      </span>
                      <span className="map-search-result-text">
                        <strong translate="no">{result.title}</strong>
                        <small>{result.detail}</small>
                      </span>
                    </button>
                  ))}
                  {!local.length && !remote.length && !loading && (
                    <p>Masukkan koordinat, atau tekan Enter untuk mencari tempat.</p>
                  )}
                  {loading && <p role="status">Mencari lokasi...</p>}
                </div>
                <small>Pencarian tempat: OpenStreetMap / Nominatim</small>
              </>
            )}
          </div>,
          document.body,
        )}
      <ImageOverlayPanel />
    </>
  );
}
