import { DatabaseSync } from 'node:sqlite';
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

const scrypt = promisify(scryptCallback);
export const permissions = [
  'routes.use',
  'routes.save',
  'users.manage',
  'roles.manage',
  'objects.write',
  'settings.manage',
];
const defaults = {
  viewer: ['routes.use', 'routes.save'],
  operator: ['routes.use', 'routes.save', 'objects.write'],
  admin: ['routes.use', 'routes.save', 'objects.write', 'users.manage', 'settings.manage'],
  superadmin: permissions,
};
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
export function createAuth(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'accounts.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, permissions TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT, action TEXT NOT NULL, target TEXT, time INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS preferences (user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);`);
  for (const [id, list] of Object.entries(defaults))
    db.prepare('INSERT OR IGNORE INTO roles VALUES (?,?)').run(id, JSON.stringify(list));
  const setupFile = path.join(directory, 'setup-token.txt');
  if (!existsSync(setupFile))
    writeFileSync(setupFile, randomBytes(24).toString('hex'), { mode: 0o600 });
  const setupToken = readFileSync(setupFile, 'utf8').trim();
  const audit = (actor, action, target) =>
    db
      .prepare('INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)')
      .run(actor || null, action, target || null, Date.now());
  function publicUser(row) {
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
                  db.prepare('SELECT permissions FROM roles WHERE id=?').get(row.role).permissions,
                ),
        }
      : null;
  }
  const middleware = (req, res, next) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('jejak_session='))
      ?.slice(14);
    req.user = token
      ? publicUser(
          db
            .prepare(
              'SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',
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
  router.use(express.json({ limit: '32kb' }));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const attempts = new Map();
  router.use(['/login', '/setup', '/register'], (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    const entry = attempts.get(req.ip) || { count: 0, until: now + 900000 };
    attempts.set(req.ip, entry);
    if (++entry.count > 15)
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    next();
  });
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  router.get('/session', (req, res) => res.json({ user: req.user, setupRequired: count() === 0 }));
  function startSession(req, res, user) {
    const remember = req.path === '/login' && req.body?.remember === true;
    const lifetime = remember ? 30 * 86400000 : 43200000;
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      digest(token),
      user.id,
      Date.now() + lifetime,
    );
    res.cookie('jejak_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      ...(remember ? { maxAge: lifetime } : {}),
      path: '/',
    });
    audit(user.id, 'login', user.id);
    res.json({ user: publicUser(user) });
  }
  async function createUser(body, role) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name)
      throw fail('Enter a valid name and email.');
    if (!db.prepare('SELECT id FROM roles WHERE id=?').get(role)) throw fail('Invalid role.');
    const password = await hash(body.password);
    const user = { id: randomUUID(), email, name, password, role, active: 1 };
    try {
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?,1)').run(user.id, email, name, password, role);
    } catch (e) {
      if (e.message.includes('UNIQUE')) throw fail('Email already exists.', 409);
      throw e;
    }
    return user;
  }
  let settingUp = false;
  router.post('/setup', async (req, res) => {
    if (count() || settingUp) throw fail('Setup is already complete.', 409);
    if (typeof req.body.token !== 'string' || digest(req.body.token) !== digest(setupToken))
      throw fail('Invalid setup token.', 403);
    settingUp = true;
    try {
      const user = await createUser(req.body, 'superadmin');
      audit(user.id, 'setup', user.id);
      startSession(req, res, user);
    } finally {
      settingUp = false;
    }
  });
  router.post('/register', async (req, res) => {
    if (!count()) throw fail('Administrator setup must be completed first.', 409);
    if (req.user) throw fail('Sign out before creating another account.', 409);
    const user = await createUser(req.body, 'viewer');
    audit(user.id, 'user.register', user.id);
    startSession(req, res, user);
  });
  router.post('/login', async (req, res) => {
    if (
      typeof req.body.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim()) ||
      req.body.email.length > 254
    )
      throw fail('Enter a valid name and email.');
    if (
      typeof req.body.password !== 'string' ||
      !req.body.password ||
      req.body.password.length > 128
    )
      throw fail('Invalid email or password.', 401);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(
      String(req.body.email || '')
        .trim()
        .toLowerCase(),
    );
    const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await verify(req.body.password, user?.password || fallback);
    if (!valid || !user?.active) throw fail('Invalid email or password.', 401);
    startSession(req, res, user);
  });
  router.post('/logout', (req, res) => {
    if (req.sessionToken)
      db.prepare('DELETE FROM sessions WHERE token=?').run(digest(req.sessionToken));
    res.clearCookie('jejak_session', { path: '/' });
    res.json({ ok: true });
  });
  router.get('/preferences', (req, res) => {
    if (!req.user) throw fail('Please sign in.', 401);
    const row = db.prepare('SELECT data FROM preferences WHERE user_id=?').get(req.user.id);
    res.json(row ? JSON.parse(row.data) : { favorites: [], recent: [] });
  });
  router.put('/preferences', (req, res) => {
    if (!req.user) throw fail('Please sign in.', 401);
    const { favorites, recent } = req.body;
    if (
      !Array.isArray(favorites) ||
      favorites.length > 1000 ||
      !Array.isArray(recent) ||
      recent.length > 30 ||
      [...favorites, ...recent].some((id) => typeof id !== 'string' || id.length > 200)
    )
      throw fail('Invalid camera preferences.');
    db.prepare(
      'INSERT INTO preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
    ).run(
      req.user.id,
      JSON.stringify({ favorites: [...new Set(favorites)], recent: [...new Set(recent)] }),
    );
    res.json({ ok: true });
  });
  router.post('/password', async (req, res) => {
    if (!req.user) throw fail('Please sign in.', 401);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!(await verify(req.body.currentPassword, user.password)))
      throw fail('Current password is incorrect.', 403);
    const password = await hash(req.body.password);
    db.prepare('UPDATE users SET password=? WHERE id=?').run(password, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    audit(user.id, 'password.change', user.id);
    startSession(req, res, { ...user, password });
  });
  router.use(['/users', '/roles'], (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (!['admin', 'superadmin'].includes(req.user.role))
      return res.status(403).json({ error: 'CMS is restricted to Admin and Super Admin.' });
    next();
  });
  router.get('/roles', requirePermission('users.manage'), (_req, res) =>
    res.json({
      roles: db
        .prepare("SELECT * FROM roles WHERE id != 'superadmin'")
        .all()
        .map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })),
      permissions,
    }),
  );
  router.put('/roles/:id', requirePermission('roles.manage'), (req, res) => {
    if (req.params.id === 'superadmin' || !/^[a-z][a-z0-9_-]{1,30}$/.test(req.params.id))
      throw fail('Invalid role name.');
    const list = req.body.permissions;
    if (!Array.isArray(list) || list.some((p) => !permissions.includes(p)))
      throw fail('Invalid permissions.');
    const existing = db.prepare('SELECT permissions FROM roles WHERE id=?').get(req.params.id);
    if (
      req.user.role !== 'superadmin' &&
      [...list, ...JSON.parse(existing?.permissions || '[]')].some(
        (p) => !req.user.permissions.includes(p),
      )
    )
      throw fail('Cannot modify elevated permissions.', 403);
    db.prepare(
      'INSERT INTO roles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET permissions=excluded.permissions',
    ).run(req.params.id, JSON.stringify([...new Set(list)]));
    audit(req.user.id, 'role.update', req.params.id);
    res.json({ ok: true });
  });
  router.get('/users', requirePermission('users.manage'), (_req, res) =>
    res.json({
      users: db
        .prepare("SELECT * FROM users WHERE role != 'superadmin' ORDER BY name")
        .all()
        .map(publicUser),
    }),
  );
  router.post('/users', requirePermission('users.manage'), async (req, res) => {
    const role = req.body.role || 'viewer';
    if (role === 'superadmin') throw fail('Invalid role.');
    const target = db.prepare('SELECT permissions FROM roles WHERE id=?').get(role);
    if (
      req.user.role !== 'superadmin' &&
      (role === 'superadmin' ||
        !target ||
        JSON.parse(target.permissions).some((p) => !req.user.permissions.includes(p)))
    )
      throw fail('Cannot assign elevated role.', 403);
    const user = await createUser(req.body, role);
    audit(req.user.id, 'user.create', user.id);
    res.status(201).json({ user: publicUser(user) });
  });
  router.patch('/users/:id', requirePermission('users.manage'), async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user || user.role === 'superadmin') throw fail('User not found.', 404);
    if (user.id === req.user.id) throw fail('This account cannot be changed here.', 403);
    const role = req.body.role || user.role;
    if (role === 'superadmin') throw fail('Invalid role.');
    const target = db.prepare('SELECT permissions FROM roles WHERE id=?').get(role);
    if (!target) throw fail('Invalid role.');
    if (
      req.user.role !== 'superadmin' &&
      (role === 'superadmin' ||
        [...JSON.parse(target.permissions), ...publicUser(user).permissions].some(
          (p) => !req.user.permissions.includes(p),
        ))
    )
      throw fail('Cannot modify elevated role.', 403);
    const password = req.body.password ? await hash(req.body.password) : user.password;
    db.prepare('UPDATE users SET role=?,active=?,password=? WHERE id=?').run(
      role,
      req.body.active === undefined ? user.active : Number(Boolean(req.body.active)),
      password,
      user.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    audit(req.user.id, 'user.update', user.id);
    res.json({ ok: true });
  });
  return { db, middleware, router, requirePermission, audit, close: () => db.close() };
}
