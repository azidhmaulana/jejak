import SurveillanceSettingsPopover from './SurveillanceSettingsPopover';
import { Network, CloudSun, SlidersHorizontal, PencilRuler, MapPin } from 'lucide-react';
import { openWorkspacePanel, useWorkspace } from '../workspaceStore';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';
export default function TacticalRail() {
  const { controller, bms } = useMapTools();
  return (
    <nav className="tactical-rail" aria-label="Workspace tools">
      <button aria-label="Objects and groups" onClick={() => openWorkspacePanel('objects')}>
        <Network />
      </button>
      <SurveillanceSettingsPopover />
      <button
        aria-label="Drawing workspace"
        aria-pressed={bms}
        disabled={!controller}
        onClick={() => controller?.mode(bms ? 'render' : 'select')}
      >
        <PencilRuler />
      </button>
      <button
        aria-label="Nearby cameras"
        onClick={() =>
          useWorkspace.setState({ camerasOpen: true, cameraTab: 'nearby', panel: null })
        }
      >
        <MapPin />
      </button>
      <button aria-label="Weather" onClick={() => openWorkspacePanel('weather')}>
        <CloudSun />
      </button>
      <button
        aria-label="Map provider settings"
        onClick={() => useWorkspace.setState((s) => ({ mapSettingsOpen: !s.mapSettingsOpen }))}
      >
        <SlidersHorizontal />
      </button>
    </nav>
  );
}
