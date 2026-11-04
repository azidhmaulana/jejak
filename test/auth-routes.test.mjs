import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createAuth } from '../server/auth/service.mjs';
import { createRouteRouter, camerasAlongRoute, validatePoints } from '../server/routes/service.mjs';

test('route matching uses segment distance and sorts cameras along travel direction', () => {
  const cameras = [
    { id: 'late', longitude: 107.009, latitude: -6 },
    { id: 'early', longitude: 107.001, latitude: -6.0001 },
    { id: 'far', longitude: 107.005, latitude: -6.01 },
  ];
  const hits = camerasAlongRoute(
    [
      [107, -6],
      [107.01, -6],
    ],
    cameras,
    50,
  );
  assert.deepEqual(
    hits.map((c) => c.id),
    ['early', 'late'],
  );
  assert.ok(hits[0].distanceFromRoute < 25);
  assert.deepEqual(
    camerasAlongRoute(
      [
        [107.01, -6],
        [107, -6],
      ],
      cameras,
      50,
    ).map((c) => c.id),
    ['late', 'early'],
  );
  assert.throws(() => validatePoints({ start: [NaN, 0], end: [1, 2] }));
  assert.throws(() => validatePoints({ start: [1, 2], end: [1, 2] }));
  assert.throws(() => validatePoints({ start: [1, 2], end: [2, 3], tolerance: 10000 }));
});

test('account sessions, role permissions, route ownership and revocation are enforced', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jejak-auth-'));
  const auth = createAuth(directory),
    app = express();
  app.use(auth.middleware);
  app.use('/auth', auth.router);
  app.use(
    '/routes',
    createRouteRouter(auth, {
      cameras: [{ id: 'c', name: 'Camera', longitude: 107.005, latitude: -6 }],
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [107, -6],
                  [107.01, -6],
                ],
              },
              distance: 1000,
              duration: 120,
            },
          ],
        }),
      }),
    }),
  );
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    auth.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, method = 'GET', body, cookie) =>
    fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const token = await readFile(path.join(directory, 'setup-token.txt'), 'utf8');
  assert.equal(
    (await request('/routes/calculate', 'POST', { start: [107, -6], end: [107.01, -6] })).status,
    401,
  );
  assert.equal((await request('/auth/setup', 'POST', { token: 'wrong' })).status, 403);
  const setup = await request('/auth/setup', 'POST', {
    token,
    name: 'Owner',
    email: 'owner@example.test',
    password: 'owner-password-123',
  });
  assert.equal(setup.status, 200);
  const admin = setup.headers.get('set-cookie').split(';')[0];
  const roleList = await (await request('/auth/roles', 'GET', undefined, admin)).json();
  assert.ok(roleList.roles.every((role) => role.id !== 'superadmin'));
  const userList = await (await request('/auth/users', 'GET', undefined, admin)).json();
  assert.equal(userList.users.length, 0);
  assert.equal(
    (
      await request(
        '/auth/users',
        'POST',
        {
          name: 'Hidden',
          email: 'hidden@example.test',
          password: 'hidden-password-123',
          role: 'superadmin',
        },
        admin,
      )
    ).status,
    400,
  );

  assert.match(setup.headers.get('set-cookie'), /HttpOnly/);
  assert.match(setup.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await request('/auth/setup', 'POST', { token })).status, 409);
  const registration = await request('/auth/register', 'POST', {
    name: 'Registered Viewer',
    email: 'registered@example.test',
    password: 'registration-password-123',
    role: 'superadmin',
    permissions: ['users.manage'],
  });
  assert.equal(registration.status, 200);
  const registered = (await registration.json()).user;
  assert.equal(registered.role, 'viewer');
  assert.ok(!registered.permissions.includes('users.manage'));
  assert.equal(
    (
      await request('/auth/register', 'POST', {
        name: 'Duplicate',
        email: 'registered@example.test',
        password: 'registration-password-123',
      })
    ).status,
    409,
  );
  assert.ok(
    (await (await request('/auth/users', 'GET', undefined, admin)).json()).users.some(
      (user) => user.id === registered.id,
    ),
  );
  assert.equal(
    (await request(`/auth/users/${registered.id}`, 'PATCH', { role: 'operator' }, admin)).status,
    200,
  );
  assert.equal(
    (await request(`/auth/users/${registered.id}`, 'PATCH', { role: 'superadmin' }, admin)).status,
    400,
  );
  await request(
    '/auth/users',
    'POST',
    {
      name: 'Manager',
      email: 'manager@example.test',
      password: 'manager-password-123',
      role: 'admin',
    },
    admin,
  );
  const managerLogin = await request('/auth/login', 'POST', {
    email: 'manager@example.test',
    password: 'manager-password-123',
    remember: true,
  });
  const managerCookie = managerLogin.headers.get('set-cookie').split(';')[0];
  assert.match(managerLogin.headers.get('set-cookie'), /Max-Age=2592000/);
  assert.equal(
    (await request(`/auth/users/${registered.id}`, 'PATCH', { role: 'viewer' }, managerCookie))
      .status,
    200,
  );
  assert.equal(
    (await request(`/auth/users/${registered.id}`, 'PATCH', { role: 'superadmin' }, managerCookie))
      .status,
    400,
  );
  const created = await request(
    '/auth/users',
    'POST',
    {
      name: 'Viewer',
      email: 'viewer@example.test',
      password: 'viewer-password-123',
      role: 'viewer',
    },
    admin,
  );
  assert.equal(created.status, 201);
  const viewer = (await created.json()).user;
  assert.ok(!('password' in viewer));
  const login = await request('/auth/login', 'POST', {
    email: viewer.email,
    password: 'viewer-password-123',
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.ok(!login.headers.get('set-cookie').includes('Max-Age'));
  assert.equal(
    (await request('/auth/preferences', 'PUT', { favorites: ['c'], recent: ['c'] }, cookie)).status,
    200,
  );
  assert.deepEqual(
    (await (await request('/auth/preferences', 'GET', undefined, cookie)).json()).favorites,
    ['c'],
  );
  assert.deepEqual(
    (await (await request('/auth/preferences', 'GET', undefined, admin)).json()).favorites,
    [],
  );
  assert.equal((await request('/auth/users', 'GET', undefined, cookie)).status, 403);
  assert.equal(
    (await request('/auth/roles/viewer', 'PUT', { permissions: ['users.manage'] }, cookie)).status,
    403,
  );
  const route = await request(
    '/routes/calculate',
    'POST',
    { start: [107, -6], end: [107.01, -6], tolerance: 25 },
    cookie,
  );
  assert.equal(route.status, 200);
  assert.equal((await route.json()).cameras[0].id, 'c');
  const save = await request(
    '/routes',
    'POST',
    { name: 'Trip', start: [107, -6], end: [107.01, -6], tolerance: 50 },
    cookie,
  );
  assert.equal(save.status, 201);
  const { id } = await save.json();
  assert.equal((await (await request('/routes', 'GET', undefined, admin)).json()).routes.length, 0);
  assert.equal((await request(`/routes/${id}`, 'DELETE', undefined, admin)).status, 404);
  assert.equal(
    (await (await request('/routes', 'GET', undefined, cookie)).json()).routes.length,
    1,
  );
  await request('/auth/roles/viewer', 'PUT', { permissions: ['users.manage'] }, admin);
  assert.equal((await request('/auth/users', 'GET', undefined, cookie)).status, 403);
  await request('/auth/roles/viewer', 'PUT', { permissions: [] }, admin);
  assert.equal((await request('/routes', 'GET', undefined, cookie)).status, 403);
  await request('/auth/roles/viewer', 'PUT', { permissions: ['routes.use', 'routes.save'] }, admin);
  assert.equal((await request('/routes', 'GET', undefined, cookie)).status, 200);
  await request(`/auth/users/${viewer.id}`, 'PATCH', { active: false }, admin);
  assert.equal((await request('/routes', 'GET', undefined, cookie)).status, 401);
  assert.equal(
    (await request('/auth/login', 'POST', { email: viewer.email, password: 'viewer-password-123' }))
      .status,
    401,
  );
  await request('/auth/logout', 'POST', undefined, admin);
  assert.equal((await request('/auth/users', 'GET', undefined, admin)).status, 401);
});

test('motorcycle routing uses its own profile and persists vehicle choice', async (t) => {
  let requested;
  let saved;
  const auth = {
    requirePermission: () => (req, _res, next) => {
      req.user = { id: 'viewer' };
      next();
    },
    audit() {},
    db: {
      prepare: (sql) =>
        sql.startsWith('SELECT COUNT')
          ? { get: () => ({ n: 0 }) }
          : {
              run: (_id, _user, _name, data) => {
                saved = JSON.parse(data);
              },
            },
    },
  };
  const app = express();
  app.use(
    createRouteRouter(auth, {
      cameras: [],
      fetcher: async (url) => {
        requested = new URL(url);
        return {
          ok: true,
          json: async () => ({
            code: 'Ok',
            routes: [
              {
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [107, -6],
                    [107.01, -6],
                  ],
                },
                distance: 1000,
                duration: 120,
              },
            ],
          }),
        };
      },
    }),
  );
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const send = (path, data) =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const points = { start: [107, -6], end: [107.01, -6] };
  assert.equal((await send('/calculate', { ...points, mode: 'plane' })).status, 400);
  const response = await send('/calculate', { ...points, mode: 'motorcycle' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, 'motorcycle');
  const request = JSON.parse(requested.searchParams.get('json'));
  assert.equal(request.costing, 'motorcycle');
  assert.equal(request.costing_options.motorcycle.exclude_tolls, true);
  assert.equal(request.shape_format, 'geojson');
  assert.equal((await send('/', { ...result, name: 'Motor route' })).status, 201);
  assert.equal(saved.mode, 'motorcycle');
  assert.equal(validatePoints(points).mode, 'car');
});
