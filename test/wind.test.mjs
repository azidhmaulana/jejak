import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWind, windRanges } from '../server/wind.mjs';
import { interpolateWind, validWindGrid } from '../src/features/weather/windGrid.ts';
const grid = () => ({
  nx: 360,
  ny: 181,
  lon0: 0,
  lat0: 90,
  dx: 1,
  dy: 1,
  u: Array(65160).fill(8),
  v: Array(65160).fill(-3),
  validTime: 1,
  referenceTime: 0,
});
test('bilinear vectors preserve direction, poles, and longitude wrapping', () => {
  const g = grid();
  assert.equal(validWindGrid(g), true);
  assert.deepEqual(interpolateWind(g, 106.5, -6.5), [8, -3]);
  assert.deepEqual(interpolateWind(g, -0.5, -90), [8, -3]);
  g.u[0] = 0;
  g.u[1] = 4;
  g.u[360] = 8;
  g.u[361] = 12;
  assert.deepEqual(interpolateWind(g, 0.5, 89.5), [6, -3]);
  g.u[359] = 4;
  g.u[0] = 8;
  assert.equal(interpolateWind(g, -0.5, 90)[0], 6);
  assert.equal(interpolateWind(g, 0, 91), null);
  g.v[0] = NaN;
  assert.equal(validWindGrid(g), false);
});
test('index selects 10 metre components and rejects missing ranges', () => {
  assert.deepEqual(
    windRanges(
      '1:0:x:UGRD:10 mb:\n2:50:x:UGRD:10 m above ground:\n3:100:x:VGRD:10 m above ground:\n4:150:x:TMP:surface:',
    ),
    [
      [50, 99],
      [100, 149],
    ],
  );
  assert.throws(() => windRanges('1:0:x:UGRD:10 m above ground:'));
});
test('API validates hour and coalesces/cache grid requests', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    if (url.endsWith('.idx'))
      return new Response(
        '1:0:x:UGRD:10 m above ground:\n2:4:x:VGRD:10 m above ground:\n3:8:x:TMP:surface:',
      );
    const range = options.headers.Range.slice(6);
    return new Response('GRIB', {
      status: 206,
      headers: { 'Content-Range': 'bytes ' + range + '/8' },
    });
  };
  const app = express();
  app.use(
    createWind({
      fetcher,
      now: () => Date.UTC(2026, 10, 16, 12),
      decode: async () => ({ ...grid(), reference: '202611160600', forecastHours: 6 }),
    }).router,
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(url + '?hour=1')).status, 400);
    const results = await Promise.all([fetch(url), fetch(url)]);
    for (const response of results) {
      assert.equal(response.status, 200);
      assert.equal((await response.json()).u.length, 65160);
    }
    assert.equal((await fetch(url)).status, 200);
    assert.equal(calls, 3);
  } finally {
    server.close();
  }
});
