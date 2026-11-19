import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { daylightWeight, blendSatellite } from '../server/satellite-composite.mjs';
test('day/night selection follows observation time and location', () => {
  const time = Date.parse('2026-03-20T12:00:00Z');
  assert.equal(daylightWeight(time, 0, 0), 1);
  assert.equal(daylightWeight(time, 180, 0), 0);
  assert.equal(daylightWeight(time + 12 * 3600000, 0, 0), 0);
  for (const longitude of [-90, -85, -80])
    assert.ok(daylightWeight(time, longitude, 0) >= 0 && daylightWeight(time, longitude, 0) <= 1);
});
test('satellite composite uses visible daytime and infrared nighttime, rejects wrong dimensions', async () => {
  const make = (value) =>
    sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: value, g: value, b: value },
      },
    })
      .jpeg()
      .toBuffer();
  const vis = await make(220),
    ir = await make(40),
    time = Date.parse('2026-03-20T12:00:00Z');
  const pixel = async (buffer) => (await sharp(buffer).raw().toBuffer())[0];
  assert.ok((await pixel(await blendSatellite(vis, ir, time, 5, 16, 16))) > 210);
  assert.ok((await pixel(await blendSatellite(vis, ir, time, 5, 0, 16))) < 50);
  await assert.rejects(() => blendSatellite(Buffer.from('bad'), ir, time, 5, 0, 16));
});

test('blue keeps daylight colour and uses infrared clouds at Indonesian night, including replay', async () => {
  const vis = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 40, g: 140, b: 70 } },
  })
    .png()
    .toBuffer();
  const ir = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 230, g: 230, b: 230 } },
  })
    .png()
    .toBuffer();
  const pixel = async (buffer) => [...(await sharp(buffer).raw().toBuffer()).subarray(0, 3)];
  const day = Date.parse('2026-11-17T05:00:00Z');
  const daytime = await pixel(await blendSatellite(vis, ir, day, 5, 25, 16, true));
  const night = await pixel(await blendSatellite(vis, ir, day + 12 * 3600000, 5, 25, 16, true));
  assert.ok(Math.abs(daytime[1] - 140) < 5 && Math.abs(daytime[0] - 40) < 5);
  assert.ok(night[0] > 170 && night[1] > 195 && night[2] > 220);
  assert.deepEqual(await pixel(await blendSatellite(vis, ir, day, 5, 25, 16, true)), daytime);
});
