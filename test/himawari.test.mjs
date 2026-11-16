import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createHimawari, parseHimawariFrames } from '../server/himawari.mjs';
import {
  dailyArchiveFrames,
  validHistoryDate,
  historyBounds,
} from '../server/himawari-history.mjs';
const time = Date.parse('2026-11-16T07:00:00Z');
const row = { basetime: '20261116065000', validtime: '20261116065000' };
const jpeg = Buffer.from([255, 216, 255, 217]);
test('recent timeline retains twelve hours including both endpoints', () => {
  const rows = Array.from({ length: 90 }, (_, i) => {
    const id = new Date(time - i * 600000).toISOString().replace(/\D/g, '').slice(0, 14);
    return { basetime: id, validtime: id };
  });
  const frames = parseHimawariFrames(rows, time);
  assert.equal(frames.length, 73);
  assert.equal(frames.at(-1).time - frames[0].time, 12 * 3600000);
});
const archiveXml =
  '<Layer><ows:Identifier>Himawari_AHI_Band13_Clean_Infrared</ows:Identifier><Value>2026-10-16T00:00:00Z/2026-10-16T23:50:00Z/PT10M</Value><Value>2026-11-15T06:10:00Z/2026-11-15T07:00:00Z/PT10M</Value></Layer>';
test('daily archive validates calendar month bounds and never substitutes a different day', () => {
  assert.equal(validHistoryDate('2026-10-16', time), true);
  for (const date of ['2026-10-15', '2026-11-17', '2026-11-31', '../frames', ['2026-11-15']])
    assert.equal(validHistoryDate(date, time), false);
  assert.equal(historyBounds(Date.parse('2026-03-31')).min, '2026-02-28');
  assert.deepEqual(
    dailyArchiveFrames(archiveXml, time).map((f) => f.id),
    ['h20261016050000', 'h20261115061000'],
  );
});
test('archive endpoint selects actual observations, caches metadata and proxies only allowlisted PNG tiles', async (t) => {
  const calls = [];
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const base = await service(t, async (url) => {
    calls.push(url);
    return url.endsWith('.xml')
      ? new Response(archiveXml)
      : new Response(png, { headers: { 'content-type': 'image/png' } });
  });
  assert.equal((await fetch(base + '/history?date=2026-10-15')).status, 400);
  assert.equal(calls.length, 0);
  const response = await fetch(base + '/history?date=2026-10-16');
  assert.equal((await response.json()).frames[0].id, 'h20261016050000');
  assert.equal((await fetch(base + '/history?date=2026-11-14')).status, 404);
  assert.equal(calls.length, 1);
  assert.equal((await fetch(base + '/tiles/h20261016060000/4/12/8.jpg')).status, 404);
  const image = await fetch(base + '/tiles/h20261016050000/4/12/8.jpg');
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  assert.ok(calls[1].endsWith('/2026-10-16T05:00:00Z/GoogleMapsCompatible_Level6/4/8/12.png'));
  await fetch(base + '/tiles/h20261016050000/4/12/8.jpg');
  assert.equal(calls.length, 2);
});
async function service(t, fetcher, now = () => time) {
  const app = express();
  app.use('/sat', createHimawari({ fetcher, now }).router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}/sat`;
}
test('satellite timeline sorts, deduplicates and excludes malformed, old or future frames', () => {
  const frames = parseHimawariFrames(
    [
      row,
      row,
      { basetime: '20261116064000', validtime: '20261116064000' },
      { basetime: '20261131000000', validtime: '20261131000000' },
      { basetime: '20201116000000', validtime: '20201116000000' },
      { basetime: '20271116000000', validtime: '20271116000000' },
      { basetime: 'https://bad.test', validtime: '20261116065000' },
    ],
    time,
  );
  assert.deepEqual(
    frames.map((f) => f.id),
    ['20261116064000', '20261116065000'],
  );
  assert.throws(() => parseHimawariFrames([], time));
});
test('satellite proxy caches and coalesces requests, restricts paths and validates images', async (t) => {
  const calls = [];
  const base = await service(t, async (url) => {
    calls.push(url);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return url.endsWith('.json')
      ? Response.json([row])
      : new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
  });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => fetch(base + '/frames').then((r) => r.json())),
  );
  assert.equal(calls.length, 1);
  assert.equal(results[0].stale, false);
  const path = '/tiles/20261116065000/4/12/8.jpg';
  const images = await Promise.all(Array.from({ length: 5 }, () => fetch(base + path)));
  assert.ok(images.every((r) => r.status === 200));
  assert.equal(calls.length, 2);
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), jpeg);
  await fetch(base + path);
  assert.equal(calls.length, 2);
  assert.equal((await fetch(base + '/tiles/20261116065000/6/12/8.jpg')).status, 400);
  assert.equal((await fetch(base + '/tiles/20261116065000/3/8/1.jpg')).status, 400);
  assert.equal((await fetch(base + '/tiles/20261116064000/4/12/8.jpg')).status, 404);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every((url) => url.startsWith('https://www.jma.go.jp/bosai/himawari/data/satimg/')),
  );
});
test('satellite source outages expose stale timestamps, expire old fallback and negatively cache bad tiles', async (t) => {
  let clock = time,
    fail = false,
    tiles = 0;
  const base = await service(
    t,
    async (url) => {
      if (url.endsWith('.json')) {
        if (fail) throw Error('offline');
        return Response.json([row]);
      }
      tiles++;
      return new Response('<html>error</html>', { headers: { 'content-type': 'image/jpeg' } });
    },
    () => clock,
  );
  assert.equal((await fetch(base + '/frames')).status, 200);
  const tile = base + '/tiles/20261116065000/4/12/8.jpg';
  assert.equal((await fetch(tile)).status, 502);
  assert.equal((await fetch(tile)).status, 502);
  assert.equal(tiles, 1);
  fail = true;
  clock += 180000;
  const stale = await (await fetch(base + '/frames')).json();
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, time);
  clock += 13 * 3600000;
  assert.equal((await fetch(base + '/frames')).status, 503);
});

test('satellite tile queue bounds upstream concurrency without dropping a normal viewport burst', async (t) => {
  let active = 0,
    peak = 0;
  const base = await service(t, async (url) => {
    if (url.endsWith('.json')) return Response.json([row]);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 25));
    active--;
    return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
  });
  await fetch(base + '/frames');
  const results = await Promise.all(
    Array.from({ length: 24 }, (_, i) => fetch(`${base}/tiles/20261116065000/5/${i}/16.jpg`)),
  );
  assert.ok(results.every((response) => response.status === 200));
  assert.ok(peak <= 8);
  assert.ok(peak > 1);
});
