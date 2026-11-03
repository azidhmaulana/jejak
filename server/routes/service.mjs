import express from 'express';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const publicCameras = ['bandungCameras.json', 'bandungPublicCameras.json'].flatMap(
  (file) =>
    JSON.parse(
      readFileSync(
        new URL(`../../src/features/surveillance/data/${file}`, import.meta.url),
        'utf8',
      ),
    ).cameras,
);
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
export function validatePoints({ start, end, tolerance = 50 }) {
  for (const point of [start, end])
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 85
    )
      throw invalid('Choose valid start and end coordinates.');
  if (![25, 50, 100].includes(tolerance)) throw invalid('Tolerance must be 25, 50 or 100 meters.');
  if (start[0] === end[0] && start[1] === end[1]) throw invalid('Start and end must be different.');
  return { start, end, tolerance };
}
// Local metric projection per segment: sufficient for short road segments, not a bounding-box match.
export function camerasAlongRoute(coordinates, cameras, tolerance) {
  const hits = [];
  for (const camera of cameras) {
    let best = Infinity,
      progress = 0,
      travelled = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1],
        b = coordinates[i];
      const kx = 111195 * Math.cos(((a[1] + b[1]) * Math.PI) / 360),
        ky = 111195;
      const dx = (b[0] - a[0]) * kx,
        dy = (b[1] - a[1]) * ky;
      const px = (camera.longitude - a[0]) * kx,
        py = (camera.latitude - a[1]) * ky;
      const length = Math.hypot(dx, dy);
      const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / (length * length))) : 0;
      const distance = Math.hypot(px - t * dx, py - t * dy);
      if (distance < best) {
        best = distance;
        progress = travelled + t * length;
      }
      travelled += length;
    }
    if (best <= tolerance)
      hits.push({
        id: camera.id,
        name: camera.name,
        latitude: camera.latitude,
        longitude: camera.longitude,
        distanceFromRoute: Math.round(best),
        distanceAlongRoute: Math.round(progress),
      });
  }
  return hits.sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute);
}
export function createRouteRouter(auth, { fetcher = fetch, cameras = publicCameras } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '4mb' }));
  router.use(auth.requirePermission('routes.use'));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const pending = new Set();
  let nextRequest = 0;
  router.post('/calculate', async (req, res) => {
    const points = validatePoints(req.body);
    if (pending.has(req.user.id)) throw invalid('A route calculation is already running.', 429);
    if (Date.now() < nextRequest)
      throw invalid('Please wait a moment before calculating another route.', 429);
    nextRequest = Date.now() + 1100;
    pending.add(req.user.id);
    try {
      const base = (
        process.env.JEJAK_ROUTING_URL || 'https://routing.openstreetmap.de/routed-car'
      ).replace(/\/$/, '');
      const url = `${base}/route/v1/driving/${points.start.join(',')};${points.end.join(',')}?overview=full&geometries=geojson&steps=false`;
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'JEJAK/1.0 (interactive CCTV route planner)' },
      });
      if (!response.ok) throw invalid('Routing provider is unavailable. Please try again.', 502);
      const data = await response.json(),
        route = data.routes?.[0];
      if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length)
        throw invalid('No drivable route was found.', 422);
      const coordinates = route.geometry.coordinates;
      if (
        coordinates.length > 100000 ||
        coordinates.some((p) => !Array.isArray(p) || p.length < 2 || !p.every(Number.isFinite))
      )
        throw invalid('Invalid route response.', 502);
      res.json({
        ...points,
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration,
        cameras: camerasAlongRoute(coordinates, cameras, points.tolerance),
        provider: 'OSRM / OpenStreetMap',
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'TypeError')
        throw invalid('Routing provider is unavailable. Please try again.', 502);
      throw error;
    } finally {
      pending.delete(req.user.id);
    }
  });
  router.get('/', auth.requirePermission('routes.save'), (req, res) =>
    res.json({
      routes: auth.db
        .prepare('SELECT id,name,data,created FROM routes WHERE user_id=? ORDER BY created DESC')
        .all(req.user.id)
        .map(({ data, ...row }) => ({ ...row, ...JSON.parse(data) })),
    }),
  );
  router.post('/', auth.requirePermission('routes.save'), (req, res) => {
    const points = validatePoints(req.body);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) throw invalid('Enter a route name (maximum 80 characters).');
    if (
      auth.db.prepare('SELECT COUNT(*) AS n FROM routes WHERE user_id=?').get(req.user.id).n >= 100
    )
      throw invalid('You can save up to 100 routes.');
    const id = randomUUID();
    auth.db
      .prepare('INSERT INTO routes VALUES(?,?,?,?,?)')
      .run(id, req.user.id, name, JSON.stringify(points), Date.now());
    auth.audit(req.user.id, 'route.save', id);
    res.status(201).json({ id });
  });
  router.delete('/:id', auth.requirePermission('routes.save'), (req, res) => {
    const result = auth.db
      .prepare('DELETE FROM routes WHERE id=? AND user_id=?')
      .run(req.params.id, req.user.id);
    if (!result.changes) throw invalid('Route not found.', 404);
    auth.audit(req.user.id, 'route.delete', req.params.id);
    res.json({ ok: true });
  });
  return router;
}
