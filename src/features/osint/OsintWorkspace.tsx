import ToastHost from '../../shared/components/Toast';
import CmsPanel from '../auth/CmsPanel';
import AccountPanel from '../auth/AccountPanel';
import AccountCameraPreferences from '../auth/AccountCameraPreferences';
import RoutePanel from '../routes/RoutePanel';
import WorkspaceTicker from './components/WorkspaceTicker';
import TacticalRail from './components/TacticalRail';
import MapCorner from './components/MapCorner';
import OsintMap from './components/OsintMap';
import OsintMapTools from './components/OsintMapTools';
import CommandHeader from './components/CommandHeader';
import LayerPanel from './components/LayerPanel';
import CameraDock from './components/CameraDock';
import CameraInspector from './components/CameraInspector';
import WorkspaceStatus from './components/WorkspaceStatus';
import type { CSSProperties } from 'react';
import { useAppearance } from './appearanceStore';
import { useMapTools } from '../../modules/drawing/mapToolsStore';
import { useWorkspace } from './workspaceStore';
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

export default function OsintWorkspace() {
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
      <ToastHost />
      <AccountPanel />
      <CmsPanel />
      <AccountCameraPreferences />
      <RoutePanel />
      <main className="osint-map-workspace" aria-label="OSINT map workspace">
        <TacticalRail />
        <LayerPanel />
        <section className="osint-map-stage corner-frame" aria-label="OSINT map">
          <OsintMap />
        </section>
        {selectedId && <CameraInspector />}
      </main>
      {camerasOpen && <CameraDock />}
      <div className="workspace-map-toolbar">
        <OsintMapTools />
        <div id="osint-map-footer" />
        <div id="map-provider-credits" />
      </div>

      <MapCorner />
      <WorkspaceStatus />
      <WorkspaceTicker />
    </div>
  );
}
