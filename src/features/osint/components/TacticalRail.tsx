import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useAuth } from '../../auth/authStore';
import SurveillanceSettingsPopover from './SurveillanceSettingsPopover';
import { Network, CloudSun, SlidersHorizontal, PencilRuler, MapPin, Satellite } from 'lucide-react';
import { openWorkspacePanel, useWorkspace } from '../workspaceStore';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
export default function TacticalRail() {
  const english = useLanguage() === 'en';
  const editable = useAuth((state) => Boolean(state.user?.permissions.includes('objects.write')));
  const { panel, camerasOpen, cameraTab, mapSettingsOpen } = useWorkspace();
  const { controller, bms } = useMapTools();
  return (
    <nav className="tactical-rail" aria-label="Workspace tools">
      <button
        aria-label="Objects and groups"
        aria-pressed={panel === 'objects'}
        onClick={() => openWorkspacePanel('objects')}
      >
        <Network />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Objects and groups' : 'Objek dan grup'}
        </span>
      </button>
      <SurveillanceSettingsPopover />
      <button
        data-space-trigger
        aria-label={english ? 'Space' : 'Antariksa'}
        aria-pressed={panel === 'space'}
        aria-expanded={panel === 'space'}
        aria-controls="space-stream-panel"
        onClick={() => openWorkspacePanel('space')}
      >
        <Satellite />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Live from space' : 'Siaran antariksa'}
        </span>
      </button>
      <button
        aria-label="Drawing workspace"
        aria-pressed={bms}
        disabled={!controller || !editable}
        onClick={() => controller?.mode(bms ? 'render' : 'select')}
      >
        <PencilRuler />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Drawing workspace' : 'Ruang kerja gambar'}
        </span>
      </button>
      <button
        aria-label="Nearby cameras"
        aria-pressed={camerasOpen && cameraTab === 'nearby'}
        onClick={() =>
          useWorkspace.setState({ camerasOpen: true, cameraTab: 'nearby', panel: null })
        }
      >
        <MapPin />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Nearby cameras' : 'Kamera terdekat'}
        </span>
      </button>
      <button
        aria-label="Weather"
        aria-pressed={panel === 'weather'}
        onClick={() => openWorkspacePanel('weather')}
      >
        <CloudSun />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Weather' : 'Cuaca'}
        </span>
      </button>
      <button
        aria-label="Map provider settings"
        aria-pressed={mapSettingsOpen}
        onClick={() => useWorkspace.setState((s) => ({ mapSettingsOpen: !s.mapSettingsOpen }))}
      >
        <SlidersHorizontal />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Map provider settings' : 'Pengaturan penyedia peta'}
        </span>
      </button>
    </nav>
  );
}
