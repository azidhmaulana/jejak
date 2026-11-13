import { createDatabase } from '../database/index.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { jsonObjectBody, validText, optionalBoolean, optionalRole } from '../validation.mjs';
import { rateLimit, concurrencyLimit } from '../request-protection.mjs';

const scrypt = promisify(scryptCallback);
export const permissions = [
  'routes.use',
  'routes.save',
  'users.manage',
  'roles.manage',
  'objects.write',
  'settings.manage',
  'analytics.view',
];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = (value) => createHash('sha256').update(value).digest('hex');
async function hash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    throw fail('Password must contain 12–128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verify(password, value) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, key] = value.split(':');
  return timingSafeEqual(await scrypt(password, salt, 64), Buffer.from(key, 'hex'));
}
export async function createAuth(directory) {
  mkdirSync(directory, { recursive: true });
  const db = await createDatabase(directory);
  const setupFile = path.join(directory, 'setup-token.txt');
  if (!existsSync(setupFile))
    writeFileSync(setupFile, randomBytes(24).toString('hex'), { mode: 0o600 });
  const setupToken = readFileSync(setupFile, 'utf8').trim();
  const audit = async (actor, action, target) =>
    await db
      .prepare('INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)')
      .run(actor || null, action, target || null, Date.now());
  async function publicUser(row) {
    return row
      ? {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          active: Boolean(row.active),
          permissions:
            row.role === 'superadmin'
              ? permissions
              : JSON.parse(
                  row.permissions ||
                    (await db.prepare('SELECT permissions FROM roles WHERE id=?').get(row.role))
                      .permissions,
                ),
        }
      : null;
  }
  const middleware = async (req, res, next) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('jejak_session='))
      ?.slice(14);
    req.user = token
      ? await publicUser(
          await db
            .prepare(
              'SELECT u.*, r.permissions FROM users u JOIN roles r ON r.id=u.role JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',
            )
            .get(digest(token), Date.now()),
        )
      : null;
    req.sessionToken = token;
    next();
  };
  const requirePermission = (permission) => (req, res, next) =>
    req.user?.permissions.includes(permission)
      ? next()
      : res
          .status(req.user ? 403 : 401)
          .json({ error: req.user ? 'Permission denied.' : 'Please sign in.' });
  const router = express.Router();
  const mutationLimit = concurrencyLimit(4);
  router.use((req, res, next) =>
    ['GET', 'HEAD'].includes(req.method) ? next() : mutationLimit(req, res, next),
  );
  router.use(express.json({ limit: '32kb' }));
  router.use((req, res, next) =>
    req.path === '/logout' ? next() : jsonObjectBody(req, res, next),
  );
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(['/login', '/setup', '/register'], rateLimit({ limit: 15, windowMs: 900000 }));
  const count = async () => (await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
  router.get('/session', async (req, res) =>
    res.json({ user: req.user, setupRequired: (await count()) === 0 }),
  );
  async function startSession(req, res, user) {
    const remember = req.path === '/login' && req.body?.remember === true;
    const lifetime = remember ? 30 * 86400000 : 43200000;
    const token = randomBytes(32).toString('hex');
    const account = await db.transaction(async () => {
      const current = await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(user.id);
      if (!current?.active || current.password !== user.password)
        throw fail('Please sign in again.', 401);
      await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
      await db
        .prepare('INSERT INTO sessions VALUES(?,?,?)')
        .run(digest(token), user.id, Date.now() + lifetime);
      await audit(user.id, 'login', user.id);
      return publicUser(current);
    });
    res.cookie('jejak_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      ...(remember ? { maxAge: lifetime } : {}),
      path: '/',
    });
    res.json({ user: account });
  }
  async function createUser(body, role) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validText(email, 254) ||
      !validText(body.name, 80)
    )
      throw fail('Enter a valid name and email.');
    if (!(await db.prepare('SELECT id FROM roles WHERE id=?').get(role)))
      throw fail('Invalid role.');
    const password = await hash(body.password);
    const user = { id: randomUUID(), email, name, password, role, active: 1 };
    try {
      await db
        .prepare('INSERT INTO users VALUES(?,?,?,?,?,1)')
        .run(user.id, email, name, password, role);
    } catch (e) {
      if (e.code === '23505') throw fail('Email already exists.', 409);
      throw e;
    }
    return user;
  }
  router.post('/setup', async (req, res) => {
    if (typeof req.body.token !== 'string' || digest(req.body.token) !== digest(setupToken))
      throw fail('Invalid setup token.', 403);
    const user = await db.transaction(async () => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':setup'))");
      if (await count()) throw fail('Setup is already complete.', 409);
      const created = await createUser(req.body, 'superadmin');
      await audit(created.id, 'setup', created.id);
      return created;
    });
    await startSession(req, res, user);
  });
  router.post('/register', async (req, res) => {
    if (!(await count())) throw fail('Administrator setup must be completed first.', 409);
    if (req.user) throw fail('Sign out before creating another account.', 409);
    const user = await db.transaction(async () => {
      const created = await createUser(req.body, 'viewer');
      await audit(created.id, 'user.register', created.id);
      return created;
    });
    await startSession(req, res, user);
  });
  router.post('/login', async (req, res) => {
    optionalBoolean(req.body, 'remember');
    if (
      typeof req.body.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim()) ||
      !validText(req.body.email, 254)
    )
      throw fail('Enter a valid name and email.');
    if (
      typeof req.body.password !== 'string' ||
      !req.body.password ||
      req.body.password.length > 128
    )
      throw fail('Invalid email or password.', 401);
    const user = await db.prepare('SELECT * FROM users WHERE email=?').get(
      String(req.body.email || '')
        .trim()
        .toLowerCase(),
    );
    const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await verify(req.body.password, user?.password || fallback);
    if (!valid || !user?.active) throw fail('Invalid email or password.', 401);
    await startSession(req, res, user);
  });
  router.post('/logout', async (req, res) => {
    if (req.sessionToken)
      await db.prepare('DELETE FROM sessions WHERE token=?').run(digest(req.sessionToken));
    res.clearCookie('jejak_session', { path: '/' });
    res.json({ ok: true });
  });
  router.get('/preferences', async (req, res) => {
    if (!req.user) throw fail('Please sign in.', 401);
    const row = await db.prepare('SELECT data FROM preferences WHERE user_id=?').get(req.user.id);
    res.json(row ? JSON.parse(row.data) : { favorites: [], recent: [] });
  });
  router.put('/preferences', async (req, res) => {
    if (!req.user) throw fail('Please sign in.', 401);
    const { favorites, recent } = req.body;
    if (
      !Array.isArray(favorites) ||
      favorites.length > 1000 ||
      !Array.isArray(recent) ||
      recent.length > 30 ||
      [...favorites, ...recent].some((id) => !validText(id, 200) || id !== id.trim())
    )
      throw fail('Invalid camera preferences.');
    await db
      .prepare(
        'INSERT INTO preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
      )
      .run(
        req.user.id,
        JSON.stringify({ favorites: [...new Set(favorites)], recent: [...new Set(recent)] }),
      );
    res.json({ ok: true });
  });
  router.post('/password', async (req, res) => {
    if (!req.user) throw fail('Please sign in.', 401);
    const password = await hash(req.body.password);
    const user = await db.transaction(async () => {
      const current = await db
        .prepare('SELECT * FROM users WHERE id=? FOR UPDATE')
        .get(req.user.id);
      if (!(await verify(req.body.currentPassword, current.password)))
        throw fail('Current password is incorrect.', 403);
      await db.prepare('UPDATE users SET password=? WHERE id=?').run(password, current.id);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(current.id);
      await audit(current.id, 'password.change', current.id);
      return current;
    });
    await startSession(req, res, { ...user, password });
  });
  router.use(['/users', '/roles'], (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (!['admin', 'superadmin'].includes(req.user.role))
      return res.status(403).json({ error: 'CMS is restricted to Admin and Super Admin.' });
    next();
  });
  router.get('/roles', requirePermission('users.manage'), async (_req, res) =>
    res.json({
      roles: (await db.prepare("SELECT * FROM roles WHERE id != 'superadmin'").all()).map((r) => ({
        ...r,
        permissions: JSON.parse(r.permissions),
      })),
      permissions,
    }),
  );
  router.put('/roles/:id', requirePermission('roles.manage'), async (req, res) => {
    if (req.params.id === 'superadmin' || !/^[a-z][a-z0-9_-]{1,30}$/.test(req.params.id))
      throw fail('Invalid role name.');
    const list = req.body.permissions;
    if (
      !Array.isArray(list) ||
      list.length > permissions.length ||
      list.some((p) => !permissions.includes(p))
    )
      throw fail('Invalid permissions.');
    await db.transaction(async () => {
      const existing = await db
        .prepare('SELECT permissions FROM roles WHERE id=?')
        .get(req.params.id);
      if (
        req.user.role !== 'superadmin' &&
        [...list, ...JSON.parse(existing?.permissions || '[]')].some(
          (p) => !req.user.permissions.includes(p),
        )
      )
        throw fail('Cannot modify elevated permissions.', 403);
      await db
        .prepare(
          'INSERT INTO roles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET permissions=excluded.permissions',
        )
        .run(req.params.id, JSON.stringify([...new Set(list)]));
      await audit(req.user.id, 'role.update', req.params.id);
    });
    res.json({ ok: true });
  });
  router.get('/users', requirePermission('users.manage'), async (_req, res) =>
    res.json({
      users: await Promise.all(
        (
          await db
            .prepare(
              "SELECT u.*,r.permissions FROM users u JOIN roles r ON r.id=u.role WHERE u.role != 'superadmin' ORDER BY u.name",
            )
            .all()
        ).map(publicUser),
      ),
    }),
  );
  router.post('/users', requirePermission('users.manage'), async (req, res) => {
    optionalRole(req.body);
    const role = req.body.role || 'viewer';
    if (role === 'superadmin') throw fail('Invalid role.');
    const target = await db.prepare('SELECT permissions FROM roles WHERE id=?').get(role);
    if (
      req.user.role !== 'superadmin' &&
      (role === 'superadmin' ||
        !target ||
        JSON.parse(target.permissions).some((p) => !req.user.permissions.includes(p)))
    )
      throw fail('Cannot assign elevated role.', 403);
    const user = await db.transaction(async () => {
      const created = await createUser(req.body, role);
      await audit(req.user.id, 'user.create', created.id);
      return created;
    });
    res.status(201).json({ user: await publicUser(user) });
  });
  router.patch('/users/:id', requirePermission('users.manage'), async (req, res) => {
    optionalRole(req.body);
    optionalBoolean(req.body, 'active');
    if (req.body.password !== undefined && typeof req.body.password !== 'string')
      throw fail('Invalid password.');
    await db.transaction(async () => {
      const user = await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(req.params.id);
      if (!user || user.role === 'superadmin') throw fail('User not found.', 404);
      if (user.id === req.user.id) throw fail('This account cannot be changed here.', 403);
      const role = req.body.role || user.role;
      if (role === 'superadmin') throw fail('Invalid role.');
      const target = await db.prepare('SELECT permissions FROM roles WHERE id=?').get(role);
      if (!target) throw fail('Invalid role.');
      if (
        req.user.role !== 'superadmin' &&
        (role === 'superadmin' ||
          [...JSON.parse(target.permissions), ...(await publicUser(user)).permissions].some(
            (p) => !req.user.permissions.includes(p),
          ))
      )
        throw fail('Cannot modify elevated role.', 403);
      const password = req.body.password ? await hash(req.body.password) : user.password;
      await db
        .prepare('UPDATE users SET role=?,active=?,password=? WHERE id=?')
        .run(
          role,
          req.body.active === undefined ? user.active : Number(Boolean(req.body.active)),
          password,
          user.id,
        );
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      await audit(req.user.id, 'user.update', user.id);
    });
    res.json({ ok: true });
  });
  return { db, middleware, router, requirePermission, audit, close: () => db.close() };
}
