import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { parseCycloneFeed, parseCycloneWarning, createCyclones } from '../server/cyclones.mjs';
const now = Date.UTC(2026, 10, 16, 12);
const rss =
  '<rss>JTWC<lastBuildDate>Mon, 16 Nov 2026 11:40:02 +0000</lastBuildDate>/products/sh0427web.txt /products/io9226web.txt</rss>';
const warning =
  'TROPICAL CYCLONE 04P (TEST) WARNING NR 003\nWARNING POSITION:\n160600Z --- NEAR 8.5S 161.0W\nMOVEMENT PAST SIX HOURS - 245 DEGREES AT 04 KTS\nMAX SUSTAINED WINDS - 055 KT, GUSTS 070 KT\nFORECASTS:\nMAX SUSTAINED WINDS - 100 KT';
test('current feed excludes invests, refuses stale data', () => {
  assert.deepEqual(parseCycloneFeed(rss, now).products, ['sh0427']);
  assert.throws(() => parseCycloneFeed(rss, now + 48 * 3600000));
});
test('uses analysed position and intensity, never forecast values', () => {
  const c = parseCycloneWarning(warning, 'sh0427', now, now);
  assert.equal(c.windKnots, 55);
  assert.equal(c.lat, -8.5);
  assert.equal(c.lng, -161);
  assert.equal(c.time, Date.UTC(2026, 10, 16, 6));
  assert.equal(
    parseCycloneWarning(warning + '\nTHIS IS THE FINAL WARNING', 'sh0427', now, now),
    null,
  );
  assert.equal(parseCycloneWarning(warning, 'sh0427', now, now + 48 * 3600000), null);
  assert.throws(() => parseCycloneWarning(warning.replace('8.5S', '98.5S'), 'sh0427', now, now));
});
test('API coalesces requests and caches successful results', async () => {
  let calls = 0;
  const app = express();
  app.use(
    createCyclones({
      now: () => now,
      fetcher: async (url) => {
        calls++;
        return new Response(url.endsWith('.rss') ? rss : warning);
      },
    }).router,
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    const responses = await Promise.all([fetch(url), fetch(url)]);
    for (const r of responses) {
      assert.equal(r.status, 200);
      assert.equal((await r.json()).items.length, 1);
    }
    await fetch(url);
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});
