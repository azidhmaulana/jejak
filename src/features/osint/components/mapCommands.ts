export type MapCommand = 'locate' | 'reset' | 'measure';
export function requestMapCommand(command: MapCommand) {
  window.dispatchEvent(new CustomEvent<MapCommand>('jejak-map-command', { detail: command }));
}
