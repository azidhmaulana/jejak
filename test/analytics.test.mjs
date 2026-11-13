import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createDatabase } from '../server/database/index.mjs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createAnalytics } from '../server/analytics.mjs';
import { publicCameras } from '../server/camera-catalog.mjs';

test('analytics validates events, deduplicates and isolates public/admin aggregates', async () => {
  const db = await createDatabase(`.runtime/test-analytics-${randomUUID()}`);
  const auth = {
    db,
    requirePermission: (permission) => (req, res, next) =>
      req.user?.permissions.includes(permission) ? next() : res.sendStatus(403),
  };
  const app = express();
  // Test-only authentication fixture; production uses signed-in session lookup.
  app.use((req, _res, next) => {
    const role = req.get('test-role');
    if (role)
      req.user = { role, permissions: req.get('test-permission') ? ['analytics.view'] : [] };
    next();
  });
  let camerasEnabled = true;
  app.use(createAnalytics(auth, async () => () => camerasEnabled));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const event = {
    id: randomUUID(),
    visitor: randomUUID(),
    session: randomUUID(),
    kind: 'camera_open',
    camera: publicCameras[0].id,
  };
  const send = (body) =>
    fetch(base + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(base + '/admin')).status, 401);
    for (const role of ['viewer', 'operator'])
      assert.equal(
        (await fetch(base + '/admin', { headers: { 'test-role': role, 'test-permission': 'yes' } }))
          .status,
        403,
      );
    assert.equal((await fetch(base + '/admin', { headers: { 'test-role': 'admin' } })).status, 403);
    for (const bad of [
      null,
      [],
      { ...event, camera: 'missing' },
      { ...event, seconds: 999 },
      { ...event, password: 'secret' },
      { ...event, kind: 'watch', seconds: -1 },
    ])
      assert.equal((await send(bad)).status, 400);
    assert.equal((await send(event)).status, 200);
    await send(event);
    await send({ ...event, id: randomUUID() });
    const parallel = await Promise.all(
      Array.from({ length: 12 }, () => send({ ...event, id: randomUUID() })),
    );
    assert.ok(parallel.every((response) => response.status === 200));
    const presence = await (await fetch(base + '/presence')).json();
    assert.deepEqual(presence, { active: 1, windowMinutes: 5 });
    const publicResponse = await fetch(base + '/public');
    const pub = await publicResponse.json();
    assert.equal(publicResponse.status, 200, JSON.stringify(pub));
    assert.equal(pub.cameras[0].views, 1);
    assert.equal(pub.intervalHours, 3);
    assert.equal(pub.timezone, 'Asia/Jakarta');
    assert.equal(pub.trend.length, 57);
    assert.equal(
      pub.trend.reduce((sum, row) => sum + row.views, 0),
      1,
    );
    for (let i = 1; i < pub.trend.length; i++) {
      assert.equal(Date.parse(pub.trend[i].day) - Date.parse(pub.trend[i - 1].day), 10800000);
      assert.equal(Number(pub.trend[i].day.slice(11, 13)) % 3, 0);
    }
    assert.ok(pub.trend.some((row) => row.views === 0));
    camerasEnabled = false;
    const hidden = await (await fetch(base + '/public')).json();
    assert.equal(hidden.cameras.length, 0);
    assert.equal(
      hidden.trend.reduce((sum, row) => sum + row.views, 0),
      0,
    );
    camerasEnabled = true;

    assert.equal(pub.cameras[0].viewers, undefined);
    for (const key of ['summary', 'active', 'devices', 'referrals', 'registrations'])
      assert.equal(pub[key], undefined);
    assert.ok(!JSON.stringify(pub).includes(event.visitor));
    for (const role of ['admin', 'superadmin']) {
      const result = await fetch(base + '/admin', {
        headers: { 'test-role': role, 'test-permission': 'yes' },
      });
      assert.equal(result.status, 200);
      assert.equal((await result.json()).summary.opens, 1);
    }
    assert.equal((await fetch(base + '/public?days=999')).status, 400);
    assert.equal(
      (await db.prepare('SELECT visitor FROM analytics_events').get()).visitor.length,
      64,
    );
    const old = { ...event, id: randomUUID(), session: randomUUID() };
    await send(old);
    await db.prepare('UPDATE analytics_events SET time=0 WHERE id=?').run(old.id);
    assert.equal((await (await fetch(base + '/public')).json()).cameras[0].views, 1);
    await db.prepare("UPDATE roles SET permissions='[]' WHERE id='admin'").run();
    createAnalytics(auth);
    assert.equal(
      (await db.prepare("SELECT permissions FROM roles WHERE id='admin'").get()).permissions,
      '[]',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
