import express from 'express';
import { rateLimit, concurrencyLimit, securityHeaders } from './request-protection.mjs';
import { createCameraSources } from './camera-sources.mjs';
import { publicMapCatalog } from './public-map-catalog.mjs';
import { createAuth } from './auth/service.mjs';
import { createRouteRouter } from './routes/service.mjs';
import path from 'node:path';
import { createDrawingStore } from './drawing-projects.mjs';
import { createOverlayStore } from './image-overlays.mjs';
import { serveOsintCameraMedia } from './osint-camera-media.mjs';
import { serveOsintCameraHealth } from './osint-camera-health.mjs';
import { createManager } from '../services/offline-maps/manager.mjs';
import { createApp as createOfflineApp } from '../services/offline-maps/server.mjs';

export async function createApp({ directory = '.runtime', serveDist = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Only explicitly configured proxy addresses may supply forwarded client IPs.
  if (process.env.JEJAK_TRUST_PROXY)
    app.set(
      'trust proxy',
      process.env.JEJAK_TRUST_PROXY.split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    );
  app.use(securityHeaders);
  const mediaLimit = rateLimit({ limit: 1800 });
  const apiLimit = rateLimit({ limit: 300 });
  app.use('/api', (req, res, next) =>
    (req.path.startsWith('/osint/camera-media/') ? mediaLimit : apiLimit)(req, res, next),
  );
  app.use('/api', concurrencyLimit(128));
  app.use((req, res, next) => {
    let foreignOrigin = false;
    try {
      const origin = req.get('Origin');
      foreignOrigin = Boolean(
        origin &&
        (!['http:', 'https:'].includes(new URL(origin).protocol) ||
          new URL(origin).host !== req.get('Host')),
      );
    } catch {
      foreignOrigin = true;
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('Sec-Fetch-Site') === 'cross-site' || foreignOrigin)
    )
      return res.status(403).json({ error: 'Same-origin requests required.' });
    next();
  });
  const drawings = createDrawingStore(directory);
  const auth = createAuth(directory);
  const cameraSources = createCameraSources(auth.db);
  app.use(auth.middleware);
  app.get('/api/cctv-source-state', (_req, res) =>
    res.set('Cache-Control', 'no-store').json({ active: cameraSources.state() }),
  );
  app.use('/api/cctv-sources', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Permission denied.' });
    next();
  });
  app.get('/api/cctv-sources', (_req, res) => res.json(cameraSources.catalog()));
  app.patch('/api/cctv-sources', express.json({ limit: '4kb' }), (req, res) => {
    const result = cameraSources.update(req.body?.name, req.body?.active);
    auth.audit(req.user.id, 'camera-source.update', req.body.name);
    res.json(result);
  });
  app.use('/api/auth', auth.router);
  app.use('/api/routes', createRouteRouter(auth, { cameraEnabled: cameraSources.enabled }));
  app.use(['/api/bms/projects', '/api/osint/map-overlays'], (req, res, next) =>
    auth.requirePermission('objects.write')(req, res, next),
  );
  app.use(['/api/bms/projects', '/api/osint/map-overlays'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/offline-maps', (req, res, next) =>
    ['GET', 'HEAD'].includes(req.method)
      ? next()
      : auth.requirePermission('settings.manage')(req, res, next),
  );
  const overlays = createOverlayStore(directory);
  const json = express.json({ limit: '8mb' });
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'jejak' }));
  app.get('/api/bms/projects/osint', async (_req, res) => res.json(await drawings.read()));
  app.patch('/api/bms/projects/osint', json, async (req, res) =>
    res.json(await drawings.patch(req.body)),
  );
  app.get('/api/osint/map-overlays', async (_req, res) =>
    res.json({ items: await overlays.read() }),
  );
  app.post('/api/osint/map-overlays', json, async (req, res) =>
    res.status(201).json({ items: await overlays.mutate(null, 'POST', req.body) }),
  );
  for (const method of ['put', 'patch', 'delete'])
    app[method]('/api/osint/map-overlays/:id', json, async (req, res) =>
      res.json({ items: await overlays.mutate(req.params.id, method.toUpperCase(), req.body) }),
    );
  app.all('/api/osint/camera-health', serveOsintCameraHealth);
  app.use((req, res, next) =>
    req.path.startsWith('/api/osint/camera-media/') ? serveOsintCameraMedia(req, res) : next(),
  );
  const manager = await createManager(
    process.env.MAP_DATA_DIR || path.join(directory, 'offline-maps'),
  );
  // Local API is the boundary; no shared BMS service credentials are required.
  app.get('/api/offline-maps/regions', (req, res) => {
    const state = manager.snapshot();
    res
      .set('Cache-Control', 'no-store')
      .json(req.user?.permissions.includes('settings.manage') ? state : publicMapCatalog(state));
  });
  const offline = createOfflineApp(manager, {
    authenticate: (_req, _res, next) => next(),
    assetDirectory: process.env.MAP_ASSET_DIR || path.join(directory, 'map-assets'),
  });
  app.use(offline);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (serveDist) {
    app.use(
      '/assets',
      express.static(path.resolve('dist/assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(express.static(path.resolve('dist')));
    app.get(['/', '/workspaces/osint'], (_req, res) =>
      res.sendFile(path.resolve('dist/index.html')),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request body is too large.' });
    res
      .status(error.status || 500)
      .json({ error: error.status ? error.message : 'Unable to process request.' });
  });
  app.locals.close = async () => {
    auth.close();
    await manager.close();
    offline.locals.close();
  };
  return app;
}
