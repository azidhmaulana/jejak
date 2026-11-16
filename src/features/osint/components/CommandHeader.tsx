import MobileNavigation from './MobileNavigation';
import WorkspaceFullscreen from './WorkspaceFullscreen';
import LoginRequiredPopover, { requireFeatureLogin } from '../../auth/LoginRequiredPopover';
import { useRegion } from '../../regions/regionStore';
import NavbarCameraSearch from './NavbarCameraSearch';
import JejakLogo from '../../../shared/components/JejakLogo';
import AccountMenu from '../../auth/AccountMenu';
import { useAuth } from '../../auth/authStore';
import { useRoute } from '../../routes/routeStore';
import { Route } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useState } from 'react';
import { MapPinned, Camera, BarChart3, Layers, Map, Search, MoreHorizontal } from 'lucide-react';
import { openWorkspacePanel, useWorkspace } from '../workspaceStore';

export default function CommandHeader() {
  const selectedProvince = useRegion((state) => state.selected);
  const language = useLanguage();
  const mapLabel = language === 'en' ? 'Map' : 'Peta';
  const user = useAuth((state) => state.user);
  const routeOpen = useRoute((state) => state.open);
  const { panel, camerasOpen } = useWorkspace();
  const [search, setSearch] = useState(false);
  const showCameras = () => useWorkspace.setState({ camerasOpen: !camerasOpen, panel: null });
  return (
    <>
      <header className="command-header tactical-header">
        <div className="navbar-capsule">
          <nav className="tactical-nav tactical-nav-left" aria-label="Primary navigation">
            <button
              aria-label={mapLabel}
              title={mapLabel}
              translate="no"
              aria-pressed={true}
              onClick={() =>
                useWorkspace.setState({ panel: null, camerasOpen: false, selectedId: null })
              }
            >
              <Map />
              <span>{mapLabel}</span>
            </button>
            <button aria-label="CCTV" title="CCTV" aria-pressed={camerasOpen} onClick={showCameras}>
              <Camera />
              <span>CCTV</span>
            </button>
            <button
              aria-label="Analitik"
              title="Analitik"
              aria-pressed={panel === 'analytics'}
              onClick={(event) => requireFeatureLogin(event, () => openWorkspacePanel('analytics'))}
            >
              <BarChart3 />
              <span>Analitik</span>
            </button>
          </nav>
          <a className="tactical-brand" href="/" aria-label="JEJAK home" translate="no">
            <JejakLogo full />
          </a>
          <nav className="tactical-nav tactical-nav-right" aria-label="Feature navigation">
            <button
              aria-label="Objek"
              title="Objek"
              aria-pressed={panel === 'objects'}
              onClick={(event) => requireFeatureLogin(event, () => openWorkspacePanel('objects'))}
            >
              <Layers />
              <span>Objek</span>
            </button>
            <button
              aria-label={language === 'en' ? 'Regions' : 'Wilayah'}
              title={selectedProvince || (language === 'en' ? 'Regions' : 'Wilayah')}
              translate="no"
              aria-pressed={panel === 'regions' || Boolean(selectedProvince)}
              onClick={() => openWorkspacePanel('regions')}
            >
              <MapPinned />
              <span>{language === 'en' ? 'Regions' : 'Wilayah'}</span>
            </button>
            {(!user || user.permissions.includes('routes.use')) && (
              <button
                aria-label="CCTV route"
                aria-pressed={routeOpen}
                onClick={(event) => requireFeatureLogin(event, () => useRoute.setState({ open: !routeOpen, picking: null }))}
              >
                <Route />
                <span>Route</span>
              </button>
            )}
          </nav>
        </div>
        <details className="navbar-more">
          <summary aria-label="More navigation">
            <MoreHorizontal size={16} /><span>Menu</span>
          </summary>
          <div onClick={(event) => { const button = (event.target as HTMLElement).closest('button'); if (button && (user || button.hasAttribute('data-public-navigation'))) event.currentTarget.closest('details')?.removeAttribute('open'); }}>
            <button onClick={(event) => requireFeatureLogin(event, () => openWorkspacePanel('analytics'))}>
              <BarChart3 />
              Analitik
            </button>
            <button onClick={(event) => requireFeatureLogin(event, () => openWorkspacePanel('objects'))}>
              <Layers />
              Objek
            </button>
            <button data-public-navigation onClick={() => openWorkspacePanel('regions')}>
              <MapPinned />
              {language === 'en' ? 'Regions' : 'Wilayah'}
            </button>
            {(!user || user.permissions.includes('routes.use')) && (
              <button onClick={(event) => requireFeatureLogin(event, () => useRoute.setState({ open: !routeOpen, picking: null }))}>
                <Route />
                Route
              </button>
            )}
          </div>
        </details>
        <div className="navbar-utilities">
          <LanguageToggle />
          <div className="tactical-actions">
            <button
              aria-label="Search cameras"
              aria-expanded={search}
              onClick={() => {
                setSearch(!search);
                useWorkspace.setState({ camerasOpen: false, cameraTab: 'all', panel: null });
              }}
            >
              <Search />
            </button>
            <WorkspaceFullscreen />
            <AccountMenu />
          </div>
        </div>
      </header>
      <MobileNavigation onSearch={() => { setSearch(true); useWorkspace.setState({ camerasOpen: false, panel: null }); }} />
      <LoginRequiredPopover />
      {search && <NavbarCameraSearch onClose={() => setSearch(false)} />}
    </>
  );
}
