import express from 'express';
import { createHash } from 'node:crypto';
import { publicCameras } from './camera-catalog.mjs';
import { rateLimit } from './request-protection.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = [
  'visit',
  'heartbeat',
  'camera_open',
  'camera_play',
  'camera_error',
  'watch',
  'route',
];
export function createAnalytics(auth, cameraPredicate = async () => () => true) {
  const db = auth.db;
  const cameras = new Map(publicCameras.map((c) => [c.id, c]));
  let cleanup = 0;
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/events',
    rateLimit({ limit: 90 }),
    express.json({ limit: '2kb' }),
    async (req, res) => {
      const b = req.body;
      if (
        !b ||
        Array.isArray(b) ||
        typeof b.id !== 'string' ||
        !uuid.test(b.id) ||
        typeof b.visitor !== 'string' ||
        !uuid.test(b.visitor) ||
        typeof b.session !== 'string' ||
        !uuid.test(b.session) ||
        !kinds.includes(b.kind) ||
        Object.keys(b).some(
          (k) => !['id', 'visitor', 'session', 'kind', 'camera', 'seconds', 'referrer'].includes(k),
        )
      )
        return res.status(400).json({ error: 'Invalid analytics event.' });
      const enabled = await cameraPredicate();
      const cameraEvent = b.kind.startsWith('camera_') || b.kind === 'watch';
      if (
        (cameraEvent && (!cameras.has(b.camera) || !enabled(cameras.get(b.camera)))) ||
        (!cameraEvent && b.camera !== undefined) ||
        (b.seconds !== undefined &&
          (b.kind !== 'watch' ||
            !Number.isInteger(b.seconds) ||
            b.seconds < 1 ||
            b.seconds > 30)) ||
        (b.kind === 'watch' && b.seconds === undefined) ||
        (b.referrer !== undefined && !['direct', 'search', 'social', 'other'].includes(b.referrer))
      )
        return res.status(400).json({ error: 'Invalid analytics payload.' });
      const time = Date.now();
      if (time > cleanup) {
        await db.prepare('DELETE FROM analytics_events WHERE time<?').run(time - 90 * 86400000);
        cleanup = time + 3600000;
      }
      const session = hash(b.session),
        visitor = hash(b.visitor);
      // Bound duplicates from multiple tabs and repeated playback callbacks.
      const gap =
        b.kind === 'watch'
          ? 25000
          : b.kind === 'heartbeat'
            ? 45000
            : b.kind === 'visit'
              ? 1000
              : 5000;
      await db.transaction(async () => {
        await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
          session + ':' + b.kind + ':' + (b.camera || ''),
        ]);
        if (
          await db
            .prepare(
              'SELECT id FROM analytics_events WHERE session=? AND kind=? AND camera=? AND time>? LIMIT 1',
            )
            .get(session, b.kind, b.camera || '', time - gap)
        )
          return;
        const ua = req.get('user-agent') || '';
        const device = /tablet|ipad/i.test(ua)
          ? 'tablet'
          : /mobile|android|iphone/i.test(ua)
            ? 'mobile'
            : 'desktop';
        await db
          .prepare(
            'INSERT INTO analytics_events VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
          )
          .run(
            b.id,
            time,
            b.kind,
            visitor,
            session,
            b.camera || '',
            b.seconds || 0,
            device,
            b.referrer || 'direct',
          );
      });
      res.json({ ok: true });
    },
  );
  async function report(req, admin) {
    const days = Number(req.query.days || 7);
    if (![1, 7, 30, 90].includes(days))
      throw Object.assign(new Error('Invalid analytics period.'), { status: 400 });
    const enabled = await cameraPredicate();
    const visibleIds = [...cameras.values()].filter(enabled).map((camera) => camera.id);
    const now = Date.now();
    const since = now - days * 86400000;
    const rows = await db
      .prepare(
        `SELECT camera, COUNT(*) views, COUNT(DISTINCT visitor) viewers FROM analytics_events WHERE time>=? AND kind='camera_open' GROUP BY camera ORDER BY views DESC, camera`,
      )
      .all(since);
    const popular = rows
      .filter((r) => cameras.has(r.camera) && enabled(cameras.get(r.camera)))
      .map((r) => {
        const c = cameras.get(r.camera);
        return {
          id: c.id,
          name: c.name,
          city: c.city || '',
          provider: c.provider || '',
          views: r.views,
          ...(admin ? { viewers: r.viewers } : {}),
        };
      });
    const regions = new Map();
    for (const c of popular) if (c.city) regions.set(c.city, (regions.get(c.city) || 0) + c.views);
    const result = {
      days,
      cameras: popular.slice(0, 10),
      regions: [...regions]
        .map(([name, views]) => ({ name, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10),
      trend: admin
        ? await db
            .prepare(
              `SELECT to_char(to_timestamp(time/1000.0) AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS day, COUNT(*) views FROM analytics_events WHERE time>=? AND kind='camera_open' GROUP BY day ORDER BY day`,
            )
            .all(since)
        : [],
    };
    if (!admin) {
      const interval = 3 * 3600000;
      const offset = 7 * 3600000;
      const buckets = await db
        .prepare(
          `SELECT FLOOR((time + 25200000) / 10800000.0)::bigint bucket, COUNT(*) views
         FROM analytics_events WHERE time>=? AND time<=? AND kind='camera_open' AND camera = ANY(?::text[])
         GROUP BY bucket ORDER BY bucket`,
        )
        .all(since, now, visibleIds);
      const counts = new Map(buckets.map((row) => [Number(row.bucket), Number(row.views)]));
      const first = Math.floor((since + offset) / interval);
      const last = Math.floor((now + offset) / interval);
      result.trend = Array.from({ length: last - first + 1 }, (_, index) => {
        const bucket = first + index;
        return {
          day: new Date(bucket * interval).toISOString().slice(0, 16) + '+07:00',
          views: counts.get(bucket) || 0,
        };
      });
      return { ...result, intervalHours: 3, timezone: 'Asia/Jakarta' };
    }
    return {
      ...result,
      summary: await db
        .prepare(
          `SELECT COUNT(DISTINCT visitor) visitors, COUNT(DISTINCT session) sessions, COUNT(*) FILTER (WHERE kind='visit') pageviews, COUNT(*) FILTER (WHERE kind='camera_open') opens, COUNT(*) FILTER (WHERE kind='camera_play') plays, COUNT(*) FILTER (WHERE kind='camera_error') errors, COUNT(*) FILTER (WHERE kind='route') routes, COALESCE(SUM(seconds),0) "watchSeconds" FROM analytics_events WHERE time>=?`,
        )
        .get(since),
      active: (
        await db
          .prepare('SELECT COUNT(DISTINCT session) total FROM analytics_events WHERE time>?')
          .get(Date.now() - 300000)
      ).total,
      registrations: (
        await db
          .prepare("SELECT COUNT(*) total FROM audit WHERE action='user.register' AND time>=?")
          .get(since)
      ).total,
      visitorsTrend: await db
        .prepare(
          "SELECT to_char(to_timestamp(time/1000.0) AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS day, COUNT(DISTINCT visitor) views FROM analytics_events WHERE time>=? GROUP BY day ORDER BY day",
        )
        .all(since),
      hours: await db
        .prepare(
          "SELECT to_char(to_timestamp(time/1000.0) AT TIME ZONE 'Asia/Jakarta','HH24') name, COUNT(*) total FROM analytics_events WHERE time>=? AND kind='camera_open' GROUP BY name ORDER BY name",
        )
        .all(since),
      devices: await db
        .prepare(
          `SELECT device name, COUNT(DISTINCT session) total FROM analytics_events WHERE time>=? GROUP BY device ORDER BY total DESC`,
        )
        .all(since),
      referrals: await db
        .prepare(
          `SELECT referrer name, COUNT(DISTINCT session) total FROM analytics_events WHERE time>=? AND kind='visit' GROUP BY referrer ORDER BY total DESC`,
        )
        .all(since),
    };
  }
  let presenceCache;
  let presencePending;
  router.get('/presence', rateLimit({ limit: 90 }), async (_req, res) => {
    if (!presenceCache || presenceCache.expires < Date.now()) {
      presencePending ||= db
        .prepare('SELECT COUNT(DISTINCT visitor) total FROM analytics_events WHERE time>?')
        .get(Date.now() - 300000)
        .then((row) => {
          presenceCache = { active: Number(row.total), expires: Date.now() + 15000 };
        })
        .finally(() => {
          presencePending = null;
        });
      await presencePending;
    }
    res.json({ active: presenceCache.active, windowMinutes: 5 });
  });
  router.get('/public', async (req, res) => res.json(await report(req, false)));
  router.get(
    '/admin',
    (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
      if (!['admin', 'superadmin'].includes(req.user.role))
        return res.status(403).json({ error: 'Permission denied.' });
      next();
    },
    auth.requirePermission('analytics.view'),
    async (req, res) => res.json(await report(req, true)),
  );
  return router;
}
