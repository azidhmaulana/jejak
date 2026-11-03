import { projectCache } from './projectCache';
import { mapStorageKey } from '../maps/mapWorkspace';
import { Marker, type Map as LibreMap, type MapMouseEvent } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawRenderMode,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawCircleMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import {
  useMapTools,
  type Drawing,
  type DrawingId,
  type DrawingFolder,
  type DrawMode,
  type MapToolsController,
} from './mapToolsStore';
import { drawingStyle, styleProperties, lineStyles, fillStyles } from './drawingStyle';
import { createDrawingRenderer } from './drawingRenderer';
import { createDrawingCursor } from './drawingCursor';
import {
  drawingNames,
  normalizeObject,
  objectName,
  objectFolder,
  objectVisible,
  objectLocked,
  objectZone,
  uniqueName,
} from './drawingObjects';
import { createDrawingHistory } from './drawingHistory';
import { editDrawingGeometry, drawingPoints } from './drawingGeometry';
import { createSharedDrawingProject, type DrawingProject } from './sharedDrawingProject';

const storageKey = mapStorageKey('bms-map-project-v2');
const modes = new Set(['point', 'linestring', 'polygon', 'rectangle', 'circle']);
const completed = (feature: Drawing) =>
  modes.has(String(feature.properties.mode)) && !feature.properties.currentlyDrawing;
const hasHoles = (feature: Drawing) =>
  feature.geometry.type === 'Polygon' && feature.geometry.coordinates.length > 1;

export function createDrawingController(map: LibreMap) {
  const renderer = createDrawingRenderer(map);
  const cursor = createDrawingCursor(map);
  const polygonStyle = { fillOpacity: 0, outlineOpacity: 0 };
  const polygonMode = new TerraDrawPolygonMode({ styles: polygonStyle });
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 9 }),
    modes: [
      new TerraDrawRenderMode({ modeName: 'render', styles: {} }),
      new TerraDrawPointMode({ styles: { pointOpacity: 0, pointOutlineOpacity: 0 } }),
      new TerraDrawLineStringMode({ styles: { lineStringOpacity: 0 } }),
      polygonMode,
      new TerraDrawRectangleMode({ styles: polygonStyle }),
      new TerraDrawCircleMode({ styles: polygonStyle }),
      new TerraDrawSelectMode({
        flags: {
          point: { feature: { draggable: true } },
          linestring: {
            feature: {
              draggable: true,
              coordinates: { draggable: true, deletable: true, midpoints: { draggable: true } },
            },
          },
          polygon: {
            feature: {
              draggable: true,
              coordinates: { draggable: true, deletable: true, midpoints: { draggable: true } },
            },
          },
          rectangle: { feature: { draggable: true, coordinates: { resizable: 'opposite' } } },
          circle: { feature: { draggable: true, coordinates: { resizable: 'center-fixed' } } },
        },
        styles: {
          selectedPolygonFillOpacity: 0,
          selectedPolygonOutlineOpacity: 0,
          selectedLineStringOpacity: 0,
          selectedPointOpacity: 0,
          selectedPointOutlineOpacity: 0,
          selectionPointWidth: 3,
        },
      }),
    ],
  });
  let disposed = false,
    pendingFrame = 0,
    saveTimer = 0;
  let shared: ReturnType<typeof createSharedDrawingProject> | undefined;
  let history: ReturnType<typeof createDrawingHistory> | undefined;
  let pointerDown = false;
  let folders: DrawingFolder[] = [];
  const hidden = new Map<DrawingId, Drawing>();
  // TerraDraw edits single rings. Keep multi-ring polygons in the shared snapshot
  // and custom renderer, with their full geometry editable through properties.
  const addStoredFeatures = (features: Drawing[]) => {
    for (const feature of features) {
      if (hasHoles(feature) && feature.geometry.type === 'Polygon') {
        const valid = feature.geometry.coordinates.every(
          (ring) =>
            polygonMode.validateFeature({
              ...feature,
              geometry: { type: 'Polygon', coordinates: [ring] },
            }).valid,
        );
        if (valid && feature.id !== undefined) hidden.set(feature.id, feature);
      } else draw.addFeatures([feature]);
    }
  };
  let searchMarker: Marker | null = null;
  const snapshot = () =>
    [...draw.getSnapshot().filter(completed), ...hidden.values()].sort(
      (a, b) => Number(a.properties.bmsOrder || 0) - Number(b.properties.bmsOrder || 0),
    );
  const getObject = (id: DrawingId) => hidden.get(id) || draw.getSnapshotFeature(id);
  const project = (): DrawingProject => ({ version: 2, folders, features: snapshot() });
  const idle = () =>
    !pointerDown &&
    !draw.getSnapshot().some((feature) => feature.properties.currentlyDrawing) &&
    !document.activeElement?.matches(
      'input:not([type=checkbox]):not([type=color]):not([type=range]), textarea, [contenteditable=true]',
    );
  const historyState = () =>
    useMapTools.setState({ canUndo: !!history?.canUndo, canRedo: !!history?.canRedo });
  const rendered = () =>
    useMapTools.getState().drawingsVisible
      ? [
          ...draw.getSnapshot(),
          ...[...hidden.values()].filter((feature) => objectVisible(feature, folders)),
        ]
      : [];
  const lockedNotice = () =>
    useMapTools.setState({ notice: 'Objek dikunci. Buka kunci sebelum mengedit atau menghapus.' });
  const persist = () => {
    if (disposed) return;
    if (idle()) {
      history?.capture(project());
      historyState();
    }
    try {
      projectCache.setItem(
        storageKey,
        JSON.stringify({ version: 2, folders, features: snapshot() }),
      );
    } catch {
      useMapTools.setState({
        notice:
          'Penyimpanan browser penuh. Periksa status sinkronisasi server sebelum menutup halaman.',
      });
    }
    shared?.save();
  };
  const sync = () => {
    if (disposed || pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      const all = draw.getSnapshot(),
        features = snapshot(),
        selectedId = useMapTools.getState().selectedId;
      const preview =
        all.find(
          (feature) =>
            modes.has(String(feature.properties.mode)) && feature.properties.currentlyDrawing,
        ) || null;
      cursor.update(preview);
      useMapTools.setState({
        features,
        folders: [...folders],
        preview,
        selectedId: features.some((feature) => feature.id === selectedId) ? selectedId : null,
      });
      renderer.update(rendered(), useMapTools.getState().selectedId, useMapTools.getState());
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(persist, 200);
    });
  };
  draw.start();
  draw.setMode('render');
  try {
    const project = JSON.parse(projectCache.getItem(storageKey) || 'null');
    if (project?.version === 2 && Array.isArray(project.folders)) {
      const ids = new Set<string>();
      folders = project.folders
        .filter(
          (folder: DrawingFolder) =>
            folder && typeof folder.id === 'string' && !ids.has(folder.id) && ids.add(folder.id),
        )
        .map((folder: DrawingFolder) => ({
          id: folder.id,
          name: String(folder.name || 'Folder').slice(0, 80),
          visible: folder.visible !== false,
          collapsed: Boolean(folder.collapsed),
        }));
    }
    const saved: unknown =
      project?.version === 2
        ? project.features
        : JSON.parse(projectCache.getItem(mapStorageKey('bms-map-drawings-v1')) || '[]');
    if (Array.isArray(saved)) {
      for (const [index, feature] of saved.entries()) {
        try {
          if (
            feature?.type === 'Feature' &&
            feature.properties &&
            modes.has(feature.properties.mode)
          )
            addStoredFeatures([normalizeObject(feature, index, folders)]);
        } catch {
          /* Ignore invalid saved geometry. */
        }
      }
    }
  } catch {
    useMapTools.setState({ notice: 'Gambar tersimpan tidak dapat dibaca.' });
  }
  draw.on('change', sync);
  draw.on('finish', (id) => {
    const state = useMapTools.getState();
    const feature = draw.getSnapshotFeature(id);
    if (feature && !feature.properties.drawColor)
      draw.updateFeatureProperties(id, styleProperties(state));
    if (feature && !feature.properties.bmsName) {
      const folder = folders.find((item) => item.id === state.activeFolderId);
      draw.updateFeatureProperties(id, {
        bmsName: uniqueName(drawingNames[String(feature.properties.mode)] || 'Objek', snapshot()),
        bmsNotes: '',
        bmsFolderId: folder?.id || '',
        bmsVisible: true,
        bmsZone: 'none',
        bmsOrder: Date.now(),
      });
      if (folder && !folder.visible) {
        folder.visible = true;
        applyVisibility();
      }
    }
    sync();
    persist();
  });
  draw.on('select', (id) => {
    const feature = draw.getSnapshotFeature(id);
    const folder = feature && folders.find((item) => item.id === objectFolder(feature));
    if (folder) folder.collapsed = false;
    useMapTools.setState({
      bms: true,
      inspectorOpen: true,
      selectedId: id,
      ...(feature ? drawingStyle(feature) : {}),
    });
    sync();
  });
  draw.on('deselect', () => {
    useMapTools.setState({ selectedId: null });
    sync();
  });
  const setMode = (mode: DrawMode) => {
    if (!draw.enabled) return;
    if (mode !== 'render') useMapTools.setState({ drawingsVisible: true });
    cursor.update(null);
    draw.setMode(mode);
    useMapTools.setState({ mode, selectedId: null, notice: '', bms: mode !== 'render' });
    sync();
  };
  const applyVisibility = () => {
    const selected = useMapTools.getState().selectedId;
    for (const feature of snapshot()) {
      if (feature.id === undefined) continue;
      const editable =
        useMapTools.getState().drawingsVisible &&
        objectVisible(feature, folders) &&
        !objectLocked(feature) &&
        !hasHoles(feature);
      if (!editable && draw.hasFeature(feature.id)) {
        hidden.set(feature.id, feature);
        draw.removeFeatures([feature.id]);
      } else if (editable && hidden.has(feature.id)) {
        draw.addFeatures([feature]);
        if (draw.hasFeature(feature.id)) hidden.delete(feature.id);
      }
    }
    if (selected !== null && getObject(selected)) useMapTools.setState({ selectedId: selected });
    sync();
  };
  const updateProperties = (id: DrawingId, properties: Drawing['properties']) => {
    const feature = getObject(id);
    if (!feature) return;
    if (hidden.has(id))
      hidden.set(id, { ...feature, properties: { ...feature.properties, ...properties } });
    else draw.updateFeatureProperties(id, properties);
  };
  const selectObject = (id: DrawingId) => {
    const feature = getObject(id);
    if (!feature) return;
    const folder = folders.find((item) => item.id === objectFolder(feature));
    if (folder) folder.collapsed = false;
    setMode('select');
    if (draw.hasFeature(id)) draw.selectFeature(id);
    useMapTools.setState({ selectedId: id, inspectorOpen: true, ...drawingStyle(feature) });
    sync();
  };
  const controller: MapToolsController = {
    updateGeometry(id, edit) {
      const original = getObject(id);
      if (!original) return 'Objek tidak ditemukan.';
      if (objectLocked(original)) return 'Buka kunci sebelum mengedit objek.';
      try {
        const updated = editDrawingGeometry(original, edit);
        if (hidden.has(id)) hidden.set(id, updated);
        else {
          draw.removeFeatures([id]);
          try {
            draw.addFeatures([updated]);
          } catch {
            /* Restore below on rejection. */
          }
          if (!draw.hasFeature(id)) {
            draw.addFeatures([original]);
            selectObject(id);
            return 'Geometri tidak dapat diterapkan. Perubahan dibatalkan.';
          }
        }
        selectObject(id);
        sync();
        persist();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Geometri tidak valid.';
      }
    },
    importDrawings(data) {
      if (draw.getSnapshot().some((feature) => feature.properties.currentlyDrawing))
        return 'Selesaikan gambar aktif sebelum import.';
      if (
        !data.features.length ||
        data.features.length > 500 ||
        folders.length + data.folders.length > 1000 ||
        snapshot().length + data.features.length > 10000
      )
        return 'Jumlah objek atau group melebihi batas import.';
      const ids = new Set(snapshot().map((f) => f.id));
      if (
        data.features.some((f) => f.id === undefined || ids.has(f.id)) ||
        data.folders.some((f) => folders.some((existing) => existing.id === f.id))
      )
        return 'Import ini sudah ditambahkan. Pilih kembali file untuk membuat salinan baru.';
      useMapTools.setState({ drawingsVisible: true });
      const incoming = structuredClone(data.features);
      try {
        addStoredFeatures(incoming);
      } catch {
        /* Validate the complete batch below. */
      }
      if (incoming.some((f) => !getObject(f.id!))) {
        incoming.forEach((f) => hidden.delete(f.id!));
        draw.removeFeatures(incoming.filter((f) => draw.hasFeature(f.id!)).map((f) => f.id!));
        sync();
        return 'Ada geometri yang ditolak editor (misalnya polygon berpotongan). Tidak ada objek yang ditambahkan.';
      }
      folders.push(...structuredClone(data.folders));
      setMode('select');
      applyVisibility();
      sync();
      persist();
      if (data.folders[0]) controller.focusFolder(data.folders[0].id);
      useMapTools.setState({ notice: `${incoming.length} objek berhasil diimport.` });
      return null;
    },
    focusFolder(id) {
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      folder.visible = true;
      folder.collapsed = false;
      const features = snapshot().filter((f) => objectFolder(f) === id);
      features.forEach((f) => updateProperties(f.id!, { bmsVisible: true }));
      setMode('select');
      useMapTools.setState({ activeFolderId: id });
      applyVisibility();
      persist();
      fitPoints(features.flatMap(drawingPoints));
    },
    undo: () => moveHistory('undo'),
    redo: () => moveHistory('redo'),
    setLocked(id, locked) {
      if (!getObject(id)) return;
      updateProperties(id, { bmsLocked: locked });
      applyVisibility();
      if (!locked && useMapTools.getState().selectedId === id && draw.hasFeature(id))
        draw.selectFeature(id);
      persist();
    },
    mode: setMode,
    style(patch) {
      const selected = useMapTools.getState().selectedId;
      if (selected !== null && objectLocked(getObject(selected))) {
        lockedNotice();
        return;
      }
      if (patch.color !== undefined && !/^#[\da-f]{6}$/i.test(patch.color)) return;
      if (patch.width !== undefined && !Number.isFinite(patch.width)) return;
      if (patch.fillOpacity !== undefined && !Number.isFinite(patch.fillOpacity)) return;
      if (patch.lineStyle !== undefined && !lineStyles.includes(patch.lineStyle)) return;
      if (patch.fillStyle !== undefined && !fillStyles.includes(patch.fillStyle)) return;
      const next = { ...useMapTools.getState(), ...patch };
      next.width = Math.max(1, Math.min(10, next.width));
      next.fillOpacity = Math.max(0, Math.min(100, next.fillOpacity));
      useMapTools.setState({
        color: next.color,
        width: next.width,
        lineStyle: next.lineStyle,
        fillStyle: next.fillStyle,
        fillOpacity: next.fillOpacity,
      });
      const selectedId = useMapTools.getState().selectedId;
      if (selectedId !== null) updateProperties(selectedId, styleProperties(next));
      sync();
      persist();
    },
    removeSelected() {
      const id = useMapTools.getState().selectedId;
      if (id !== null) controller.remove(id);
    },
    clear() {
      if (snapshot().some(objectLocked)) {
        lockedNotice();
        return;
      }
      setMode('select');
      hidden.clear();
      draw.clear();
      sync();
      persist();
    },
    export() {
      const blob = new Blob(
        [
          JSON.stringify(
            { type: 'FeatureCollection', features: snapshot(), bms: { version: 2, folders } },
            null,
            2,
          ),
        ],
        { type: 'application/geo+json' },
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `bms-map-${new Date().toISOString().replace(/[:.]/g, '-')}.geojson`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    focus(longitude, latitude) {
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90
      )
        return;
      searchMarker?.remove();
      searchMarker = new Marker({ color: '#00c8f4' }).setLngLat([longitude, latitude]).addTo(map);
      searchMarker.getElement().setAttribute('aria-label', 'Search result location');
      map.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 13),
        duration: 600,
      });
    },
    select: selectObject,
    updateDrawing(id, patch) {
      const feature = getObject(id);
      if (!feature) return;
      if (
        objectLocked(feature) &&
        (patch.name !== undefined ||
          patch.notes !== undefined ||
          patch.folderId !== undefined ||
          patch.zone !== undefined)
      ) {
        lockedNotice();
        return;
      }
      if (patch.zone !== undefined && !['none', 'guard', 'white'].includes(patch.zone)) return;
      if (
        patch.zone !== undefined &&
        patch.zone !== 'none' &&
        objectZone(feature) !== 'none' &&
        objectZone(feature) !== patch.zone
      ) {
        useMapTools.setState({
          notice: 'Nonaktifkan zona yang aktif sebelum memilih zona lainnya.',
        });
        return;
      }
      const properties: Drawing['properties'] = {};
      if (patch.name !== undefined && patch.name.trim())
        properties.bmsName = patch.name.trim().slice(0, 100);
      if (patch.notes !== undefined) properties.bmsNotes = patch.notes.slice(0, 2000);
      if (patch.folderId !== undefined)
        properties.bmsFolderId = folders.some((folder) => folder.id === patch.folderId)
          ? patch.folderId
          : '';
      if (patch.visible !== undefined) properties.bmsVisible = patch.visible;
      if (patch.zone !== undefined) properties.bmsZone = patch.zone;
      updateProperties(id, properties);
      applyVisibility();
      persist();
    },
    duplicate(id) {
      const original = getObject(id);
      if (!original) return;
      const feature = structuredClone(original);
      feature.id = crypto.randomUUID();
      feature.properties = {
        ...feature.properties,
        bmsName: uniqueName(`${objectName(original)} salinan`, snapshot()),
        bmsOrder: Date.now(),
        bmsLocked: false,
        bmsZone: 'none',
      };
      delete feature.properties.selected;
      if (objectVisible(feature, folders)) addStoredFeatures([feature]);
      else hidden.set(feature.id, feature);
      selectObject(feature.id);
      sync();
      persist();
    },
    remove(id) {
      if (objectLocked(getObject(id))) {
        lockedNotice();
        return;
      }
      hidden.delete(id);
      if (draw.hasFeature(id)) draw.removeFeatures([id]);
      if (useMapTools.getState().selectedId === id) useMapTools.setState({ selectedId: null });
      sync();
      persist();
    },
    focusDrawing(id) {
      const feature = getObject(id);
      if (!feature) return;
      const folder = folders.find((item) => item.id === objectFolder(feature));
      if (folder) {
        folder.visible = true;
        folder.collapsed = false;
      }
      updateProperties(id, { bmsVisible: true });
      applyVisibility();
      selectObject(id);
      persist();
      const geometry = feature.geometry;
      const points =
        geometry.type === 'Point'
          ? [geometry.coordinates]
          : geometry.type === 'LineString'
            ? geometry.coordinates
            : geometry.type === 'Polygon'
              ? geometry.coordinates.flat()
              : [];
      if (!points.length) return;
      const anchor = points[0][0];
      const longitudes = points.map((point) => anchor + ((point[0] - anchor + 540) % 360) - 180),
        latitudes = points.map((point) => point[1]);
      map.fitBounds(
        [
          [Math.min(...longitudes), Math.min(...latitudes)],
          [Math.max(...longitudes), Math.max(...latitudes)],
        ],
        {
          padding: Math.min(50, map.getCanvas().clientWidth / 5, map.getCanvas().clientHeight / 5),
          maxZoom: 16,
          duration: 600,
        },
      );
    },
    addFolder(name) {
      if (!name.trim()) return;
      const folder = {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 80),
        visible: true,
        collapsed: false,
      };
      folders.push(folder);
      useMapTools.setState({ activeFolderId: folder.id });
      sync();
      persist();
    },
    updateFolder(id, patch) {
      const folder = folders.find((item) => item.id === id);
      if (!folder) return;
      if (patch.name?.trim()) folder.name = patch.name.trim().slice(0, 80);
      if (patch.visible !== undefined) folder.visible = patch.visible;
      if (patch.collapsed !== undefined) folder.collapsed = patch.collapsed;
      applyVisibility();
      persist();
    },
    setGroupsVisible(visible) {
      folders.forEach((folder) => {
        folder.visible = visible;
      });
      applyVisibility();
      sync();
      persist();
    },
    setRootVisible(visible) {
      for (const feature of snapshot())
        if (feature.id !== undefined && !objectFolder(feature))
          updateProperties(feature.id, { bmsVisible: visible });
      applyVisibility();
      persist();
    },
    removeFolder(id) {
      if (snapshot().some((feature) => objectFolder(feature) === id && objectLocked(feature))) {
        lockedNotice();
        return;
      }
      for (const feature of snapshot())
        if (feature.id !== undefined && objectFolder(feature) === id)
          updateProperties(feature.id, { bmsFolderId: '' });
      folders = folders.filter((folder) => folder.id !== id);
      if (useMapTools.getState().activeFolderId === id)
        useMapTools.setState({ activeFolderId: '' });
      applyVisibility();
      persist();
    },
  };
  function fitPoints(points: number[][]) {
    if (!points.length) return;
    const anchor = points[0][0];
    const bounds = points.reduce(
      (b, p) => {
        const lng = anchor + ((p[0] - anchor + 540) % 360) - 180;
        return [
          Math.min(b[0], lng),
          Math.min(b[1], p[1]),
          Math.max(b[2], lng),
          Math.max(b[3], p[1]),
        ];
      },
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: Math.min(50, map.getCanvas().clientWidth / 5, map.getCanvas().clientHeight / 5),
        maxZoom: 16,
        duration: 600,
      },
    );
  }
  const contextDrawing = (event: MapMouseEvent) => {
    if (
      !['render', 'select'].includes(useMapTools.getState().mode) ||
      !useMapTools.getState().drawingsVisible
    )
      return;
    const hit = map
      .queryRenderedFeatures(
        [
          [event.point.x - 5, event.point.y - 5],
          [event.point.x + 5, event.point.y + 5],
        ],
        { layers: renderer.layers },
      )
      .find((f) => f.properties.bmsId != null && getObject(f.properties.bmsId));
    if (!hit) return;
    event.preventDefault();
    event.originalEvent.preventDefault();
    useMapTools.setState({
      contextMenu: {
        id: hit.properties.bmsId,
        x: event.originalEvent.clientX,
        y: event.originalEvent.clientY,
      },
    });
  };
  map.on('contextmenu', contextDrawing);
  const unsubscribeLayers = useMapTools.subscribe((state, previous) => {
    if (state.drawingsVisible === previous.drawingsVisible) return;
    if (!state.drawingsVisible) {
      draw.setMode('render');
      cursor.update(null);
      useMapTools.setState({ mode: 'render', selectedId: null, contextMenu: null });
    }
    applyVisibility();
  });
  const clickDrawing = (event: MapMouseEvent) => {
    const mode = useMapTools.getState().mode;
    if (!['render', 'select'].includes(mode) || document.querySelector('dialog[open]')) return;
    const hit = map
      .queryRenderedFeatures(
        [
          [event.point.x - 4, event.point.y - 4],
          [event.point.x + 4, event.point.y + 4],
        ],
        { layers: renderer.layers },
      )
      .find((feature) => feature.properties.bmsId != null && getObject(feature.properties.bmsId));
    if (hit && (mode === 'render' || !draw.hasFeature(hit.properties.bmsId)))
      selectObject(hit.properties.bmsId);
  };
  map.on('click', clickDrawing);
  const escape = (event: KeyboardEvent) => {
    if (
      event.key !== 'Escape' ||
      (event.target as HTMLElement).closest('input,select,textarea,dialog,.bms-objects-panel')
    )
      return;
    setMode('render');
    useMapTools.setState({ range: false });
  };
  window.addEventListener('keydown', escape);
  window.addEventListener('pagehide', persist);
  applyVisibility();
  renderer.update(rendered(), null, useMapTools.getState());
  useMapTools.setState({
    controller,
    folders: [...folders],
    activeFolderId: '',
    mode: 'render',
    bms: false,
    selectedId: null,
    features: snapshot(),
    preview: null,
  });
  const replaceProject = (incoming: DrawingProject, recordLocal = true) => {
    if (recordLocal) history?.capture(project());
    const { mode, selectedId, inspectorOpen, activeFolderId } = useMapTools.getState();
    draw.setMode('render');
    hidden.clear();
    draw.clear();
    folders = structuredClone(incoming.folders);
    addStoredFeatures(
      incoming.features.map((feature, index) => normalizeObject(feature, index, folders)),
    );
    applyVisibility();
    draw.setMode(mode);
    if (selectedId !== null && draw.hasFeature(selectedId)) draw.selectFeature(selectedId);
    useMapTools.setState({
      mode,
      bms: mode !== 'render',
      inspectorOpen,
      selectedId: selectedId !== null && getObject(selectedId) ? selectedId : null,
      activeFolderId: folders.some((folder) => folder.id === activeFolderId) ? activeFolderId : '',
    });
    history?.adopt(project());
    historyState();
    sync();
  };
  history = createDrawingHistory(project());
  historyState();
  const moveHistory = (direction: 'undo' | 'redo') => {
    if (!idle()) {
      useMapTools.setState({ notice: 'Selesaikan atau batalkan gambar aktif sebelum Undo/Redo.' });
      return;
    }
    history!.capture(project());
    try {
      const next = history!.move(project(), direction);
      if (next) {
        replaceProject(next, false);
        useMapTools.setState({
          notice: direction === 'undo' ? 'Perubahan dibatalkan.' : 'Perubahan diterapkan kembali.',
        });
        persist();
      }
    } catch (error) {
      useMapTools.setState({
        notice: error instanceof Error ? error.message : 'Undo/Redo tidak dapat diterapkan.',
      });
    }
    historyState();
  };
  const shortcut = (event: KeyboardEvent) => {
    if (
      !useMapTools.getState().bms ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      (event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable=true],dialog,[role=dialog]',
      )
    )
      return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    }
  };
  window.addEventListener('keydown', shortcut, true);
  const settle = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 0);
  };
  const press = () => {
      pointerDown = true;
    },
    release = () => {
      pointerDown = false;
      settle();
    };
  window.addEventListener('focusout', settle);
  window.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  shared = createSharedDrawingProject(project, replaceProject, () => !disposed && idle());
  return {
    draw,
    destroy() {
      persist();
      shared?.destroy();
      disposed = true;
      cancelAnimationFrame(pendingFrame);
      clearTimeout(saveTimer);
      window.removeEventListener('keydown', shortcut, true);
      window.removeEventListener('focusout', settle);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('pagehide', persist);
      unsubscribeLayers();
      map.off('contextmenu', contextDrawing);
      map.off('click', clickDrawing);
      searchMarker?.remove();
      cursor.destroy();
      draw.stop();
      renderer.destroy();
      useMapTools.setState({
        controller: null,
        mode: 'render',
        bms: false,
        selectedId: null,
        preview: null,
        canUndo: false,
        canRedo: false,
      });
    },
  };
}
