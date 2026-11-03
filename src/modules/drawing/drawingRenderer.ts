import type { Map as LibreMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import type { Drawing, DrawingStyle } from './mapToolsStore';
import { drawingStyle, lineStyles, styleProperties } from './drawingStyle';
import { hatchLines } from './drawingHatch';
import { objectLocked } from './drawingObjects';
import { createDrawingLabels } from './drawingLabels';

const sourceId = 'bms-drawings';
const geometryModes = new Set(['point', 'linestring', 'polygon', 'rectangle', 'circle']);

// Terra Draw owns geometry and edit handles; these layers render BMS stroke/fill styles.
export function createDrawingRenderer(map: LibreMap) {
  let current: Drawing[] = [],
    pendingFrame = 0;
  const labels = createDrawingLabels(map);
  const layers: LayerSpecification[] = [
    {
      id: 'bms-drawing-hit',
      type: 'fill',
      source: sourceId,
      filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-opacity': 0 },
    },
    {
      id: 'bms-drawing-fill',
      type: 'fill',
      source: sourceId,
      filter: ['all', ['==', '$type', 'Polygon'], ['==', 'drawFillStyle', 'solid']],
      paint: {
        'fill-color': ['get', 'drawColor'],
        'fill-opacity': ['/', ['get', 'drawFillOpacity'], 100],
      },
    },
    {
      id: 'bms-drawing-hatch',
      type: 'line',
      source: sourceId + '-hatch',
      paint: {
        'line-color': ['get', 'drawColor'],
        'line-width': 1.5,
        'line-opacity': ['/', ['get', 'drawFillOpacity'], 100],
      },
    },
    {
      id: 'bms-drawing-selection',
      type: 'line',
      source: sourceId,
      filter: ['all', ['!=', '$type', 'Point'], ['==', 'bmsSelected', true]],
      paint: {
        'line-color': '#ffffff',
        'line-width': ['+', ['get', 'drawWidth'], 4],
        'line-opacity': 0.35,
      },
    },
    ...lineStyles.map((style): LayerSpecification => ({
      id: `bms-drawing-line-${style}`,
      type: 'line',
      source: sourceId,
      filter: ['all', ['!=', '$type', 'Point'], ['==', 'drawLineStyle', style]],
      layout: { 'line-join': 'round', 'line-cap': style === 'dotted' ? 'round' : 'butt' },
      paint: {
        'line-color': ['get', 'drawColor'],
        'line-width': ['get', 'drawWidth'],
        ...(style === 'solid'
          ? {}
          : {
              'line-dasharray':
                style === 'dashed' ? [4, 2] : style === 'dotted' ? [0.2, 2] : [4, 2, 0.2, 2],
            }),
      },
    })),
    {
      id: 'bms-drawing-point',
      type: 'circle',
      source: sourceId,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': ['get', 'drawColor'],
        'circle-radius': ['+', ['get', 'drawWidth'], 3],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['get', 'bmsSelected'], 2, 1],
      },
    },
  ];
  map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(sourceId + '-hatch', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  layers.forEach((layer) => map.addLayer(layer));
  const updateHatch = () => {
    pendingFrame = 0;
    const features = current
      .filter(
        (feature) =>
          feature.geometry.type === 'Polygon' &&
          ['hatch', 'crosshatch'].includes(String(feature.properties.drawFillStyle)),
      )
      .map((feature) => ({
        type: 'Feature' as const,
        properties: feature.properties,
        geometry: { type: 'MultiLineString' as const, coordinates: hatchLines(map, feature) },
      }));
    (map.getSource(sourceId + '-hatch') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  };
  const scheduleHatch = () => {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(updateHatch);
  };
  map.on('move', scheduleHatch);
  map.on('resize', scheduleHatch);
  return {
    layers: layers.map((layer) => layer.id),
    update(all: Drawing[], selectedId: string | number | null, defaults: DrawingStyle) {
      const features = all
        .filter((feature) => geometryModes.has(String(feature.properties.mode)))
        .map((feature) => {
          const style = drawingStyle(
            feature,
            feature.properties.currentlyDrawing ? defaults : undefined,
          );
          return {
            ...feature,
            properties: {
              ...feature.properties,
              ...styleProperties(style),
              bmsId: feature.id ?? null,
              bmsSelected: feature.id === selectedId && !objectLocked(feature),
            },
          };
        });
      (map.getSource(sourceId) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
      labels.update(features);
      current = features;
      scheduleHatch();
    },
    destroy() {
      labels.destroy();
      cancelAnimationFrame(pendingFrame);
      map.off('move', scheduleHatch);
      map.off('resize', scheduleHatch);
      [...layers].reverse().forEach((layer) => {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (map.getSource(sourceId + '-hatch')) map.removeSource(sourceId + '-hatch');
    },
  };
}
