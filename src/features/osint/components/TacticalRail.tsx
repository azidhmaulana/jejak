import { useLanguage } from '../../../shared/i18n/useLanguage';
import SurveillanceSettingsPopover from './SurveillanceSettingsPopover';
import { Flame, Activity, CloudSun, MapPin, Satellite } from 'lucide-react';
import { hoverWorkspacePanel, openWorkspacePanel, useWorkspace } from '../workspaceStore';
export default function TacticalRail() {
  const english = useLanguage() === 'en';
  const { panel, camerasOpen, cameraTab } = useWorkspace();
  return (
    <nav className="tactical-rail" aria-label="Workspace tools">
      <SurveillanceSettingsPopover />
      <button data-earthquake-trigger aria-label={english ? 'Earthquakes' : 'Gempa bumi'} aria-pressed={panel === 'earthquakes'} aria-expanded={panel === 'earthquakes'}
        onPointerEnter={event => { if (event.pointerType !== 'touch') hoverWorkspacePanel('earthquakes'); }}
        onClick={() => openWorkspacePanel('earthquakes')}>
        <Activity /><span className="rail-tooltip" role="tooltip">{english ? 'Earthquakes' : 'Gempa bumi'}</span>
      </button>
      <button data-hotspot-trigger aria-label={english ? 'Hotspots' : 'Titik panas'} aria-pressed={panel === 'hotspots'} aria-expanded={panel === 'hotspots'}
        onPointerEnter={event => { if (event.pointerType !== 'touch') hoverWorkspacePanel('hotspots'); }}
        onClick={() => openWorkspacePanel('hotspots')}>
        <Flame /><span className="rail-tooltip" role="tooltip">{english ? 'Hotspots' : 'Titik panas'}</span>
      </button>
      <button
        data-space-trigger
        aria-label={english ? 'Space' : 'Antariksa'}
        aria-pressed={panel === 'space'}
        aria-expanded={panel === 'space'}
        aria-controls="space-stream-panel"
        onPointerEnter={event => { if (event.pointerType !== 'touch') hoverWorkspacePanel('space'); }}
        onClick={() => openWorkspacePanel('space')}
      >
        <Satellite />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Live from space' : 'Siaran antariksa'}
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
        onPointerEnter={event => { if (event.pointerType !== 'touch') hoverWorkspacePanel('weather'); }}
        onClick={() => openWorkspacePanel('weather')}
      >
        <CloudSun />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Weather' : 'Cuaca'}
        </span>
      </button>
    </nav>
  );
}
