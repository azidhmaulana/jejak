import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createDatabase } from '../server/database/index.mjs';
import { checkCamera, createCameraChecks } from '../server/camera-checks.mjs';
import { cameras } from '../server/osint-camera-media.mjs';
import { createApp } from '../server/app.mjs';
const old = 'https://jmlive.jasamarga.com/hls/6/5523b226-bbc4-4059-b55c-bf7d554286d6/index.m3u8';
const next = 'https://jmlive.jasamarga.com/hls/6/664fdc45-3d82-4c58-8caa-f3bce26045ef/index.m3u8';
const camera = {
  id: 'check-test',
  name: 'Test camera',
  kind: 'camera',
  provider: 'Test provider',
  streamUrl: old,
};
test('manual check discovers a changed official URL even when the old URL still responds', async () => {
  const source = { ...camera, url: 'https://binamarga.pu.go.id/contents/cctv_tol/?id_ruas=test' };
  const probed = [];
  const result = await checkCamera(source, {
    current: new URL(old), resolve: async () => new URL(next),
    probe: async (_id, url) => { probed.push(url.href); },
  });
  assert.equal(result.status, 'updated');
  assert.deepEqual(probed, [next]);
  const fallback = await checkCamera(source, {
    current: new URL(old), resolve: async () => new URL(next),
    probe: async (_id, url) => { if (url.href === next) throw Error('unavailable'); },
  });
  assert.equal(fallback.status, 'online');
  assert.equal(fallback.url, old);
  const empty = await checkCamera(source, {
    current: new URL(old), resolve: async () => new URL(next),
    probe: async () => { throw Error('Empty manifest'); },
  });
  assert.equal(empty.status, 'failed');
  assert.equal(empty.reason, 'replacement_empty');
});

test('check validates replacement media without mutating current playback and refuses unsafe candidates', async () => {
  cameras.set(camera.id, new URL(old));
  try {
    for (const candidate of [next, 'http://127.0.0.1/private', next.replace('/6/', '/7/')]) {
      const result = await checkCamera(camera, {
        probe: async (_id, url) => {
          if (url.href === old) throw Error('Expired');
        },
        resolve: async () => new URL(candidate),
      });
      assert.equal(result.status, candidate === next ? 'updated' : 'failed');
      assert.equal(cameras.get(camera.id).href, old);
    }
    assert.equal(
      (
        await checkCamera(camera, {
          probe: async () => {
            throw Error('Bad segment');
          },
          resolve: async () => new URL(next),
        })
      ).status,
      'failed',
    );
    assert.equal((await checkCamera({ id: 'embed' })).status, 'skipped');
    assert.equal(
      (
        await checkCamera(camera, {
          probe: async () => {},
          resolve: async () => {
            throw Error('Should not refresh');
          },
        })
      ).status,
      'online',
    );
  } finally {
    cameras.delete(camera.id);
  }
});

test('check job is singleton, bounded, persisted, restores validated URL and rejects invalid scope', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jejak-check-'));
  const db = await createDatabase(dir);
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let busy = 0,
    max = 0;
  const catalogue = [
    camera,
    ...Array.from({ length: 5 }, (_, i) => ({ ...camera, id: `check-${i}` })),
  ];
  const checks = await createCameraChecks(db, {
    catalogue,
    check: async (c) => {
      busy++;
      max = Math.max(max, busy);
      await gate;
      busy--;
      return c.id === camera.id
        ? { status: 'updated', oldUrl: old, url: next }
        : { status: 'failed' };
    },
  });
  try {
    await assert.rejects(checks.start('http://127.0.0.1', null), { status: 400 });
    const job = await checks.start(undefined, null);
    const duplicate = await createCameraChecks(db, { catalogue });
    await assert.rejects(duplicate.start(undefined, null), { status: 409 });
    release();
    for (let i = 0; i < 100 && (await checks.latest()).status === 'running'; i++)
      await new Promise((r) => setTimeout(r, 10));
    const result = await checks.latest();
    assert.equal(result.status, 'completed');
    assert.equal(result.done, 6);
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 5);
    assert.ok(max <= 2);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM camera_stream_history').get()).n, 1);
    cameras.delete(camera.id);
    const reopened = await createCameraChecks(db, { catalogue });
    assert.equal(cameras.get(camera.id).href, next);
    assert.equal((await reopened.latest()).id, job.id);
    await assert.rejects(reopened.start(undefined, null), { status: 429 });
    await reopened.close();
    await duplicate.close();
  } finally {
    release();
    await checks.close();
    await db.close();
    cameras.delete(camera.id);
    await rm(dir, { recursive: true, force: true });
  }
});

test('only superadmin can read or start checks; request URLs are never accepted', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jejak-check-auth-'));
  const app = await createApp({ directory: dir });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const req = (route, method = 'GET', body, cookie = '') =>
    fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    for (const method of ['GET', 'POST'])
      assert.equal(
        (await req('/cctv-sources/check', method, method === 'POST' ? {} : undefined)).status,
        401,
      );
    const setup = await req('/auth/setup', 'POST', {
      token: (await readFile(path.join(dir, 'setup-token.txt'), 'utf8')).trim(),
      name: 'Owner',
      email: 'owner@example.test',
      password: 'Strong-password-123',
    });
    const owner = setup.headers.get('set-cookie').split(';')[0];
    assert.equal((await req('/cctv-sources/check', 'GET', undefined, owner)).status, 200);
    for (const payload of [{ url: 'http://127.0.0.1' }, { provider: 'unknown' }, [], null])
      assert.equal((await req('/cctv-sources/check', 'POST', payload, owner)).status, 400);
    const registered = await req('/auth/register', 'POST', {
      name: 'Viewer',
      email: 'viewer@example.test',
      password: 'Strong-password-123',
    });
    const viewer = registered.headers.get('set-cookie').split(';')[0];
    for (const method of ['GET', 'POST'])
      assert.equal(
        (await req('/cctv-sources/check', method, method === 'POST' ? {} : undefined, viewer))
          .status,
        403,
      );
    const db = await createDatabase(dir);
    await db.query("UPDATE users SET role='admin' WHERE email='viewer@example.test'");
    await db.close();
    assert.equal((await req('/cctv-sources/check', 'POST', {}, viewer)).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await app.locals.close();
    await rm(dir, { recursive: true, force: true });
  }
});
