import { OsintWorkspace } from '../features/osint';
import BootReady from '../shared/components/BootReady';
import { useVisitTracking } from '../features/analytics/tracking';

export default function App() {
  useVisitTracking();
  return (
    <>
      <OsintWorkspace />
      <BootReady />
    </>
  );
}
