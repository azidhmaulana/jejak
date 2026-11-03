import { useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Settings,
  Plane,
  Ship,
  Bus,
  Satellite,
  Camera,
  CloudLightning,
  AlertTriangle,
  Network,
  Sun,
  Radar,
  Radio,
  BarChart3,
  Bluetooth,
  CloudSun,
  Layers,
  Map,
  SlidersHorizontal,
  X,
  RotateCcw,
  Maximize2,
  Minimize2,
  Copy,
  Check,
} from 'lucide-react';
import BmsObjectsPanel from '../../../modules/drawing/BmsObjectsPanel';
import DrawingStyleFields from '../../../modules/drawing/DrawingStyleFields';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
import { useOverlays } from '../../../modules/overlays/imageOverlayStore';
import './OsintSidebar.css';
import OsintSurveillancePanel from '../../surveillance/components/OsintSurveillancePanel';
import OsintWeatherPanel from '../../weather/components/OsintWeatherPanel';
import { useOsintWeather } from '../../weather/osintWeatherStore';
const feeds = [
  { id: 'aviation', label: 'AVIATION', icon: Plane },
  { id: 'maritime', label: 'MARITIME', icon: Ship },
  { id: 'transport', label: 'TRANSPORT', icon: Bus },
  { id: 'satellites', label: 'SATELLITES', icon: Satellite },
  { id: 'cctv', label: 'SURVEILLANCE', icon: Camera },
  { id: 'storms', label: 'STORMS', icon: CloudLightning },
  { id: 'alerts', label: 'ALERTS', icon: AlertTriangle },
  { id: 'infrastructure', label: 'INFRASTRUCTURE', icon: Network },
  { id: 'environment', label: 'ENVIRONMENT', icon: Sun },
  { id: 'intelligence', label: 'INTELLIGENCE', icon: Radar },
  { id: 'signals', label: 'SIGNALS', icon: Radio },
  { id: 'analytics', label: 'ANALYTICS', icon: BarChart3 },
  { id: 'bluetooth', label: 'BLUETOOTH', icon: Bluetooth },
] as const;
type Panel = 'objects' | 'layers' | 'style' | 'weather' | (typeof feeds)[number]['id'];
const presets = [
  ['BMS', '#00c8f4', '#40d9ff'],
  ['PHANTOM', '#b47cff', '#8495ff'],
  ['TERMINAL', '#00e6a0', '#6affc8'],
  ['CRIMSON', '#ff3d57', '#ff8a9a'],
  ['ARCTIC', '#8bd5ff', '#c9ecff'],
  ['BLACKOUT', '#999999', '#dddddd'],
] as const;
const defaults = { primary: '#00c8f4', secondary: '#40d9ff', glow: 35, controls: true };
function readStyle() {
  try {
    const value = JSON.parse(localStorage.getItem('osint-sidebar-style-v2') || 'null');
    return {
      primary: /^#[0-9a-f]{6}$/i.test(value?.primary) ? value.primary : defaults.primary,
      secondary: /^#[0-9a-f]{6}$/i.test(value?.secondary) ? value.secondary : defaults.secondary,
      glow: Number.isFinite(value?.glow) ? Math.max(0, Math.min(100, value.glow)) : 35,
      controls: typeof value?.controls === 'boolean' ? value.controls : true,
    };
  } catch {
    return defaults;
  }
}
export default function OsintSidebar() {
  const [panel, setPanel] = useState<Panel | null>(null),
    [expanded, setExpanded] = useState(false),
    [style, setStyle] = useState(readStyle),
    [copied, setCopied] = useState(false),
    [notice, setNotice] = useState('');
  const [surveillanceConfig, setSurveillanceConfig] = useState(false);
  useEffect(() => {
    if (panel !== 'cctv') setSurveillanceConfig(false);
  }, [panel]);
  const surveillanceActive = useSurveillance((state) => state.cameras || state.news);
  const weatherCount = useOsintWeather((s) => Number(s.clouds) + Number(s.wind) + Number(s.rain));
  const lastPanel = useRef<NonNullable<typeof panel>>('style');
  if (panel) lastPanel.current = panel;
  const shownPanel = panel ?? lastPanel.current;
  const selectedFeed = feeds.find((feed) => feed.id === shownPanel);
  const anchor = useRef<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<CSSProperties>({});
  const position = (element: HTMLElement) => {
    anchor.current = element;
    const main = element.closest<HTMLElement>('.osint-map-workspace');
    if (!main) return;
    const bounds = main.getBoundingClientRect(),
      button = element.getBoundingClientRect();
    const top = Math.max(0, button.top - bounds.top),
      right = Boolean(element.closest('.osint-right-rail'));
    setPlacement({
      top,
      bottom: 'auto',
      left: right ? 'auto' : button.right - bounds.left + 8,
      right: right ? bounds.right - button.left + 8 : 'auto',
      maxHeight: Math.max(80, bounds.height - top - 8),
    });
  };
  useEffect(() => {
    const open = (event: Event) => {
      const { id, element } = (event as CustomEvent<{ id: Panel; element: HTMLElement }>).detail;
      if (['objects', 'layers', 'style', 'weather', ...feeds.map((f) => f.id)].includes(id)) {
        position(element);
        setPanel(id);
      }
    };
    window.addEventListener('osint-open-panel', open);
    return () => window.removeEventListener('osint-open-panel', open);
  }, []);
  useEffect(() => {
    const update = () => {
      if (anchor.current) position(anchor.current);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const panelElement = useRef<HTMLElement | null>(null);
  const rail = useRef<HTMLElement>(null),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const features = useMapTools((s) => s.features),
    visible = useMapTools((s) => s.drawingsVisible),
    overlays = useOverlays((s) => s.items),
    hidden = useOverlays((s) => s.hidden);
  useEffect(() => {
    const main = rail.current?.closest<HTMLElement>('.osint-map-workspace');
    if (!main) return;
    main.style.setProperty('--osint-primary', style.primary);
    main.style.setProperty('--osint-secondary', style.secondary);
    main.style.setProperty('--osint-glow', String(style.glow / 100));
    main.dataset.mapControls = String(style.controls);
    try {
      localStorage.setItem('osint-sidebar-style-v2', JSON.stringify(style));
    } catch {}
  }, [style]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null);
        rail.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        rail.current?.contains(target) ||
        panelElement.current?.contains(target)
      )
        return;
      if (
        document.activeElement instanceof HTMLElement &&
        panelElement.current?.contains(document.activeElement)
      )
        document.activeElement.blur();
      setPanel(null);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [panel]);
  // Allow crossing the small gap into the panel without closing its controls.
  useEffect(() => {
    if (!panel || panel === 'style') return;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = event.target;
      if (
        target instanceof Node &&
        (anchor.current?.contains(target) || panelElement.current?.contains(target))
      ) {
        clearTimeout(closeTimer);
        closeTimer = undefined;
        return;
      }
      if (closeTimer === undefined) closeTimer = setTimeout(() => setPanel(null), 180);
    };
    document.addEventListener('pointermove', move);
    return () => {
      clearTimeout(closeTimer);
      document.removeEventListener('pointermove', move);
    };
  }, [panel]);
  const show = (next: Panel, element: HTMLElement) => {
    position(element);
    setPanel(next);
    setNotice('');
  };
  const toggle = (next: Panel, element: HTMLElement) => {
    position(element);
    setPanel((current) => (current === next ? null : next));
    setNotice('');
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(style, null, 2));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice('Tidak dapat menyalin pengaturan.');
    }
  }
  return (
    <>
      <nav ref={rail} className="osint-icon-rail" aria-label="OSINT sidebar">
        <button
          aria-label="Weather"
          title="Weather"
          aria-pressed={panel === 'weather'}
          aria-expanded={panel === 'weather'}
          aria-controls="osint-sidebar-panel"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') show('weather', event.currentTarget);
          }}
          onClick={(event) => show('weather', event.currentTarget)}
        >
          <CloudSun size={18} />
          {weatherCount > 0 && <span className="osint-rail-count">{weatherCount}</span>}
        </button>
        {feeds.slice(0, 9).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-label={label}
            title={label}
            aria-pressed={panel === id}
            aria-expanded={panel === id}
            aria-controls="osint-sidebar-panel"
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') show(id, event.currentTarget);
            }}
            onClick={(event) => show(id, event.currentTarget)}
          >
            <Icon size={17} />
          </button>
        ))}
        <button
          aria-label="Objects and groups"
          title="Objects and groups"
          aria-pressed={panel === 'objects'}
          aria-expanded={panel === 'objects'}
          aria-controls="osint-sidebar-panel"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') show('objects', event.currentTarget);
          }}
          onClick={(event) => show('objects', event.currentTarget)}
        >
          <Map size={17} />
          {features.length > 0 && <span className="osint-rail-count">{features.length}</span>}
        </button>
        <button
          aria-label="Map layers"
          title="Map layers"
          aria-pressed={panel === 'layers'}
          aria-expanded={panel === 'layers'}
          aria-controls="osint-sidebar-panel"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') show('layers', event.currentTarget);
          }}
          onClick={(event) => show('layers', event.currentTarget)}
        >
          <Layers size={17} />
          {overlays.length > 0 && <span className="osint-rail-count">{overlays.length}</span>}
        </button>
        <button
          className="osint-style-button"
          aria-label="Style studio"
          title="Style studio"
          aria-pressed={panel === 'style'}
          aria-expanded={panel === 'style'}
          aria-controls="osint-sidebar-panel"
          onClick={(event) => toggle('style', event.currentTarget)}
        >
          <SlidersHorizontal size={17} />
        </button>
      </nav>
      <aside
        style={
          shownPanel === 'style'
            ? { top: 'auto', bottom: 8, maxHeight: 'calc(100% - 56px)' }
            : placement
        }
        id="osint-sidebar-panel"
        ref={(element) => {
          panelElement.current = element;
          if (element) element.inert = !panel;
        }}
        aria-hidden={!panel}
        className={
          'osint-floating-panel corner-frame' +
          (expanded ? ' is-expanded' : '') +
          (!panel ? ' is-closed' : '')
        }
        aria-label={
          selectedFeed?.label ??
          (shownPanel === 'weather'
            ? 'Weather'
            : shownPanel === 'style'
              ? 'Style studio'
              : shownPanel === 'objects'
                ? 'OSINT objects and layers'
                : 'Map layers')
        }
      >
        <header className="osint-panel-heading">
          <div>
            <strong>
              {selectedFeed?.label ??
                (shownPanel === 'weather'
                  ? 'WEATHER'
                  : shownPanel === 'style'
                    ? 'STYLE STUDIO'
                    : shownPanel === 'objects'
                      ? 'MAP OBJECTS'
                      : 'MAP LAYERS')}
            </strong>
            <small>{shownPanel === 'style' ? 'LIVE UI TOKENS' : 'OSINT WORKSPACE'}</small>
          </div>
          <span className="osint-panel-divider" aria-hidden="true" />
          <div className="osint-panel-actions">
            {shownPanel === 'cctv' && (
              <>
                <span className="osint-panel-status" data-active={surveillanceActive} role="status">
                  <i />
                  {surveillanceActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
                <button
                  title="Surveillance settings"
                  aria-label="Surveillance settings"
                  aria-pressed={surveillanceConfig}
                  onClick={() => setSurveillanceConfig(!surveillanceConfig)}
                >
                  <Settings />
                </button>
              </>
            )}
            {shownPanel === 'style' && (
              <>
                <button title="Copy style" aria-label="Copy style" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                </button>
                <button
                  title="Reset style"
                  aria-label="Reset style"
                  onClick={() => setStyle({ ...defaults })}
                >
                  <RotateCcw />
                </button>
              </>
            )}
            {shownPanel !== 'cctv' && (
              <>
                <button
                  title={expanded ? 'Compact panel' : 'Expand panel'}
                  aria-label={expanded ? 'Compact panel' : 'Expand panel'}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? <Minimize2 /> : <Maximize2 />}
                </button>
                <button
                  title="Close sidebar"
                  aria-label="Close sidebar"
                  onClick={() => {
                    rail.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();
                    setPanel(null);
                  }}
                >
                  <X />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="osint-panel-scroll">
          {selectedFeed && shownPanel !== 'cctv' && (
            <section className="osint-studio-section">
              <h3>{selectedFeed.label}</h3>
              <p className="osint-empty">
                Sumber data {selectedFeed.label.toLowerCase()} belum terhubung ke workspace OSINT
                ini.
              </p>
              <p className="osint-empty">Belum ada data live untuk ditampilkan.</p>
            </section>
          )}
          {shownPanel === 'cctv' && (
            <OsintSurveillancePanel
              key={String(surveillanceConfig)}
              config={surveillanceConfig}
              onBack={() => setSurveillanceConfig(false)}
            />
          )}
          {shownPanel === 'weather' && <OsintWeatherPanel />}
          {shownPanel === 'objects' && (
            <div className="osint-map-objects">
              <BmsObjectsPanel />
            </div>
          )}
          {shownPanel === 'layers' && (
            <section className="osint-studio-section">
              <h3>MAP LAYERS</h3>
              <label className="osint-layer-row">
                <span>
                  Drawing objects <small>{features.length}</small>
                </span>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) =>
                    useMapTools.setState({ drawingsVisible: event.target.checked })
                  }
                />
              </label>
              <h3>IMAGE OVERLAYS</h3>
              {overlays.length ? (
                overlays.map((item) => (
                  <label className="osint-layer-row" key={item.id}>
                    <span>{item.name}</span>
                    <input
                      type="checkbox"
                      checked={!hidden.includes(item.id)}
                      onChange={(event) =>
                        useOverlays.setState({
                          hidden: event.target.checked
                            ? hidden.filter((id) => id !== item.id)
                            : [...hidden, item.id],
                        })
                      }
                    />
                  </label>
                ))
              ) : (
                <p className="osint-empty">
                  Belum ada image overlay. Tambahkan melalui toolbar peta.
                </p>
              )}
            </section>
          )}
          {shownPanel === 'style' && (
            <>
              <div className="osint-style-preview">
                <span className="osint-preview-cross" />
                <span>OSINT / MAP WORKSPACE</span>
                <small>Sesuaikan tampilan sidebar dan kontrol peta</small>
              </div>
              <section className="osint-studio-section">
                <h3>PRESET</h3>
                <div className="osint-presets">
                  {presets.map(([name, primary, secondary]) => (
                    <button
                      key={name}
                      aria-pressed={style.primary === primary && style.secondary === secondary}
                      onClick={() => setStyle({ ...style, primary, secondary })}
                    >
                      <i style={{ '--preset': primary } as CSSProperties} />
                      {name}
                    </button>
                  ))}
                </div>
              </section>
              <section className="osint-studio-section">
                <h3>ACCENT</h3>
                {(['primary', 'secondary'] as const).map((key) => (
                  <label key={key} className="osint-token-row">
                    <span>{key.toUpperCase()}</span>
                    <output>{style[key].toUpperCase()}</output>
                    <input
                      aria-label={key + ' accent'}
                      type="color"
                      value={style[key]}
                      onChange={(event) => setStyle({ ...style, [key]: event.target.value })}
                    />
                  </label>
                ))}
                <label className="osint-token-row">
                  <span>GLOW</span>
                  <input
                    aria-label="Accent glow"
                    type="range"
                    min="0"
                    max="100"
                    value={style.glow}
                    onChange={(event) => setStyle({ ...style, glow: Number(event.target.value) })}
                  />
                  <output>{style.glow}%</output>
                </label>
              </section>
              <section className="osint-studio-section">
                <h3>MAP CONTROLS</h3>
                <div className="osint-token-row">
                  <span>ZOOM / COMPASS</span>
                  <div className="osint-segment" role="group" aria-label="Map navigation controls">
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        aria-pressed={style.controls === value}
                        onClick={() => setStyle({ ...style, controls: value })}
                      >
                        {value ? 'ON' : 'OFF'}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="osint-studio-section">
                <h3>DRAWING STYLE</h3>
                <DrawingStyleFields />
              </section>
            </>
          )}
          {notice && (
            <p role="status" className="osint-empty">
              {notice}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
