import { Settings } from 'lucide-react';
import { useCameraCatalog } from '../hooks/useCameraCatalog';
import { cameraAvailability, useSurveillance } from '../../surveillance/osintSurveillanceStore';

export default function SurveillanceSettings() {
  const state = useSurveillance();
  const cameras = useCameraCatalog();
  const offline = cameras.filter(
    (camera) => cameraAvailability(camera).status === 'offline',
  ).length;
  function row(
    key: 'cameras' | 'previews' | 'showOffline' | 'news',
    label: string,
    count?: number,
  ) {
    return (
      <label
        className="surveillance-setting"
        title={key === 'previews' ? 'Show camera previews at 500 m scale or closer' : undefined}
      >
        <input
          type="checkbox"
          role="switch"
          checked={state[key]}
          disabled={(key === 'previews' || key === 'showOffline') && !state.cameras}
          onChange={(event) => useSurveillance.setState({ [key]: event.target.checked })}
        />
        <span className="surveillance-switch" />
        <span>{label}</span>
        {count !== undefined && <small>{count}</small>}
      </label>
    );
  }
  return (
    <section className="surveillance-settings" aria-label="Surveillance settings">
      <header>
        <div>
          <h2>CAMERA SURVEILLANCE</h2>
        </div>
        <span className="surveillance-active" data-active={state.cameras || state.news}>
          <i />
          {state.cameras || state.news ? 'ACTIVE' : 'INACTIVE'}
        </span>
        <Settings size={12} />
      </header>
      <div className="surveillance-settings-body">
        {row('cameras', 'CCTV CAMERAS', cameras.length)}
        <div className="surveillance-children">
          {row('previews', 'LIVE PREVIEWS')}
          {row('showOffline', 'CAMERA OFFLINE', offline)}
        </div>
        {row(
          'news',
          'LIVE NEWS FEEDS',
          state.sources.filter((source) => source.kind === 'news').length,
        )}
      </div>
    </section>
  );
}
