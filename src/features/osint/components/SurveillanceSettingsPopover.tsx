import { useLanguage } from '../../../shared/i18n/useLanguage';
import { useWorkspace } from '../workspaceStore';
import { useState } from 'react';
import { Camera } from 'lucide-react';
import SurveillanceSettings from './SurveillanceSettings';

export default function SurveillanceSettingsPopover() {
  const english = useLanguage() === 'en';
  const [open, setOpen] = useState(false);
  return (
    <div
      className="surveillance-popover-anchor"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <button
        aria-label="Camera catalog"
        title="Surveillance settings"
        aria-expanded={open}
        aria-controls="surveillance-hover-settings"
        onClick={() => {
          setOpen(true);
          if (matchMedia('(hover: hover)').matches)
            useWorkspace.setState((state) => ({ camerasOpen: !state.camerasOpen, panel: null }));
        }}
      >
        <Camera />
        <span className="rail-tooltip" role="tooltip">
          {english ? 'Camera surveillance' : 'Pengawasan kamera'}
        </span>
      </button>
      {open && (
        <div id="surveillance-hover-settings" className="surveillance-popover">
          <SurveillanceSettings />
        </div>
      )}
    </div>
  );
}
