import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useWorkspace, hoverWorkspacePanel, openWorkspacePanel } from '../workspaceStore';
import { Cctv } from 'lucide-react';
import SurveillanceSettings from './SurveillanceSettings';

export default function SurveillanceSettingsPopover() {
  const english = useLanguage() === 'en';
  const open = useWorkspace(state => state.panel === 'surveillance');
  return (
    <div
      className="surveillance-popover-anchor"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          useWorkspace.setState({ panel: null });
          event.stopPropagation();
        }
      }}
    >
      <button
        aria-label="Camera catalog"
        title="Surveillance settings"
        aria-expanded={open}
        aria-controls="surveillance-hover-settings"
        onPointerEnter={event => { if (event.pointerType !== 'touch') hoverWorkspacePanel('surveillance'); }}
        onClick={() => openWorkspacePanel('surveillance')}
      >
        <Cctv />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Camera surveillance' : 'Pengawasan kamera'}
        </span>
      </button>
      {open && (
        <div id="surveillance-hover-settings" className="surveillance-popover">
          <SurveillanceSettings onClose={() => useWorkspace.setState({ panel: null })} />
        </div>
      )}
    </div>
  );
}
