import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';

globalThis.crypto ??= webcrypto;
const load = async (name) => {
  const { outputFiles } = await build({
    entryPoints: [`src/modules/drawing/${name}.ts`],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
  );
};
const { editDrawingGeometry, geometryValues, drawingCenter } = await load('drawingGeometry');
const { parseDrawingImport } = await load('drawingImport');
const { measureDrawing } = await load('mapMeasurements');
const style = {
  color: '#00c8f4',
  width: 2,
  lineStyle: 'solid',
  fillStyle: 'solid',
  fillOpacity: 16,
};
const feature = (mode, coordinates) => ({
  type: 'Feature',
  id: 'test',
  properties: { mode, bmsName: 'Original' },
  geometry: {
    type: mode === 'point' ? 'Point' : mode === 'linestring' ? 'LineString' : 'Polygon',
    coordinates,
  },
});
const close = (actual, expected, tolerance = 0.1) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('circle edit preserves center, radius and metadata, including date line', () => {
  const original = feature('circle', [
    [
      [107, -7],
      [107.01, -7],
      [107, -7.01],
      [107, -7],
    ],
  ]);
  const edited = editDrawingGeometry(original, { longitude: 179.999, latitude: 20, size: 1500 });
  close(measureDrawing(edited).meters, 1500, 0.001);
  close(drawingCenter(edited)[0], 179.999, 1e-7);
  close(drawingCenter(edited)[1], 20, 1e-7);
  assert.equal(edited.properties.radiusKilometers, 1.5);
  assert.equal(edited.id, original.id);
  assert.equal(original.geometry.coordinates[0].length, 4);
  assert.deepEqual(edited.geometry.coordinates[0][0], edited.geometry.coordinates[0].at(-1));
});
test('rectangle dimensions and line length use meters after relocation', () => {
  const rect = feature('rectangle', [
    [
      [107, -7],
      [107.01, -7],
      [107.01, -7.01],
      [107, -7.01],
      [107, -7],
    ],
  ]);
  const edited = editDrawingGeometry(rect, {
    longitude: 110,
    latitude: 30,
    size: 500,
    height: 300,
  });
  const dimensions = geometryValues(edited);
  close(dimensions.size, 500);
  close(dimensions.height, 300);
  const line = feature('linestring', [
    [179.99, 0],
    [-179.99, 0.01],
    [-179.97, 0.02],
  ]);
  close(
    measureDrawing(editDrawingGeometry(line, { longitude: 100, latitude: -6, size: 2000 })).meters,
    2000,
  );
});
test('polygon resizing preserves holes and rejects invalid edits', () => {
  const polygon = feature('polygon', [
    [
      [107, -7],
      [107.1, -7],
      [107.1, -7.1],
      [107, -7],
    ],
    [
      [107.02, -7.02],
      [107.04, -7.02],
      [107.04, -7.04],
      [107.02, -7.02],
    ],
  ]);
  const edited = editDrawingGeometry(polygon, { longitude: 107, latitude: -7, size: 5000 });
  assert.equal(edited.geometry.coordinates.length, 2);
  close(measureDrawing(edited).meters, 5000);
  for (const edit of [
    { longitude: NaN, latitude: 0 },
    { longitude: 181, latitude: 0 },
    { longitude: 0, latitude: 86 },
    { longitude: 0, latitude: 0, size: 0 },
  ])
    assert.throws(() => editDrawingGeometry(polygon, edit));
});
test('GeoJSON flattens collections with fresh IDs, groups and safe properties', () => {
  const json = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'existing',
        properties: {
          name: 'Imported',
          group: 'Survey',
          bmsLocked: true,
          selected: true,
          drawColor: '#ff0000',
        },
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'MultiPoint',
              coordinates: [
                [107, -7],
                [108, -6],
              ],
            },
            {
              type: 'LineString',
              coordinates: [
                [107, -7],
                [108, -6],
              ],
            },
          ],
        },
      },
    ],
  });
  const parsed = parseDrawingImport(json, 'survey.geojson', style);
  assert.equal(parsed.features.length, 3);
  assert.equal(parsed.folders[0].name, 'Survey');
  assert.equal(new Set(parsed.features.map((f) => f.id)).size, 3);
  for (const f of parsed.features) {
    assert.notEqual(f.id, 'existing');
    assert.equal(f.properties.bmsLocked, false);
    assert.equal(f.properties.selected, undefined);
    assert.equal(f.properties.drawColor, '#ff0000');
  }
  assert.notEqual(
    parseDrawingImport(json, 'survey.geojson', style).features[0].id,
    parsed.features[0].id,
  );
});
test('GeoJSON validates coordinates, ring closure, CRS and batch limits', () => {
  const parse = (json) => parseDrawingImport(JSON.stringify(json), 'input.json', style);
  assert.throws(() => parse({ type: 'Point', coordinates: [181, 0] }), /Koordinat/);
  assert.throws(() => parse({ type: 'Point', coordinates: ['107', 0] }), /Koordinat/);
  assert.throws(
    () =>
      parse({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      }),
    /tertutup/,
  );
  assert.throws(
    () =>
      parse({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
      }),
    /berpotongan/,
  );
  assert.throws(
    () =>
      parse({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 2],
          ],
        ],
      }),
    /dalam/,
  );
  assert.throws(() => parse({ type: 'Point', coordinates: [0, 0], crs: {} }), /CRS/);
  assert.throws(
    () => parse({ type: 'MultiPoint', coordinates: Array.from({ length: 501 }, () => [0, 0]) }),
    /500/,
  );
  assert.throws(() => parseDrawingImport('{oops', 'bad.json', style), /JSON/);
  assert.throws(() => parseDrawingImport(' '.repeat(5_000_001), 'large.json', style), /5 MB/);
});
