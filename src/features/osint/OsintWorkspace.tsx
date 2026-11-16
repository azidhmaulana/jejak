import { useRoute } from '../routes/routeStore';
import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from '../auth/authStore';
import { useHotspotPolling } from '../hotspots/hotspotStore';
import { useEarthquakePolling } from '../earthquakes/earthquakeStore';
import ToastHost from '../../shared/components/Toast';
import { useCameraCheckNotifications } from '../auth/cameraCheckStore';
import { useCameraSourceSync } from '../surveillance/cameraSourceState';
import AccountCameraPreferences from '../auth/AccountCameraPreferences';
import WorkspaceTicker from './components/WorkspaceTicker';
import TacticalRail from './components/TacticalRail';
import MapCorner from './components/MapCorner';
import OsintMap from './components/OsintMap';
import CommandHeader from './components/CommandHeader';
import LayerPanel from './components/LayerPanel';
import CameraDock from './components/CameraDock';
import WorkspaceStatus from './components/WorkspaceStatus';
import type { CSSProperties } from 'react';
import { useAppearance } from './appearanceStore';
import { useMapTools } from '../../modules/drawing/mapToolsStore';
import { useWorkspace } from './workspaceStore';
import '../auth/AccountPanel.css';
import '../auth/AuthForm.css';
import '../auth/ProfileForm.css';
import '../auth/CameraSourcesPanel.css';
import '../auth/HotspotSourcesPanel.css';
import '../analytics/AnalyticsPanel.css';
import '../analytics/EarthquakeAnalytics.css';
import '../analytics/HotspotAnalytics.css';
import '../objects/ObjectsPanel.css';
import '../routes/RoutePanel.css';
import '../weather/Himawari.css';
import '../../shared/styles/Operations.css';
import '../../shared/styles/ReferenceTheme.css';
import '../../shared/styles/CommandTheme.css';
import './OsintWorkspace.css';
import './components/OsintSidebar.css';
import './CommandWorkspace.css';
import './WorkspaceLayout.css';
import './JejakWorkspace.css';
import './components/MapCorner.css';
import './TacticalWorkspace.css';
import './components/WorkspaceTicker.css';
import './CompactNavbar.css';
import './components/CameraInspector.css';
import './components/CameraDock.css';
import './UiRefinement.css';
import '../analytics/PublicAnalyticsPanel.css';
import './ResponsiveWorkspace.css';
import './components/MobileNavigation.css';

const CmsPanel = lazy(() => import('../auth/CmsPanel'));
const AccountPanel = lazy(() => import('../auth/AccountPanel'));
const RoutePanel = lazy(() => import('../routes/RoutePanel'));
const DrawingActivity = lazy(() => import('../objects/DrawingActivity'));
const CameraInspector = lazy(() => import('./components/CameraInspector'));

export default function OsintWorkspace() {
  const routeOpen = useRoute((state) => state.open);
  const accountOpen = useAuth((state) => state.open);
  const cmsOpen = useAuth((state) => state.cmsOpen);
  const refresh = useAuth((state) => state.refresh);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => clearInterval(timer);
  }, [refresh]);
  useCameraCheckNotifications();
  useEarthquakePolling();
  useHotspotPolling();
  useCameraSourceSync();
  const appearance = useAppearance();
  const drawing = useMapTools((state) => state.mode !== 'render');
  const panel = useWorkspace((state) => state.panel);
  const camerasOpen = useWorkspace((state) => state.camerasOpen);
  const mapSettingsOpen = useWorkspace((state) => state.mapSettingsOpen);
  const selectedId = useWorkspace((state) => state.selectedId);
  return (
    <div
      className="ops-app workspace-shell command-workspace"
      data-drawing={drawing}
      data-map-settings={mapSettingsOpen}
      data-cameras-open={camerasOpen}
      data-panel-open={Boolean(panel)}
      data-camera-selected={Boolean(selectedId)}
      data-map-controls={appearance.controls}
      style={
        {
          '--command-cyan': '#4ce58a',
          '--ops-cyan': '#4ce58a',
          '--frame-blue': '#36835f',
          '--appearance-glow': appearance.glow,
        } as CSSProperties
      }
    >
      <CommandHeader />
      {drawing && (
        <Suspense fallback={null}>
          <DrawingActivity />
        </Suspense>
      )}
      <ToastHost />
      {accountOpen && (
        <Suspense fallback={null}>
          <AccountPanel />
        </Suspense>
      )}
      {cmsOpen && (
        <Suspense fallback={null}>
          <CmsPanel />
        </Suspense>
      )}
      <AccountCameraPreferences />
      {routeOpen && (
        <Suspense fallback={null}>
          <RoutePanel />
        </Suspense>
      )}
      <main className="osint-map-workspace" aria-label="OSINT map workspace">
        <TacticalRail />
        <LayerPanel />
        <section className="osint-map-stage corner-frame" aria-label="OSINT map">
          <OsintMap />
        </section>
        {selectedId && (
          <Suspense fallback={null}>
            <CameraInspector />
          </Suspense>
        )}
      </main>
      {camerasOpen && <CameraDock />}
      <div id="osint-map-footer" hidden />

      <MapCorner />
      <WorkspaceStatus />
      <WorkspaceTicker />
    </div>
  );
}
