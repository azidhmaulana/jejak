import type { Drawing, DrawingFolder, DrawingZone } from './mapToolsStore';

export const drawingNames: Record<string, string> = {
  point: 'Titik',
  linestring: 'Garis',
  polygon: 'Polygon',
  rectangle: 'Rectangle',
  circle: 'Circle',
};
export const objectName = (feature: Drawing) =>
  String(feature.properties.bmsName || drawingNames[String(feature.properties.mode)] || 'Objek');
export const objectFolder = (feature: Drawing) => String(feature.properties.bmsFolderId || '');
export const objectLocked = (feature?: Drawing) => feature?.properties.bmsLocked === true;
export const objectZone = (feature?: Drawing): DrawingZone => {
  const zone = feature?.properties.bmsZone;
  return zone === 'guard' || zone === 'white' ? zone : 'none';
};
export const objectVisible = (feature: Drawing, folders: DrawingFolder[]) =>
  feature.properties.bmsVisible !== false &&
  folders.find((folder) => folder.id === objectFolder(feature))?.visible !== false;
export function uniqueName(base: string, features: Drawing[]) {
  const names = new Set(features.map(objectName));
  let index = 1;
  while (names.has(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}
export function normalizeObject(
  feature: Drawing,
  index: number,
  folders: DrawingFolder[],
): Drawing {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      bmsName: String(
        feature.properties.bmsName ||
          `${drawingNames[String(feature.properties.mode)] || 'Objek'} ${index + 1}`,
      ).slice(0, 100),
      bmsNotes: String(feature.properties.bmsNotes || '').slice(0, 2000),
      bmsFolderId: folders.some((folder) => folder.id === feature.properties.bmsFolderId)
        ? String(feature.properties.bmsFolderId)
        : '',
      bmsVisible: feature.properties.bmsVisible !== false,
      bmsOrder: Number(feature.properties.bmsOrder) || index + 1,
    },
  };
}
