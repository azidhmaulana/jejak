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
        if (url.includes('CurrentStorms.json')) return Response.json({ activeStorms: [] });
        if (url.includes('targetTc.json')) return Response.json([]);
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
    assert.equal(calls, 6);
  } finally {
    server.close();
  }
});

import { parseNhc, parseJma, jmaTargets, mergeCyclones } from '../server/cyclone-providers.mjs';
const nhcRow = {
  id: 'al012026',
  name: 'Alpha',
  classification: 'TS',
  latitudeNumeric: 12,
  longitudeNumeric: -65,
  lastUpdate: new Date(now).toISOString(),
  intensity: '50',
  movementDir: 270,
  movementSpeed: 8,
};
test('NHC accepts current observations and excludes remnants, forecasts and old reports', () => {
  const parsed = parseNhc(
    {
      activeStorms: [
        nhcRow,
        { ...nhcRow, id: 'al022026', classification: 'PTC' },
        { ...nhcRow, id: 'al032026', lastUpdate: new Date(now - 48 * 3600000).toISOString() },
      ],
    },
    now,
  );
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].windKnots, 50);
  assert.equal(parsed.items[0].agency, 'NHC');
  assert.throws(() => parseNhc({}, now));
  assert.throws(() => parseNhc({ activeStorms: [{ ...nhcRow, latitudeNumeric: 200 }] }, now));
});
test('JMA takes analysis only, validates IDs and does not invent intensity', () => {
  const target = { tropicalCyclone: 'TC2627', typhoonNumber: '2627', category: 'TY' };
  assert.equal(jmaTargets([target]).length, 1);
  assert.throws(() => jmaTargets([{ ...target, tropicalCyclone: '../../secret' }]));
  const rows = [
    { part: 'title' },
    { advancedHours: 0, center: [20, 130], validtime: { JST: new Date(now).toISOString() } },
    {
      advancedHours: 24,
      center: [21, 132],
      validtime: { JST: new Date(now + 86400000).toISOString() },
    },
  ];
  const item = parseJma(target, rows, now);
  assert.equal(item.lat, 20);
  assert.equal(item.windKnots, null);
  assert.equal(item.windPeriodMinutes, 10);
  assert.equal(parseJma(target, rows, now + 48 * 3600000), null);
  assert.throws(() => parseJma(target, [rows[2]], now));
});
test('merge keeps provenance and separate storms, handles dateline and ambiguous matches', () => {
  const a = { ...parseNhc({ activeStorms: [nhcRow] }, now).items[0], lng: 179.8 };
  const b = { ...a, id: 'wp0126', agency: 'JTWC', lng: -179.8, time: now - 3600000 };
  let result = mergeCyclones([a, b]);
  assert.equal(result.length, 1);
  assert.equal(result[0].reports.length, 2);
  assert.equal(result[0].time, now);
  assert.equal(mergeCyclones([a, { ...b, lng: 120 }]).length, 2);
  assert.equal(mergeCyclones([a, { ...b, agency: 'NHC' }]).length, 2);
  assert.equal(mergeCyclones([a, { ...a, id: 'al022026' }, b]).length, 3);
});
test('a failed provider does not erase healthy providers and is reported', async () => {
  const app = express();
  app.use(
    createCyclones({
      now: () => now,
      fetcher: async (url) => {
        if (url.includes('CurrentStorms.json')) return Response.json({ activeStorms: [nhcRow] });
        return new Response('Unavailable', { status: 503 });
      },
    }).router,
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const r = await fetch('http://127.0.0.1:' + server.address().port);
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.items.length, 1);
    assert.equal(data.sources.find((s) => s.agency === 'JTWC').status, 'unavailable');
    assert.equal(data.sources.find((s) => s.agency === 'NHC').status, 'ok');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

import { parseInvestAdvisory } from '../server/cyclone-invests.mjs';
const advisory =
  'JOINT TYPHOON WRNCEN /161000Z-171000ZNOV2026// (1) THE AREA OF CONVECTION (INVEST 96S) PREVIOUSLY LOCATED NEAR 0.8S 91.7E IS NOW LOCATED NEAR 2.1S 91.5E. MAXIMUM SUSTAINED SURFACE WINDS ARE ESTIMATED AT 28 TO 33 KNOTS. THE POTENTIAL FOR THE DEVELOPMENT OF A SIGNIFICANT TROPICAL CYCLONE WITHIN THE NEXT 24 HOURS REMAINS MEDIUM. (2) NO OTHER SUSPECT AREAS.';
test('invest uses current location, range and potential, excludes promoted and stale reports', () => {
  const data = parseInvestAdvisory(advisory, 'abioweb', now);
  assert.equal(data.items.length, 1);
  const c = data.items[0];
  assert.equal(c.name, '96S');
  assert.equal(c.lat, -2.1);
  assert.equal(c.lng, 91.5);
  assert.equal(c.potential, 'MEDIUM');
  assert.deepEqual(c.windRangeKnots, [28, 33]);
  assert.equal(c.windKnots, null);
  assert.throws(() => parseInvestAdvisory(advisory, 'abioweb', now + 48 * 3600000));
  assert.equal(
    parseInvestAdvisory(
      advisory.replace(
        'IS NOW LOCATED NEAR 2.1S 91.5E',
        'IS NOW THE SUBJECT OF A TROPICAL CYCLONE WARNING',
      ),
      'abioweb',
      now,
    ).items.length,
    0,
  );
  assert.throws(() => parseInvestAdvisory(advisory.replace('2.1S', '92.1S'), 'abioweb', now));
  assert.equal(
    parseInvestAdvisory(advisory.replace('IS NOW LOCATED NEAR 2.1S 91.5E', ''), 'abioweb', now)
      .items.length,
    0,
  );
});

import {parseJtwcForecast} from '../server/cyclone-forecast.mjs';
test('forecast validates lead times, month rollover and ignores malformed points',()=>{
 const at=Date.UTC(2026,10,30,18);
 const txt='FORECASTS: 12 HRS, VALID AT: 010600Z --- 10.0S 179.0E MAX SUSTAINED WINDS - 055 KT 24 HRS, VALID AT: 011800Z --- 11.0S 179.0W MAX SUSTAINED WINDS - 060 KT 36 HRS, VALID AT: 011800Z --- 12.0S 178.0W';
 const points=parseJtwcForecast(txt,at);assert.equal(points.length,2);assert.equal(points[0].time,Date.UTC(2026,11,1,6));assert.equal(points[1].lng,-179);assert.equal(points[0].windKnots,55);
});
