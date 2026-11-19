import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brightnessTemperature,
  hsdPixel,
  interpolateTemperature,
  temperatureColor,
  parseHsd,
} from '../server/himawari-hsd.mjs';
const calibration = {
  wavelength: 10.4074,
  bits: 12,
  error: 65535,
  outside: 65534,
  gain: -0.0037525074318633814,
  offset: 15.197657722429469,
  c0: -0.118260812197365,
  c1: 1.00101143081895,
  c2: -1.80800453227613e-6,
  light: 299792458,
  planck: 6.62607015e-34,
  boltzmann: 1.380649e-23,
};
test('Band 13 calibration preserves physical units and missing observations', () => {
  assert.ok(Math.abs(brightnessTemperature(2000, calibration) - 285.0353) < 0.01);
  assert.ok(Math.abs(brightnessTemperature(4000, calibration) - 161.5675) < 0.01);
  for (const count of [65535, 65534, -1, 4096])
    assert.ok(Number.isNaN(brightnessTemperature(count, calibration)));
});
test('interpolation precedes palette and never bridges missing observations', () => {
  const value = interpolateTemperature([203.15, 243.15, 203.15, 243.15], 0.5, 0.5);
  assert.equal(value, 223.15);
  assert.deepEqual(temperatureColor(value), [255, 235, 0, 255]);
  assert.ok(Number.isNaN(interpolateTemperature([NaN, 200, 200, 200], 0.5, 0.5)));
  assert.equal(interpolateTemperature([200, NaN, NaN, NaN], 0, 0), 200);
  assert.deepEqual(temperatureColor(NaN), [0, 0, 0, 0]);
});
test('navigation places satellite nadir at centre and excludes far side', () => {
  const nav = {
    longitude: 140.7,
    cfac: 20466275,
    lfac: 20466275,
    coff: 2750.5,
    loff: 2750.5,
    distance: 42164,
    equatorial: 6378.137,
    polar: 6356.7523,
  };
  assert.deepEqual(hsdPixel(0, 140.7, nav), [2749.5, 2749.5]);
  assert.equal(hsdPixel(0, -39.3, nav), null);
  assert.ok(hsdPixel(-6, 107, nav)[1] > 2749.5);
  assert.ok(hsdPixel(-6, 107, nav)[0] < 2749.5);
});
test('HSD parser rejects truncated and invalid byte-order input', () => {
  assert.throws(() => parseHsd(Buffer.alloc(100)));
  const body = Buffer.alloc(400);
  body[0] = 1;
  body[5] = 1;
  assert.throws(() => parseHsd(body), /byte order/);
  body[5] = 0;
  body.writeUInt32LE(1000, 70);
  assert.throws(() => parseHsd(body), /length/);
});

test('raw renderer decodes HSD, preserves calibrated colour and reuses segment cache', async () => {
  const { readFile } = await import('node:fs/promises');
  const { default: sharp } = await import('sharp');
  const { createTemperatureRenderer } = await import('../server/himawari-temperature.mjs');
  const body = await readFile(new URL('./fixtures/himawari-b13-segment6.bz2', import.meta.url));
  let calls = 0;
  const render = createTemperatureRenderer({
    download: async (url) => {
      calls++;
      assert.match(url, /S0610.DAT.bz2$/);
      return { body };
    },
    withTileSlot: (task) => task(),
  });
  const image = await render('20261118080000', 8, 204, 132);
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 512);
  const expected = temperatureColor(Math.fround(brightnessTemperature(2000, calibration)));
  for (let i = 0; i < 4; i++)
    assert.ok(Math.abs(data[256 * 512 * 4 + 256 * 4 + i] - expected[i]) <= 1);
  await render('20261118080000', 8, 204, 132);
  assert.equal(calls, 1);
  await assert.rejects(render('20261118081000', 8, 204, 132), /Wrong HSD/);
  await assert.rejects(render('20261118081000', 8, 204, 132), /unavailable/);
  assert.equal(calls, 2);
});
