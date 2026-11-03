import {
  BarChart3,
  Bell,
  Camera,
  CloudSun,
  FolderOpen,
  Map,
  PencilRuler,
  Settings,
} from 'lucide-react';
import { openWorkspacePanel, useWorkspace, type WorkspacePanel } from '../workspaceStore';
import { useMapTools } from '../../../modules/drawing/mapToolsStore';

const items: { panel: WorkspacePanel; label: string; icon: typeof Map }[] = [
  { panel: 'layers', label: 'Map', icon: Map },
  { panel: 'sources', label: 'CCTV', icon: Camera },
  { panel: 'alerts', label: 'Alerts', icon: Bell },
  { panel: 'analytics', label: 'Analytics', icon: BarChart3 },
  { panel: 'objects', label: 'Objects', icon: FolderOpen },
  { panel: 'weather', label: 'Weather', icon: CloudSun },
];
export default function WorkspaceNav() {
  const panel = useWorkspace((state) => state.panel);
  const controller = useMapTools((state) => state.controller);
  const bms = useMapTools((state) => state.bms);
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {items.map(({ panel: id, label, icon: Icon }) => (
        <button
          key={id}
          aria-label={id === 'objects' ? 'Objects and groups' : label}
          aria-pressed={panel === id}
          onClick={() => openWorkspacePanel(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
      <button
        aria-label="Drawing workspace"
        disabled={!controller}
        aria-pressed={bms}
        onClick={() => controller?.mode(bms ? 'render' : 'select')}
      >
        <PencilRuler />
        <span>Drawing</span>
      </button>
      <button
        className="nav-settings"
        aria-label="Style studio"
        aria-pressed={panel === 'settings'}
        onClick={() => openWorkspacePanel('settings')}
      >
        <Settings />
        <span>Settings</span>
      </button>
    </nav>
  );
}
