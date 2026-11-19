import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { satellitePixel, createSatelliteDetail } from '../server/himawari-detail.mjs';

test('geostationary navigation places nadir centrally and rejects the far side', () => {
  assert.deepEqual(satellitePixel(0, 140.69), [2752.5, 2752.5]);
  assert.equal(satellitePixel(0, -39.31), null);
  assert.ok(satellitePixel(0, 110)[0] < 2752.5);
  assert.ok(satellitePixel(-7, 110)[1] > 2752.5);
  const [x, y] = satellitePixel(-7, 110);
  assert.ok(x > 1100 && x < 1300 && y > 3100 && y < 3300);
});

test('detail preserves uniform pixels, exact frame, coalesces native downloads and caches', async () => {
  const body = await sharp({
    create: { width: 688, height: 688, channels: 3, background: { r: 80, g: 120, b: 160 } },
  })
    .png()
    .toBuffer();
  const urls = [];
  const render = createSatelliteDetail({
    fetcher: fetch,
    withTileSlot: (fn) => fn(),
    download: async (url) => {
      urls.push(url);
      return { body, type: 'image/png' };
    },
  });
  const [a, b] = await Promise.all([
    render('20261117130000', 8, 204, 132),
    render('20261117130000', 8, 204, 132),
  ]);
  assert.deepEqual(a, b);
  assert.equal(urls.length, new Set(urls).size);
  assert.ok(urls.every((url) => url.includes('/20261117130000/03/')));
  const decoded = await sharp(a).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 512);
  assert.deepEqual([...decoded.data.subarray(0, 4)], [80, 120, 160, 255]);
  const before = urls.length;
  await render('20261117130000', 8, 204, 132);
  assert.equal(urls.length, before);
});

test('detail rejects corrupt images and temporarily caches failures', async () => {
  let calls = 0;
  const render = createSatelliteDetail({
    fetcher: fetch,
    withTileSlot: (fn) => fn(),
    download: async () => {
      calls++;
      return { body: Buffer.from('bad'), type: 'image/png' };
    },
  });
  await assert.rejects(render('20261117130000', 8, 204, 132));
  const before = calls;
  await assert.rejects(render('20261117130000', 8, 204, 132));
  assert.equal(calls, before);
});

test('regional Infra uses native detail and Blue uses the 1km GeoColor product', async () => {
  const body = await sharp({ create: { width: 688, height: 688, channels: 3, background: '#777' } })
    .png()
    .toBuffer();
  const urls = [];
  const render = createSatelliteDetail({
    fetcher: fetch,
    withTileSlot: (fn) => fn(),
    download: async (url) => {
      urls.push(url);
      return { body, type: 'image/png' };
    },
  });
  await render('20261118012000', 4, 12, 8);
  assert.ok(urls.length > 0 && urls.every((url) => url.includes('/band_13/20261118012000/03/')));
  urls.length = 0;
  await render('20261118012000', 5, 25, 16, 'geocolor');
  assert.ok(urls.length > 0 && urls.every((url) => url.includes('/geocolor/20261118012000/04/')));
  await assert.rejects(render('20261118012000', 5, 25, 16, '../invalid'));
});

test('close Infra zoom interpolates bounded colours without sharpening halos', async () => {
  const pixels = Buffer.alloc(688 * 688 * 3);
  for (let y = 0; y < 688; y++)
    for (let x = 0; x < 688; x++) {
      const i = (y * 688 + x) * 3;
      pixels[i] = x % 2 ? 255 : 0;
      pixels[i + 1] = x % 2 ? 0 : 255;
      pixels[i + 2] = 0;
    }
  const body = await sharp(pixels, { raw: { width: 688, height: 688, channels: 3 } })
    .png()
    .toBuffer();
  const render = createSatelliteDetail({
    fetcher: fetch,
    withTileSlot: (fn) => fn(),
    download: async () => ({ body, type: 'image/png' }),
  });
  const image = await render('20261118012000', 8, 204, 132);
  const decoded = await sharp(image).raw().toBuffer();
  let interpolated = 0;
  for (let i = 0; i < decoded.length; i += 4) {
    if (decoded[i] > 0 && decoded[i] < 255) interpolated++;
    assert.ok(Math.abs(decoded[i] + decoded[i + 1] - 255) <= 1);
    assert.equal(decoded[i + 2], 0);
  }
  assert.ok(interpolated > decoded.length / 8);
});
