import { resetAppearance, useAppearance } from '../appearanceStore';
import { setLanguage } from '../../../shared/i18n/runtime.js';
import { useLanguage } from '../../../shared/i18n/useLanguage';

const presets = [
  ['BMS', '#00cfff', '#40d9ff'],
  ['PHANTOM', '#b47cff', '#8495ff'],
  ['TERMINAL', '#00e6a0', '#6affc8'],
  ['CRIMSON', '#ff3d57', '#ff8a9a'],
] as const;
export default function WorkspaceAppearance() {
  const appearance = useAppearance();
  const language = useLanguage();
  return (
    <section className="workspace-appearance" aria-label="Appearance settings">
      <div className="panel-section-label">INTERFACE APPEARANCE</div>
      <div className="appearance-presets">
        {presets.map(([name, primary, secondary]) => (
          <button
            key={name}
            aria-pressed={appearance.primary === primary}
            onClick={() => useAppearance.setState({ primary, secondary })}
          >
            <i style={{ background: primary }} />
            {name}
          </button>
        ))}
      </div>
      <label>
        Accent color
        <input
          aria-label="primary accent"
          type="color"
          value={appearance.primary}
          onChange={(event) => useAppearance.setState({ primary: event.target.value })}
        />
      </label>
      <label>
        Glow
        <input
          aria-label="Accent glow"
          type="range"
          min="0"
          max="100"
          value={appearance.glow}
          onChange={(event) => useAppearance.setState({ glow: Number(event.target.value) })}
        />
      </label>
      <label>
        Map controls
        <input
          type="checkbox"
          checked={appearance.controls}
          onChange={(event) => useAppearance.setState({ controls: event.target.checked })}
        />
      </label>
      <label>
        Language
        <select
          aria-label="Interface language"
          value={language}
          onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'id')}
        >
          <option value="id">Indonesia</option>
          <option value="en">English</option>
        </select>
      </label>
      <button className="panel-action" onClick={resetAppearance}>
        Reset appearance
      </button>
      <div className="layer-divider" />
    </section>
  );
}
