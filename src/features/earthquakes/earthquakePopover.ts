import { useWorkspace } from '../osint/workspaceStore';

let hideTimer: ReturnType<typeof setTimeout> | undefined;
export function keepEarthquakePanelOpen() {
  clearTimeout(hideTimer);
}
export function openEarthquakePanel() {
  keepEarthquakePanelOpen();
  useWorkspace.setState({ panel: 'earthquakes' });
}
export function scheduleEarthquakePanelClose() {
  keepEarthquakePanelOpen();
  // Allow the pointer to cross the gap between the rail and its floating panel.
  hideTimer = setTimeout(() => {
    if (useWorkspace.getState().panel === 'earthquakes') useWorkspace.setState({ panel: null });
  }, 180);
}
export function earthquakePanelBlur(target: EventTarget | null) {
  if (!(target instanceof Element) || !target.closest('[data-earthquake-trigger], .earthquake-panel'))
    scheduleEarthquakePanelClose();
}
