import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { publicMapCatalog } from '../server/public-map-catalog.mjs';

test('public basemap metadata excludes job diagnostics, source URLs and unknown fields', () => {
  const result = publicMapCatalog({
    activeId: 'map',
    activeByProvider: {},
    job: { token: 'private' },
    queue: ['private'],
    regions: [
      {
        id: 'map',
        file: 'public.mbtiles',
        sourceUrl: 'private',
        error: 'private',
        futureSecret: 'private',
        variants: [{ id: '1', token: 'private' }],
      },
    ],
  });
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(result.regions[0].file, 'public.mbtiles');
});

test('all roles enforce API boundaries, hidden superadmin, private account data and live revocation', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jejak-role-audit-'));
  const app = await createApp({ directory, serveDist: true });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app.locals.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, cookie = '', method = 'GET', body, extra = {}) =>
    fetch(base + url, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const sessionCookie = (response) => response.headers.get('set-cookie').split(';')[0];
  const setup = await request('/api/auth/setup', '', 'POST', {
    token: await readFile(path.join(directory, 'setup-token.txt'), 'utf8'),
    name: 'Private Owner',
    email: 'owner@audit.test',
    password: 'audit-password-123',
  });
  assert.equal(setup.status, 200);
  const cookies = { guest: '', superadmin: sessionCookie(setup) };
  const users = { superadmin: (await setup.json()).user };
  for (const role of ['viewer', 'operator', 'admin', 'viewer2']) {
    const created = await request('/api/auth/users', cookies.superadmin, 'POST', {
      name: role,
      email: `${role}@audit.test`,
      password: 'audit-password-123',
      role: role === 'viewer2' ? 'viewer' : role,
    });
    assert.equal(created.status, 201);
    users[role] = (await created.json()).user;
    const login = await request('/api/auth/login', '', 'POST', {
      email: users[role].email,
      password: 'audit-password-123',
    });
    assert.equal(login.status, 200);
    cookies[role] = sessionCookie(login);
  }
  for (const [role, cookie] of Object.entries(cookies)) {
    const deny = role === 'guest' ? 401 : 403;
    const editor = ['operator', 'admin', 'superadmin'].includes(role);
    const manager = ['admin', 'superadmin'].includes(role);
    for (const url of ['/api/bms/projects/osint', '/api/osint/map-overlays']) {
      for (const method of ['GET', 'HEAD'])
        assert.equal(
          (await request(url, cookie, method)).status,
          editor ? 200 : deny,
          `${role} ${method} ${url}`,
        );
    }
    for (const url of ['/api/auth/users', '/api/auth/roles']) {
      const r = await request(url, cookie);
      assert.equal(r.status, manager ? 200 : deny, `${role} ${url}`);
      const data = await r.text();
      assert.ok(
        !data.includes('Private Owner') &&
          !data.includes('owner@audit.test') &&
          !data.includes(users.superadmin.id) &&
          !data.includes('superadmin') &&
          !data.includes('"password"'),
      );
    }
    assert.equal((await request('/api/routes', cookie)).status, role === 'guest' ? 401 : 200);
    assert.equal(
      (await request('/api/auth/roles/audit-role', cookie, 'PUT', { permissions: [] })).status,
      role === 'superadmin' ? 200 : deny,
    );
    if (!editor) {
      assert.equal((await request('/api/bms/projects/osint', cookie, 'PATCH', {})).status, deny);
      assert.equal((await request('/api/osint/map-overlays', cookie, 'POST', {})).status, deny);
      assert.equal((await request('/api/osint/map-overlays/id', cookie, 'DELETE')).status, deny);
    }
    if (!manager)
      assert.equal((await request('/api/offline-maps/regions', cookie, 'POST', {})).status, deny);
    const catalog = await (await request('/api/offline-maps/regions', cookie)).json();
    assert.equal('job' in catalog, manager);
    assert.equal((await request('/api/health', cookie)).status, 200);
  }
  for (const actor of ['admin', 'superadmin']) {
    assert.equal(
      (
        await request(`/api/auth/users/${users.superadmin.id}`, cookies[actor], 'PATCH', {
          active: false,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/auth/users/${users.viewer.id}`, cookies[actor], 'PATCH', {
          role: 'superadmin',
        })
      ).status,
      400,
    );
  }
  const saved = await request('/api/routes', cookies.viewer, 'POST', {
    name: 'Private trip',
    start: [107, -6],
    end: [107.01, -6],
    tolerance: 50,
    user_id: users.viewer2.id,
  });
  assert.equal(saved.status, 201);
  const { id } = await saved.json();
  for (const actor of ['viewer2', 'operator', 'admin', 'superadmin']) {
    assert.deepEqual((await (await request('/api/routes', cookies[actor])).json()).routes, []);
    assert.equal((await request(`/api/routes/${id}`, cookies[actor], 'DELETE')).status, 404);
  }
  await request('/api/auth/preferences', cookies.viewer, 'PUT', {
    favorites: ['private-camera'],
    recent: [],
    user_id: users.viewer2.id,
  });
  assert.deepEqual(
    (await (await request('/api/auth/preferences', cookies.viewer2)).json()).favorites,
    [],
  );
  const adminPermissions = users.admin.permissions;
  // Even a delegated role editor cannot manufacture permissions it does not hold.
  assert.equal(
    (
      await request('/api/auth/roles/admin', cookies.superadmin, 'PUT', {
        permissions: ['users.manage', 'roles.manage'],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/api/auth/roles/admin', cookies.admin, 'PUT', {
        permissions: [...adminPermissions, 'roles.manage'],
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/auth/roles/operator', cookies.admin, 'PUT', { permissions: [] })).status,
    403,
  );
  assert.equal(
    (
      await request('/api/auth/roles/admin', cookies.superadmin, 'PUT', {
        permissions: adminPermissions,
      })
    ).status,
    200,
  );
  // Existing cookie immediately loses revoked permissions.
  assert.equal(
    (await request('/api/auth/roles/operator', cookies.superadmin, 'PUT', { permissions: [] }))
      .status,
    200,
  );
  assert.equal((await request('/api/bms/projects/osint', cookies.operator)).status, 403);
  assert.equal(
    (await request(`/api/auth/users/${users.viewer.id}`, cookies.admin, 'PATCH', { active: false }))
      .status,
    200,
  );
  assert.equal((await request('/api/routes', cookies.viewer)).status, 401);
  assert.equal((await request('/api/auth/logout', cookies.viewer2, 'POST')).status, 200);
  assert.equal((await request('/api/routes', cookies.viewer2)).status, 401);
  for (const Origin of ['https://attacker.test', 'null', 'malformed'])
    assert.equal(
      (await request('/api/auth/logout', cookies.admin, 'POST', undefined, { Origin })).status,
      403,
    );
  for (const file of [
    '/.runtime/setup-token.txt',
    '/.runtime/accounts.sqlite',
    '/.runtime/accounts.sqlite-wal',
    '/.env',
  ])
    assert.equal((await request(file)).status, 404);
});
