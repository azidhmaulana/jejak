import JejakLogo from '../../../shared/components/JejakLogo';
import AccountMenu from '../../auth/AccountMenu';
import { useAuth } from '../../auth/authStore';
import { useRoute } from '../../routes/routeStore';
import { Route } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { useState } from 'react';
import {
  Bell,
  Camera,
  BarChart3,
  Layers,
  Map,
  Search,
  AlertTriangle,
  MoreHorizontal,
} from 'lucide-react';
import { openWorkspacePanel, useWorkspace } from '../workspaceStore';

export default function CommandHeader() {
  const user = useAuth((state) => state.user);
  const routeOpen = useRoute((state) => state.open);
  const { panel, camerasOpen, query } = useWorkspace();
  const [search, setSearch] = useState(false);
  const showCameras = () => useWorkspace.setState({ camerasOpen: !camerasOpen, panel: null });
  return (
    <>
      <header className="command-header tactical-header">
        <div className="navbar-capsule">
          <nav className="tactical-nav tactical-nav-left" aria-label="Primary navigation">
            <button
              aria-label="Peta"
              title="Peta"
              aria-pressed={!panel && !camerasOpen}
              onClick={() =>
                useWorkspace.setState({ panel: null, camerasOpen: false, selectedId: null })
              }
            >
              <Map />
              <span>Peta</span>
            </button>
            <button aria-label="CCTV" title="CCTV" aria-pressed={camerasOpen} onClick={showCameras}>
              <Camera />
              <span>CCTV</span>
            </button>
            <button
              aria-label="Analitik"
              title="Analitik"
              aria-pressed={panel === 'analytics'}
              onClick={() => openWorkspacePanel('analytics')}
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
              onClick={() => openWorkspacePanel('objects')}
            >
              <Layers />
              <span>Objek</span>
            </button>
            <button
              aria-label="Peringatan"
              title="Peringatan"
              aria-pressed={panel === 'alerts'}
              onClick={() => openWorkspacePanel('alerts')}
            >
              <AlertTriangle />
              <span>Peringatan</span>
            </button>
            {user?.permissions.includes('routes.use') && (
              <button
                aria-label="CCTV route"
                aria-pressed={routeOpen}
                onClick={() => useRoute.setState({ open: !routeOpen, picking: null })}
              >
                <Route />
                <span>Route</span>
              </button>
            )}
          </nav>
        </div>
        <details className="navbar-more">
          <summary aria-label="More navigation">
            <MoreHorizontal size={16} />
          </summary>
          <div>
            <button onClick={() => openWorkspacePanel('analytics')}>
              <BarChart3 />
              Analitik
            </button>
            <button onClick={() => openWorkspacePanel('objects')}>
              <Layers />
              Objek
            </button>
            <button onClick={() => openWorkspacePanel('alerts')}>
              <AlertTriangle />
              Peringatan
            </button>
            {user?.permissions.includes('routes.use') && (
              <button onClick={() => useRoute.setState({ open: !routeOpen, picking: null })}>
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
                useWorkspace.setState({ camerasOpen: true, panel: null });
              }}
            >
              <Search />
            </button>
            <button aria-label="Feed alerts" onClick={() => openWorkspacePanel('alerts')}>
              <Bell />
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>
      {search && (
        <label className="tactical-search">
          <Search size={16} />
          <input
            autoFocus
            aria-label="Search camera catalog"
            placeholder="Cari kamera atau lokasi..."
            value={query}
            onChange={(e) => useWorkspace.setState({ query: e.target.value })}
          />
        </label>
      )}
    </>
  );
}
