import { pressureContours, pressureCenters } from '../src/features/weather/pressureContours.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWeatherFields, scalarRanges, scalarValue } from '../server/weather-fields.mjs';
import { surfaceMetadata, SURFACE_LAYER } from '../server/surface-weather.mjs';
import { sampleScalar, validScalarGrid, scalarRgb } from '../src/features/weather/scalarWeather.ts';
const grid = () => ({
  nx: 360,
  ny: 181,
  lon0: 0,
  lat0: 90,
  dx: 1,
  dy: 1,
  values: Array(65160).fill(20),
  validTime: 1,
  referenceTime: 0,
  field: 'temperature',
});
test('scalar interpolation wraps longitude, handles poles and masks invalid derived cells', () => {
  const g = grid();
  assert.equal(validScalarGrid(g), true);
  assert.equal(sampleScalar(g, -0.5, -90), 20);
  g.values[0] = 0;
  g.values[1] = 4;
  g.values[360] = 8;
  g.values[361] = 12;
  assert.equal(sampleScalar(g, 0.5, 89.5), 6);
  g.values[0] = null;
  assert.equal(sampleScalar(g, 0.5, 89.5), null);
  assert.equal(sampleScalar(g, 0, 91), null);
  g.values[0] = Infinity;
  assert.equal(validScalarGrid(g), false);
  assert.deepEqual(scalarRgb('humidity', 100), [65, 90, 157]);
});
test('units, wet bulb domain and pressure are not confused with wind', () => {
  assert.equal(scalarValue('temperature', [273.15]), 0);
  assert.equal(scalarValue('pressure', [101325]), 1013.25);
  assert.ok(Math.abs(scalarValue('gust', [10]) - 22.36936) < 0.0001);
  assert.ok(Math.abs(scalarValue('wetbulb', [303.15, 70]) - 25.6) < 0.2);
  assert.equal(scalarValue('wetbulb', [200, 70]), null);
  assert.equal(scalarValue('uv', [0]), 0);
  assert.deepEqual(
    scalarRanges(
      '1:0:x:TMP:surface:\n2:50:x:TMP:2 m above ground:\n3:100:x:RH:2 m above ground:',
      'temperature',
    ),
    [[50, 99]],
  );
  assert.throws(() => scalarRanges('1:0:x:TMP:surface:', 'temperature'));
});
test('weather endpoint validates query, deduplicates work and caches real-time metadata', async () => {
  let calls = 0;
  const fetcher = async (url, opts) => {
    calls++;
    if (url.endsWith('.idx'))
      return new Response('1:0:x:TMP:2 m above ground:\n2:4:x:RH:2 m above ground:');
    return new Response('GRIB', {
      status: 206,
      headers: { 'Content-Range': 'bytes ' + opts.headers.Range.slice(6) + '/8' },
    });
  };
  const app = express();
  app.use(
    createWeatherFields({
      fetcher,
      now: () => Date.UTC(2026, 10, 18, 12),
      decode: async () => ({
        ...grid(),
        fields: [Array(65160).fill(300)],
        reference: '202611180600',
        forecastHours: 6,
      }),
    }).router,
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const path of [
      '/bogus',
      '/temperature?hour=1',
      '/temperature?hour=999',
      '/constructor',
      '/temperature?hour=0&hour=3',
    ])
      assert.equal((await fetch(base + path)).status, 400);
    const responses = await Promise.all([
      fetch(base + '/temperature'),
      fetch(base + '/temperature'),
    ]);
    for (const r of responses) {
      assert.equal(r.status, 200);
      const d = await r.json();
      assert.equal(d.values[0], 26.85);
      assert.equal(d.validTime, Date.UTC(2026, 10, 18, 12));
    }
    assert.equal((await fetch(base + '/temperature')).status, 200);
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});
test('surface temperature uses published observation date, never the current date', () => {
  const data = surfaceMetadata(
    `<Layer><ows:Identifier>${SURFACE_LAYER}</ows:Identifier><Default>2026-11-15</Default></Layer>`,
  );
  assert.equal(data.date, '2026-11-15');
  assert.ok(data.tiles.includes('/2026-11-15/'));
  assert.throws(() => surfaceMetadata('<Layer/>'));
});

test('isobars join segments and model pressure lows are detected', () => {
  const g = grid();
  g.field = 'pressure';
  g.values = g.values.map((_, i) => 980 + (i % 360) * 0.1 + Math.floor(i / 360) * 0.2);
  const lines = pressureContours(g);
  assert.ok(lines.features.some((f) => f.geometry.coordinates.length > 10));
  for (const f of lines.features)
    for (let i = 1; i < f.geometry.coordinates.length; i++)
      assert.ok(Math.abs(f.geometry.coordinates[i][0] - f.geometry.coordinates[i - 1][0]) <= 180);
  g.values.fill(1010);
  g.values[90 * 360 + 110] = 990;
  const centers = pressureCenters(g);
  assert.ok(
    centers.features.some((f) => f.properties.label === 'L' && f.geometry.coordinates[0] === 110),
  );
});
