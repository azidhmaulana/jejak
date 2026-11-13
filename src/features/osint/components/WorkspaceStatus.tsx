import VisitorCount from '../../analytics/VisitorCount';
import WorkspaceClock from './WorkspaceClock';
import LayerSwitches from './LayerSwitches';
import { useWorkspace } from '../workspaceStore';
export default function WorkspaceStatus() {
  const coordinates = useWorkspace(state => state.coordinates);
  return (
    <footer className="workspace-status tactical-status">
      <WorkspaceClock />
      <LayerSwitches />
      <div className="tactical-status-accent" aria-hidden="true">
        <svg viewBox="0 0 300 32" preserveAspectRatio="none">
          <path d="M0 1 H12 Q20 1 26 8 L42 24 Q46 28 55 28 H245 Q254 28 258 24 L274 8 Q280 1 288 1 H300" />
        </svg>
        <i />
      </div>
      <span className="status-coordinates">
        {coordinates[1].toFixed(4)}, {coordinates[0].toFixed(4)}
      </span>
      <VisitorCount />
      <span className="tactical-local">
        <i />
        LOCAL WORKSPACE
      </span>
    </footer>
  );
}
