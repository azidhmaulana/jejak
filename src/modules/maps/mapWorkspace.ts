/** This standalone application always uses the isolated OSINT workspace. */
export const isOsintMap = true;
export const mapWorkspaceLabel = 'OSINT';
export const mapStorageKey = (key: string) => key.replace(/^bms-/, 'osint-');
export const drawingProjectUrl = '/api/bms/projects/osint';
export const overlayApiUrl = '/api/osint/map-overlays';
