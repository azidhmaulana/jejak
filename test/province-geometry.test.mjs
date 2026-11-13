import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containsPoint, provinceBounds } from '../src/features/regions/geometry.ts';
const data = JSON.parse(
  readFileSync(new URL('../public/data/indonesia-provinces.geojson', import.meta.url)),
);
test('province dataset has 38 unique provinces and matches known cities', () => {
  assert.equal(data.features.length, 38);
  const jakarta = data.features.find((f) => f.properties.PROVINSI === 'DKI Jakarta');
  const jabar = data.features.find((f) => f.properties.PROVINSI === 'Jawa Barat');
  assert.equal(containsPoint(jakarta, 106.8272, -6.1754), true);
  assert.equal(containsPoint(jabar, 106.8272, -6.1754), false);

  assert.equal(new Set(data.features.map((f) => f.properties.PROVINSI)).size, 38);
  for (const [name, x, y] of [
    ['Jawa Barat', 107.6191, -6.9175],
    ['Jawa Tengah', 110.42, -7.01],
    ['Sulawesi Selatan', 119.5163, -5.0754],
  ]) {
    const feature = data.features.find((f) => f.properties.PROVINSI === name);
    assert.ok(feature, name);
    assert.ok(containsPoint(feature, x, y), name);
    const b = provinceBounds(feature);
    assert.ok(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  }
});
test('province matching excludes holes and supports multiple islands', () => {
  const polygon = {
    type: 'Feature',
    properties: { PROVINSI: 'test' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
    },
  };
  assert.equal(containsPoint(polygon, 1, 1), true);
  assert.equal(containsPoint(polygon, 5, 5), false);
  assert.equal(containsPoint(polygon, 11, 1), false);
  const multi = {
    ...polygon,
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        polygon.geometry.coordinates,
        [
          [
            [20, 20],
            [22, 20],
            [22, 22],
            [20, 22],
            [20, 20],
          ],
        ],
      ],
    },
  };
  assert.equal(containsPoint(multi, 21, 21), true);
});

test('national boundary includes cities on multiple islands', () => {
  const country = JSON.parse(readFileSync(new URL('../public/data/indonesia-boundary.geojson', import.meta.url)));
  for (const [x,y] of [[107.6191,-6.9175],[119.5163,-5.0754],[106.8272,-6.1754],[98.67,3.59]]) assert.equal(containsPoint(country,x,y),true);
  assert.equal(containsPoint(country,0,0),false);
});

test('national outline contains exterior rings only, without internal boundaries', () => {
  const country = JSON.parse(readFileSync(new URL('../public/data/indonesia-boundary.geojson', import.meta.url)));
  const polygons = country.geometry.type === 'MultiPolygon' ? country.geometry.coordinates : [country.geometry.coordinates];
  for (const polygon of polygons) assert.equal(polygon.length, 1);
});

test('EEZ asset matches the documented BIG feature count and uses geographic lines', () => {
  const eez = JSON.parse(readFileSync(new URL('../public/data/indonesia-eez.geojson', import.meta.url)));
  const metadata = JSON.parse(readFileSync(new URL('../docs/indonesia-eez-source.json', import.meta.url)));
  assert.equal(eez.features.length, metadata.featureCount);
  assert.equal(eez.features.length, 24);
  for (const feature of eez.features) {
    assert.ok(['LineString','MultiLineString'].includes(feature.geometry.type));
    const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const line of lines) for (const [lng,lat] of line) {
      assert.ok(Number.isFinite(lng) && lng >= 90 && lng <= 145);
      assert.ok(Number.isFinite(lat) && lat >= -16 && lat <= 12);
    }
  }
});
