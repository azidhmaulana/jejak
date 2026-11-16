import { requestMapCommand } from './mapCommands';
import { LocateFixed, Home, Ruler } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Cctv,
  CloudSun,
  Flame,
  Layers,
  Map,
  MapPinned,
  Menu,
  Route,
  Satellite,
  Search,
  X,
} from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useAuth } from '../../auth/authStore';
import { requireFeatureLogin } from '../../auth/LoginRequiredPopover';
import { useEarthquakes } from '../../earthquakes/earthquakeStore';
import { useHotspots } from '../../hotspots/hotspotStore';
import { useSurveillance } from '../../surveillance/osintSurveillanceStore';
import { useRoute } from '../../routes/routeStore';
import { useWorkspace, type WorkspacePanel } from '../workspaceStore';
import LanguageToggle from './LanguageToggle';
import SurveillanceSettings from './SurveillanceSettings';
import WorkspaceFullscreen from './WorkspaceFullscreen';

export default function MobileNavigation({ onSearch }: { onSearch: () => void }) {
  const en = useLanguage() === 'en';
  const { panel, camerasOpen, selectedId } = useWorkspace();
  const user = useAuth((state) => state.user);
  const quakes = useEarthquakes((state) => state.enabled);
  const hotspots = useHotspots((state) => state.enabled);
  const selectedQuake = useEarthquakes(state => state.selected?.id);
  const selectedHotspot = useHotspots(state => state.selected?.id);
  useEffect(() => {
    if (window.innerWidth <= 700 && (selectedQuake || selectedHotspot)) {
      const active = useWorkspace.getState().panel;
      if (active === 'earthquakes' || active === 'hotspots' || active === 'regions') useWorkspace.setState({panel:null});
    }
  }, [selectedQuake, selectedHotspot]);
  const cameras = useSurveillance((state) => state.cameras);
  const [menu, setMenu] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const open = (next: WorkspacePanel) => {
    useEarthquakes.setState({selected:null});
    useHotspots.setState({selected:null});
    useRoute.setState({ open: false, picking: null });
    useWorkspace.setState({
      panel: panel === next ? null : next,
      camerasOpen: false,
      selectedId: null,
    });
    setMenu(false);
  };
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        menuTrigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  return (
    <div className="mobile-navigation" ref={host}>
      <button
        ref={menuTrigger}
        className="mobile-menu-trigger"
        aria-label={en ? 'More navigation' : 'Navigasi lainnya'}
        aria-expanded={menu}
        aria-controls="mobile-menu"
        onClick={() => setMenu(!menu)}
      >
        <Menu />
      </button>
      <div className="mobile-search-layers">
        <button
          className="mobile-search-trigger"
          aria-label="Search cameras"
          onClick={() => {
            setMenu(false);
            onSearch();
          }}
        >
          <Search />
          <span>{en ? 'Search cameras or locations' : 'Cari kamera atau lokasi'}</span>
        </button>
        <div className="mobile-layer-chips" aria-label={en ? 'Layer settings' : 'Pengaturan layer'}>
          {[
            { id: 'surveillance', label: 'CCTV', Icon: Cctv, enabled: cameras },
            {
              id: 'earthquakes',
              label: en ? 'Earthquakes' : 'Gempa',
              Icon: Activity,
              enabled: quakes,
            },
            { id: 'hotspots', label: 'Hotspot', Icon: Flame, enabled: hotspots },
          ].map(({ id, label, Icon, enabled }) => (
            <button
              key={id}
              aria-label={
                id === 'surveillance'
                  ? 'Camera catalog'
                  : id === 'earthquakes'
                    ? en
                      ? 'Earthquakes'
                      : 'Gempa bumi'
                    : 'Hotspots'
              }
              aria-expanded={panel === id}
              onClick={() => open(id as WorkspacePanel)}
            >
              <Icon />
              <span>{label}</span>
              <i
                data-enabled={enabled}
                aria-label={
                  enabled
                    ? en
                      ? 'Markers on'
                      : 'Marker aktif'
                    : en
                      ? 'Markers off'
                      : 'Marker nonaktif'
                }
              />
            </button>
          ))}
        </div>
      </div>
      {panel === 'surveillance' && (
        <SurveillanceSettings onClose={() => useWorkspace.setState({ panel: null })} />
      )}
      {menu && (
        <section
          id="mobile-menu"
          className="mobile-menu-sheet"
          aria-label={en ? 'More features' : 'Fitur lainnya'}
        >
          <header>
            <strong>Menu</strong>
            <button aria-label={en ? 'Close menu' : 'Tutup menu'} onClick={() => setMenu(false)}>
              <X />
            </button>
          </header>
          <div className="mobile-menu-options">
            <button onClick={(event) => requireFeatureLogin(event, () => open('objects'))}>
              <Layers />
              {en ? 'Drawing tools' : 'Alat gambar'}
            </button>
            {(!user || user.permissions.includes('routes.use')) && (
              <button
                onClick={(event) =>
                  requireFeatureLogin(event, () => {
                    useWorkspace.setState({ panel: null, camerasOpen: false, selectedId: null });
                    useRoute.setState({ open: true, picking: null });
                    setMenu(false);
                  })
                }
              >
                <Route />
                {en ? 'CCTV route' : 'Rute CCTV'}
              </button>
            )}
            <button onClick={() => open('space')}>
              <Satellite />
              {en ? 'Live from space' : 'Siaran antariksa'}
            </button>
            <button onClick={() => open('weather')}>
              <CloudSun />
              {en ? 'Weather' : 'Cuaca'}
            </button>
            <button
              onClick={() => {
                requestMapCommand('locate');
                setMenu(false);
              }}
            >
              <LocateFixed />
              {en ? 'My location' : 'Lokasi saya'}
            </button>
            <button
              onClick={() => {
                requestMapCommand('reset');
                setMenu(false);
              }}
            >
              <Home />
              {en ? 'Reset map' : 'Reset peta'}
            </button>
            <button
              onClick={() => {
                requestMapCommand('measure');
                setMenu(false);
              }}
            >
              <Ruler />
              {en ? 'Measure distance' : 'Ukur jarak'}
            </button>
          </div>
          <footer>
            <LanguageToggle />
            <WorkspaceFullscreen />
          </footer>
        </section>
      )}
      <nav className="mobile-bottom-nav" aria-label={en ? 'Mobile navigation' : 'Navigasi mobile'}>
        <button
          aria-label={en ? 'Map' : 'Peta'}
          aria-current={!panel && !camerasOpen && !selectedId && !menu ? 'page' : undefined}
          onClick={() => {
            setMenu(false);
            useRoute.setState({ open: false, picking: null });
            useWorkspace.setState({ panel: null, camerasOpen: false, selectedId: null });
          }}
        >
          <Map />
          <span>{en ? 'Map' : 'Peta'}</span>
        </button>
        <button
          aria-label="CCTV"
          aria-current={camerasOpen || selectedId ? 'page' : undefined}
          onClick={() => {
            setMenu(false);
            useRoute.setState({ open: false, picking: null });
            useWorkspace.setState({ panel: null, camerasOpen: !camerasOpen });
          }}
        >
          <Cctv />
          <span>CCTV</span>
        </button>
        <button
          aria-label={en ? 'Regions' : 'Wilayah'}
          aria-current={panel === 'regions' ? 'page' : undefined}
          onClick={() => open('regions')}
        >
          <MapPinned />
          <span>{en ? 'Regions' : 'Wilayah'}</span>
        </button>
        <button
          aria-label={en ? 'Analytics' : 'Analitik'}
          aria-current={panel === 'analytics' ? 'page' : undefined}
          onClick={(event) => requireFeatureLogin(event, () => open('analytics'))}
        >
          <BarChart3 />
          <span>{en ? 'Analytics' : 'Analitik'}</span>
        </button>
        <button
          aria-label="Menu"
          aria-expanded={menu}
          aria-current={menu ? 'page' : undefined}
          onClick={() => setMenu(!menu)}
        >
          <Menu />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
