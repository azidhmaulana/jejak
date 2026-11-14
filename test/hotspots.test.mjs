import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase } from '../server/database/index.mjs';
import { secretCodec } from '../server/hotspots/settings.mjs';
import {
  normalizeFirms,
  normalizeSipongi,
  mergeDetections,
  validDay,
  fetchFirms,
  parseCsv,
} from '../server/hotspots/providers.mjs';
import { createHotspots } from '../server/hotspots/service.mjs';

const point = {
  latitude: '-6.9175',
  longitude: '107.6191',
  acq_date: '2020-01-01',
  acq_time: '0305',
  satellite: 'N20',
  confidence: 'h',
  frp: '12',
};
test('hotspot parser validates coordinates, dates and normalizes confidence without inventing fires', () => {
  const item = normalizeFirms(point, 'VIIRS_NOAA20');
  assert.equal(item.satellite, 'NOAA-20');
  assert.equal(item.confidence, 'high');
  assert.equal(item.time, Date.parse('2020-01-01T03:05:00Z'));
  assert.equal(
    normalizeFirms({ ...point, latitude: '1.3521', longitude: '103.8198' }, 'MODIS'),
    null,
  );
  assert.equal(normalizeFirms({ ...point, latitude: '' }, 'MODIS'), null);
  assert.equal(normalizeFirms({ ...point, acq_time: '2560' }, 'MODIS'), null);
  assert.equal(normalizeFirms({ ...point, confidence: '80' }, 'MODIS').confidence, 'high');
  assert.equal(validDay('2024-02-30'), false);
  assert.equal(validDay(['2020-01-01']), false);
  const sip = normalizeSipongi({
    geometry: { type: 'Point', coordinates: [107.6191, -6.9175] },
    properties: {
      sumber: 'NASA-NOAA20',
      date_hotspot_ori: '2020-01-01T03:05:00.000000Z',
      confidence_level: 'high',
      desa: 'Bandung',
    },
  });
  const merged = mergeDetections([item, sip, item]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].providers, ['firms', 'sipongi']);
  assert.equal(merged[0].frp, 12);
  assert.equal(merged[0].place, 'Bandung');
  assert.equal(
    mergeDetections([item, { ...item, id: 'another-pass', time: item.time + 60000 }]).length,
    2,
  );
  assert.equal(parseCsv('a,b\n"x,y","z"\n').rows[0].a, 'x,y');
});
test('encrypted secrets are authenticated and tied to a provider', () => {
  const codec = secretCodec('ab'.repeat(32)),
    cipher = codec.seal('secret-value', 'firms');
  assert.ok(!cipher.includes('secret-value'));
  assert.equal(codec.open(cipher, 'firms'), 'secret-value');
  assert.throws(() => codec.open(cipher, 'sipongi'));
  assert.throws(() => secretCodec('not-a-key'));
});
test('FIRMS history selects an available product and reports missing satellite coverage', async () => {
  const calls = [];
  const result = await fetchFirms('2020-01-01', 'ab'.repeat(16), async (url) => {
    calls.push(url);
    return url.includes('data_availability')
      ? 'data_id,min_date,max_date\nVIIRS_NOAA20_SP,2018-01-01,2025-01-01\n'
      : 'latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n-6.9175,107.6191,2020-01-01,0305,N20,h,12\n';
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.unavailable.length, 3);
  assert.ok(calls[1].includes('VIIRS_NOAA20_SP'));
});
test('source administration rejects other roles, encrypts keys, redacts responses, caches and honours disabled sources', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jejak-hotspots-')),
    db = await createDatabase(dir);
  const audit = [],
    requests = [];
  const service = createHotspots({ db, audit: async (...args) => audit.push(args) }, dir, {
    redisUrl: '',
    read: async (url) => {
      requests.push(url);
      if (url.includes('indoHotspot'))
        return JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              geometry: { type: 'Point', coordinates: [107.6191, -6.9175] },
              properties: {
                sumber: 'NASA-NOAA20',
                date_hotspot_ori: '2020-01-01T03:05:00Z',
                confidence_level: 'high',
              },
            },
          ],
        });
      throw Error('Upstream error with secret-value');
    },
  });
  const app = express();
  app.use((req, _res, next) => {
    if (req.headers['x-test-role'])
      req.user = { id: 'test-user', role: req.headers['x-test-role'] };
    next();
  });
  app.use('/api/hotspots', service.router);
  app.use('/api/hotspot-sources', service.admin);
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.status ? error.message : 'error' }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, role, method = 'GET', body) =>
    fetch(base + url, {
      method,
      headers: { ...(role ? { 'x-test-role': role } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    for (const role of [undefined, 'viewer', 'operator', 'admin']) {
      const status = role ? 403 : 401;
      assert.equal((await request('/api/hotspot-sources', role)).status, status);
      assert.equal(
        (await request('/api/hotspot-sources/firms', role, 'PATCH', { active: true })).status,
        status,
      );
      assert.equal(
        (await request('/api/hotspot-sources/firms/check', role, 'POST', {})).status,
        status,
      );
    }
    const key = 'ab'.repeat(16);
    let response = await request('/api/hotspot-sources/firms', 'superadmin', 'PATCH', {
      active: true,
      apiKey: key,
    });
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes(key));
    const row = await db.prepare('SELECT secret FROM hotspot_sources WHERE id=?').get('firms');
    assert.ok(row.secret && !row.secret.includes(key));
    response = await request('/api/hotspot-sources', 'superadmin');
    const sources = await response.json();
    assert.equal(sources.sources[0].hasKey, true);
    assert.ok(!JSON.stringify(sources).includes(row.secret));
    assert.equal(
      (
        await request('/api/hotspot-sources/firms', 'superadmin', 'PATCH', {
          active: true,
          endpoint: 'http://127.0.0.1/secret',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/api/hotspot-sources/sipongi', 'superadmin', 'PATCH', {
          active: true,
          apiKey: key,
        })
      ).status,
      400,
    );
    assert.equal((await request('/api/hotspots?day=2020-02-30')).status, 400);
    assert.equal((await request('/api/hotspots?day=2020-01-01&day=2020-01-02')).status, 400);
    let result = await (await request('/api/hotspots?day=2020-01-01&source=sipongi')).json();
    assert.equal(result.items.length, 1);
    await request('/api/hotspots?day=2020-01-01&source=sipongi');
    assert.equal(requests.length, 1);
    await request('/api/hotspot-sources/sipongi', 'superadmin', 'PATCH', { active: false });
    result = await (await request('/api/hotspots?day=2020-01-01&source=sipongi')).json();
    assert.equal(result.items.length, 0);
    assert.equal(result.sources.sipongi.status, 'disabled');
    result = await (await request('/api/hotspots?day=2020-01-01&source=firms')).json();
    assert.equal(result.sources.firms.status, 'unavailable');
    assert.ok(!JSON.stringify(result).includes('secret-value'));
    await request('/api/hotspot-sources/firms', 'superadmin', 'PATCH', {
      active: true,
      clearKey: true,
    });
    result = await (await request('/api/hotspots?day=2020-01-01&source=firms')).json();
    assert.equal(result.sources.firms.status, 'needs-key');
    assert.ok(audit.length >= 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
