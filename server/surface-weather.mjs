import express from 'express';
import { rateLimit, concurrencyLimit } from './request-protection.mjs';
export const SURFACE_LAYER = 'MODIS_Aqua_L3_Land_Surface_Temp_Daily_Day_TES';
export function surfaceMetadata(xml) {
  const layer = xml
    .split('<Layer>')
    .find((s) => s.includes(`<ows:Identifier>${SURFACE_LAYER}</ows:Identifier>`));
  const date = layer?.match(/<Default>(\d{4}-\d{2}-\d{2})<\/Default>/)?.[1];
  if (!date || !Number.isFinite(Date.parse(date))) throw new Error('Surface date missing');
  return {
    date,
    source: 'NASA GIBS / Aqua MODIS',
    resolution: '1 km',
    unit: 'K',
    tiles: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${SURFACE_LAYER}/default/${date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
    legend: 'https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.svg',
  };
}
export function createSurfaceWeather({ fetcher = fetch, now = Date.now } = {}) {
  const router = express.Router();
  let cached,
    expires = 0,
    pending,
    retry = 0;
  router.use(rateLimit({ limit: 30 }), concurrencyLimit(6));
  router.get('/', async (req, res) => {
    try {
      if (cached && expires > now()) return res.json(cached);
      if (!pending) {
        if (now() < retry) return res.status(503).json({ error: 'Surface source unavailable' });
        pending = (async () => {
          const r = await fetcher(
            'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
            { signal: AbortSignal.timeout(25000), redirect: 'error' },
          );
          if (!r.ok) {
            await r.body?.cancel();
            throw new Error('Source unavailable');
          }
          const reader = r.body.getReader(),
            chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > 20000000) throw new Error('Metadata too large');
              chunks.push(Buffer.from(value));
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
          cached = surfaceMetadata(Buffer.concat(chunks).toString());
          expires = now() + 3600000;
          return cached;
        })()
          .catch((e) => {
            retry = now() + 30000;
            throw e;
          })
          .finally(() => {
            pending = null;
          });
      }
      res.set('Cache-Control', 'public, max-age=600').json(await pending);
    } catch {
      res.status(503).json({ error: 'Surface source unavailable' });
    }
  });
  return { router };
}
