import { Router, json } from 'express';
import { createClient } from 'redis';
import { createHotspotSettings, providers, fail } from './settings.mjs';
import { download, fetchFirms, fetchSipongi, mergeDetections, validDay } from './providers.mjs';
import { rateLimit } from '../request-protection.mjs';

export function createHotspots(
  auth,
  directory,
  { read = download, redisUrl = process.env.JEJAK_REDIS_URL } = {},
) {
  const settings = createHotspotSettings(auth.db, directory),
    router = Router(),
    admin = Router();
  const redis = redisUrl
    ? createClient({
        url: redisUrl,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: (n) => Math.min(n * 1000 + 1000, 10000),
        },
      })
    : null;
  redis?.on('error', () => {});
  void redis?.connect().catch(() => {});
  const pending = new Map(),
    memory = new Map();
  let image = null,
    imagePending = null,
    imageRetryAt = 0,
    memoryBytes = 0;
  const getCache = async (key) => {
    if (redis?.isReady) {
      try {
        const s = await redis.get(key);
        if (s) return JSON.parse(s);
      } catch {}
    }
    const text = memory.get(key);
    return text ? JSON.parse(text) : null;
  };
  const setCache = async (key, value) => {
    const text = JSON.stringify(value),
      bytes = Buffer.byteLength(text);
    if (memory.has(key)) {
      memoryBytes -= Buffer.byteLength(memory.get(key));
      memory.delete(key);
    }
    while (memory.size && (memory.size >= 128 || memoryBytes + bytes > 32 * 1024 * 1024)) {
      const oldest = memory.keys().next().value;
      memoryBytes -= Buffer.byteLength(memory.get(oldest));
      memory.delete(oldest);
    }
    if (bytes <= 32 * 1024 * 1024) {
      memory.set(key, text);
      memoryBytes += bytes;
    }
    if (redis?.isReady) await redis.set(key, text, { EX: 7 * 86400 }).catch(() => {});
  };
  async function sourceDay(id, day) {
    const row = await settings.read(id);
    if (!row.active) return { items: [], status: 'disabled' };
    if (row.keyRequired && !row.secret) return { items: [], status: 'needs-key' };
    const cacheKey = `jejak:hotspots:v1:${id}:${row.version}:${day}`;
    const cached = await getCache(cacheKey),
      ttl = Date.now() - Date.parse(day) < 3 * 86400000 ? 300000 : 86400000;
    if (
      cached &&
      Date.now() - (cached.checkedAt || cached.fetchedAt) <
        (['unavailable', 'stale'].includes(cached.status) ? 60000 : ttl)
    )
      return cached;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    if (pending.size >= 3) throw fail('Hotspot sources are busy. Please retry.', 429);
    const work = (async () => {
      try {
        const result =
          id === 'firms'
            ? await fetchFirms(day, settings.reveal(row), read)
            : { items: await fetchSipongi(day, read), unavailable: [] };
        const start = Date.parse(day),
          end = start + 86400000;
        const value = {
          items: mergeDetections(
            result.items.filter((item) => item.time >= start && item.time < end),
          ),
          status: result.unavailable.length ? 'partial-coverage' : 'ok',
          unavailable: result.unavailable,
          fetchedAt: Date.now(),
        };
        await setCache(cacheKey, value);
        return value;
      } catch {
        if (cached?.status !== 'unavailable' && cached) {
          const stale = { ...cached, status: 'stale', checkedAt: Date.now() };
          await setCache(cacheKey, stale);
          return stale;
        }
        const failure = { items: [], status: 'unavailable', fetchedAt: Date.now() };
        await setCache(cacheKey, failure);
        return failure;
      }
    })().finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, work);
    return work;
  }
  const imageData = async () => {
    if (!(await settings.read('bmkg')).active) throw fail('BMKG source disabled.', 404);
    if (image && Date.now() - image.fetchedAt < 300000) return image;
    if (Date.now() < imageRetryAt) throw fail('BMKG image unavailable.', 502);
    if (!imagePending)
      imagePending = (async () => {
        const body = await read(providers.find((p) => p.id === 'bmkg').endpoint, 'buffer');
        if (
          !Buffer.isBuffer(body) ||
          !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          throw fail('BMKG image unavailable.', 502);
        image = { body, fetchedAt: Date.now() };
        return image;
      })()
        .catch(() => {
          imageRetryAt = Date.now() + 60000;
          throw fail('BMKG image unavailable.', 502);
        })
        .finally(() => {
          imagePending = null;
        });
    return imagePending;
  };
  router.get('/sources', async (_req, res) => {
    const rows = await settings.list();
    res.set('Cache-Control', 'no-store').json({
      sources: rows.map(({ id, name, kind, active, configured, url }) => ({
        id,
        name,
        kind,
        active,
        configured,
        url,
      })),
    });
  });
  router.get('/image/bmkg', async (_req, res) => {
    try {
      const result = await imageData();
      res.set('Cache-Control', 'public, max-age=300').type('png').send(result.body);
    } catch {
      res.status(502).json({ error: 'BMKG image unavailable.' });
    }
  });
  router.get('/', async (req, res) => {
    const day = req.query.day,
      source = req.query.source || 'all';
    if (
      !validDay(day) ||
      typeof source !== 'string' ||
      !['all', 'firms', 'sipongi'].includes(source) ||
      Object.keys(req.query).some((k) => !['day', 'source'].includes(k))
    )
      throw fail('Invalid hotspot day or source.');
    const ids = source === 'all' ? ['firms', 'sipongi'] : [source],
      results = [];
    for (const id of ids) results.push([id, await sourceDay(id, day)]);
    res.set('Cache-Control', 'no-store').json({
      day,
      items: mergeDetections(results.flatMap(([, r]) => r.items)),
      sources: Object.fromEntries(results.map(([id, { items, ...status }]) => [id, status])),
      cache: redis?.isReady ? 'redis' : 'memory',
    });
  });
  admin.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Permission denied.' });
    next();
  });
  admin.use(json({ limit: '2kb' }));
  admin.get('/', async (_req, res) => res.json({ sources: await settings.list() }));
  admin.patch('/:id', async (req, res) => {
    const source = await auth.db.transaction(async () => {
      const value = await settings.update(req.params.id, req.body);
      await auth.audit(req.user.id, 'hotspot-source.update', req.params.id);
      return value;
    });
    res.json({ source });
  });
  admin.post('/:id/check', rateLimit({ limit: 6 }), async (req, res) => {
    const row = await settings.read(req.params.id);
    if (!row.active) return res.json({ status: 'disabled' });
    if (row.id === 'bmkg') {
      try {
        await imageData();
        res.json({ status: 'ok', kind: 'image' });
      } catch {
        res.json({ status: 'unavailable' });
      }
    } else {
      const { items, ...status } = await sourceDay(
        row.id,
        new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      );
      res.json({ ...status, count: items.length });
    }
  });
  return {
    router,
    admin,
    close: async () => {
      if (redis?.isOpen) redis.destroy();
      await Promise.allSettled([...pending.values()]);
    },
  };
}
