import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { validatePoints } from '../server/routes/service.mjs';

test('invalid account inputs return client errors and never change persisted state', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jejak-validation-'));
  const app = await createApp({ directory });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  let cookie = '';
  const request = (url, body, method = 'POST') =>
    fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  try {
    // Client-supplied keys/roles/cookies never replace a real server session.
    for (const endpoint of ['/users', '/roles']) {
      const forged = await fetch(base + endpoint, {
        headers: {
          Authorization: 'Bearer fake-admin-token',
          'X-API-Key': 'fake-api-key',
          'X-Role': 'superadmin',
          Cookie: 'jejak_session=fake-session',
        },
      });
      assert.equal(forged.status, 401);
      assert.doesNotMatch(await forged.text(), /password|permissions|owner@example/);
    }
    const token = (await readFile(path.join(directory, 'setup-token.txt'), 'utf8')).trim();
    const setup = await request('/setup', {
      token,
      name: 'Owner',
      email: 'owner@example.test',
      password: 'Strong-test-password-123',
    });
    assert.equal(setup.status, 200);
    cookie = setup.headers.get('set-cookie').split(';')[0];
    const publicRegistration = await fetch(base + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Public Viewer',
        email: 'public@example.test',
        password: 'Strong-test-password-123',
        role: 'superadmin',
        permissions: ['users.manage', 'roles.manage'],
        active: true,
      }),
    });
    assert.equal(publicRegistration.status, 200);
    const publicAccount = (await publicRegistration.json()).user;
    assert.equal(publicAccount.role, 'viewer');
    assert.ok(!publicAccount.permissions.includes('users.manage'));
    for (const body of [[], null]) assert.equal((await request('/register', body)).status, 400);
    assert.equal(
      (await fetch(base + '/register', { method: 'POST', body: 'email=test' })).status,
      415,
    );
    const account = {
      name: 'Viewer',
      email: 'viewer@example.test',
      password: 'Strong-test-password-123',
    };
    for (const bad of [
      { name: 'x'.repeat(81) },
      { name: 'Name\u0000Hidden' },
      { email: 'bad@email' },
      { password: 'short' },
    ])
      assert.equal((await request('/users', { ...account, ...bad })).status, 400);
    assert.equal((await request('/login', { ...account, remember: 'false' })).status, 400);
    const created = await request('/users', account);
    assert.equal(created.status, 201);
    const { user } = await created.json();
    for (const body of [
      { active: 'false' },
      { active: 0 },
      { role: [] },
      { role: {} },
      { password: 123 },
    ])
      assert.equal((await request(`/users/${user.id}`, body, 'PATCH')).status, 400);
    const list = await (await fetch(base + '/users', { headers: { Cookie: cookie } })).json();
    assert.equal(list.users.find((u) => u.id === user.id).active, true);
    assert.equal(list.users.find((u) => u.id === user.id).role, 'viewer');
    assert.equal((await request(`/users/${user.id}`, { active: false }, 'PATCH')).status, 200);
    assert.equal(
      (await request('/preferences', { favorites: [''], recent: [] }, 'PUT')).status,
      400,
    );
    assert.equal(
      (await request('/roles/custom', { permissions: Array(100).fill('routes.use') }, 'PUT'))
        .status,
      400,
    );
    const malformed = await fetch(base + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"password":"sensitive"',
    });
    assert.equal(malformed.status, 400);
    assert.doesNotMatch(await malformed.text(), /sensitive/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('route validation rejects missing bodies and wrong coordinate types as 400', () => {
  for (const body of [undefined, null, [], 'route', { start: ['107', -6], end: [108, -7] }])
    assert.throws(
      () => validatePoints(body),
      (error) => error.status === 400,
    );
});
