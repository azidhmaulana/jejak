import { mapStorageKey } from '../maps/mapWorkspace';
import { create } from 'zustand';
import type { GeoJSONStoreFeatures } from 'terra-draw';
import type { GeometryEdit } from './drawingGeometry';
import type { DrawingImport } from './drawingImport';

export type DrawMode =
  'render' | 'select' | 'point' | 'linestring' | 'polygon' | 'rectangle' | 'circle';
export type Drawing = GeoJSONStoreFeatures;
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export type FillStyle = 'none' | 'solid' | 'hatch' | 'crosshatch';
export interface DrawingStyle {
  color: string;
  width: number;
  lineStyle: LineStyle;
  fillStyle: FillStyle;
  fillOpacity: number;
}
export type DrawingId = string | number;
export interface DrawingFolder {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
}
export type DrawingZone = 'none' | 'guard' | 'white';
export interface DrawingDetails {
  name: string;
  notes: string;
  folderId: string;
  visible: boolean;
  zone: DrawingZone;
}
export interface MapToolsController {
  undo: () => void;
  redo: () => void;
  setLocked: (id: DrawingId, locked: boolean) => void;
  mode: (mode: DrawMode) => void;
  style: (style: Partial<DrawingStyle>) => void;
  removeSelected: () => void;
  clear: () => void;
  export: () => void;
  focus: (longitude: number, latitude: number) => void;
  select: (id: DrawingId) => void;
  focusDrawing: (id: DrawingId) => void;
  focusFolder: (id: string) => void;
  updateGeometry: (id: DrawingId, edit: GeometryEdit) => string | null;
  importDrawings: (data: DrawingImport) => string | null;
  updateDrawing: (id: DrawingId, details: Partial<DrawingDetails>) => void;
  duplicate: (id: DrawingId) => void;
  remove: (id: DrawingId) => void;
  addFolder: (name: string) => void;
  updateFolder: (id: string, patch: Partial<Omit<DrawingFolder, 'id'>>) => void;
  setGroupsVisible: (visible: boolean) => void;
  setRootVisible: (visible: boolean) => void;
  removeFolder: (id: string) => void;
}
interface MapToolsState extends DrawingStyle {
  controller: MapToolsController | null;
  mode: DrawMode;
  range: boolean;
  color: string;
  width: number;
  selectedId: string | number | null;
  features: Drawing[];
  preview: Drawing | null;
  notice: string;
  gps: boolean;
  drawingsVisible: boolean;
  targetsVisible: boolean;
  contextMenu: { id: DrawingId; x: number; y: number } | null;
  bms: boolean;
  inspectorOpen: boolean;
  styleOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  syncStatus: 'loading' | 'saving' | 'synced' | 'offline' | 'conflict' | 'error';
  syncMessage: string;
  reloadShared: (() => void) | null;
  folders: DrawingFolder[];
  activeFolderId: string;
}
export const useMapTools = create<MapToolsState>(() => ({
  controller: null,
  mode: 'render',
  range: false,
  color: '#00c8f4',
  width: 2,
  selectedId: null,
  features: [],
  preview: null,
  notice: '',
  gps: true,
  drawingsVisible: true,
  targetsVisible: true,
  contextMenu: null,
  bms: false,
  lineStyle: 'solid',
  fillStyle: 'solid',
  fillOpacity: 16,
  inspectorOpen: false,
  styleOpen: false,
  folders: [],
  activeFolderId: '',
  canUndo: false,
  canRedo: false,
  syncStatus: 'loading',
  syncMessage: 'Menghubungkan penyimpanan bersama…',
  reloadShared: null,
}));

// Layer switches affect this browser only, never shared object/group visibility.
try {
  const saved = JSON.parse(localStorage.getItem(mapStorageKey('bms-map-layers-v1')) || '{}');
  for (const key of ['gps', 'drawingsVisible', 'targetsVisible'] as const)
    if (typeof saved[key] === 'boolean') useMapTools.setState({ [key]: saved[key] });
} catch {
  /* Fall back to visible layers. */
}
useMapTools.subscribe((state, previous) => {
  if (
    state.gps === previous.gps &&
    state.drawingsVisible === previous.drawingsVisible &&
    state.targetsVisible === previous.targetsVisible
  )
    return;
  try {
    localStorage.setItem(
      mapStorageKey('bms-map-layers-v1'),
      JSON.stringify({
        gps: state.gps,
        drawingsVisible: state.drawingsVisible,
        targetsVisible: state.targetsVisible,
      }),
    );
  } catch {
    /* Display remains usable without local storage. */
  }
});
