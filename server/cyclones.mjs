import { createObservations } from './cyclone-observations.mjs';
import { createCycloneHistory } from './cyclone-history.mjs';
import { parseJtwcForecast } from './cyclone-forecast.mjs';
import { parseInvestAdvisory } from './cyclone-invests.mjs';
import {
  NHC_URL,
  JMA_ROOT,
  parseNhc,
  jmaTargets,
  parseJma,
  mergeCyclones,
} from './cyclone-providers.mjs';
import express from 'express';
import { rateLimit, concurrencyLimit } from './request-protection.mjs';
const ROOT = 'https://www.metoc.navy.mil/jtwc';
export function parseCycloneFeed(text, now = Date.now()) {
  if (!text.includes('<rss') || !text.includes('JTWC')) throw new Error('Invalid JTWC feed');
  const time = Date.parse(text.match(/<lastBuildDate>([^<]+)</)?.[1] || '');
  if (!Number.isFinite(time) || time > now + 3600000 || now - time > 36 * 3600000)
    throw new Error('Stale JTWC feed');
  const products = [
    ...new Set(
      [...text.matchAll(/\/products\/((?:wp|io|sh|ep|cp)\d{4})web\.txt/g)].map((m) => m[1]),
    ),
  ]
    .filter((id) => Number(id.slice(2, 4)) < 90)
    .slice(0, 20);
  return { time, products };
}
export function parseCycloneWarning(text, id, feedTime, now = Date.now()) {
  const name = text.match(
    /(?:TROPICAL CYCLONE|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION)\s+(\d{2}[A-Z])\s+\(([^)]+)\)\s+WARNING/i,
  );
  const position = text.match(
    /WARNING POSITION:\s*(\d{2})(\d{2})(\d{2})Z\s*---\s*NEAR\s+(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/,
  );
  if (!name || !position) throw new Error('Unsupported cyclone bulletin');
  const reference = new Date(feedTime);
  const candidates = [-1, 0, 1]
    .map((offset) =>
      Date.UTC(
        reference.getUTCFullYear(),
        reference.getUTCMonth() + offset,
        +position[1],
        +position[2],
        +position[3],
      ),
    )
    .filter((t) => new Date(t).getUTCDate() === +position[1]);
  const time = candidates.sort((a, b) => Math.abs(a - feedTime) - Math.abs(b - feedTime))[0];
  const lat = +position[4] * (position[5] === 'S' ? -1 : 1),
    lng = +position[6] * (position[7] === 'W' ? -1 : 1);
  if (
    !Number.isFinite(time) ||
    +position[2] > 23 ||
    +position[3] > 59 ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error('Invalid cyclone position');
  if (now - time > 36 * 3600000 || time > now + 3600000 || /THIS IS THE FINAL WARNING/i.test(text))
    return null;
  const actual = text.split('FORECASTS:')[0];
  const wind = actual.match(/MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT/);
  const gust = actual.match(/GUSTS\s+(\d+)\s*KT/);
  const movement = actual.match(/MOVEMENT PAST SIX HOURS\s*-\s*(\d+) DEGREES AT\s*(\d+) KTS/);
  return {
    id,
    agency: 'JTWC',
    windPeriodMinutes: 1,
    forecast: parseJtwcForecast(text, time),
    name: name[2].trim().slice(0, 80),
    designation: name[1],
    lat,
    lng,
    time,
    windKnots: wind ? +wind[1] : null,
    gustKnots: gust ? +gust[1] : null,
    direction: movement ? +movement[1] : null,
    speedKnots: movement ? +movement[2] : null,
    source: ROOT + '/products/' + id + 'web.txt',
  };
}
async function read(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('JTWC unavailable');
  let text = '',
    size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 500000) throw new Error('Oversized bulletin');
      text += new TextDecoder().decode(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}
export function createCyclones({ fetcher = fetch, now = Date.now, db } = {}) {
  const router = express.Router();
  const observations = createObservations({ db, fetcher, now });
  let cache = null,
    expires = 0,
    pending = null;
  router.use(rateLimit({ limit: 60 }), concurrencyLimit(12));
  router.use(createCycloneHistory({ fetcher, now, observations }));
  router.get('/', async (req, res) => {
    try {
      if (now() < expires) {
        if (cache) return res.json(cache);
        throw new Error('Retry later');
      }
      if (!pending)
        pending = (async () => {
          const loaders = {
            JTWC: async () => {
              const feed = parseCycloneFeed(await read(ROOT + '/rss/jtwc.rss', fetcher), now());
              const results = await Promise.allSettled(
                feed.products.map(async (id) =>
                  parseCycloneWarning(
                    await read(ROOT + '/products/' + id + 'web.txt', fetcher),
                    id,
                    feed.time,
                    now(),
                  ),
                ),
              );
              const advisories = await Promise.allSettled(
                ['abioweb', 'abpwweb'].map(async (product) =>
                  parseInvestAdvisory(
                    await read(ROOT + '/products/' + product + '.txt', fetcher),
                    product,
                    now(),
                  ),
                ),
              );
              const investItems = advisories.flatMap((r) =>
                r.status === 'fulfilled' ? r.value.items : [],
              );
              if (results.length && results.every((r) => r.status === 'rejected'))
                throw new Error('JTWC bulletins unavailable');
              return {
                items: [
                  ...results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : [])),
                  ...investItems,
                ],
                feedTime: feed.time,
                partial: [...results, ...advisories].some((r) => r.status === 'rejected'),
              };
            },
            NHC: async () => parseNhc(JSON.parse(await read(NHC_URL, fetcher)), now()),
            JMA: async () => {
              const targets = jmaTargets(
                JSON.parse(await read(JMA_ROOT + '/targetTc.json', fetcher)),
              );
              const results = await Promise.allSettled(
                targets.map(async (target) =>
                  parseJma(
                    target,
                    JSON.parse(
                      await read(
                        JMA_ROOT + '/' + target.tropicalCyclone + '/forecast.json',
                        fetcher,
                      ),
                    ),
                    now(),
                  ),
                ),
              );
              if (results.length && results.every((r) => r.status === 'rejected'))
                throw new Error('JMA bulletins unavailable');
              const items = results.flatMap((r) =>
                r.status === 'fulfilled' && r.value ? [r.value] : [],
              );
              return {
                items,
                feedTime: items.length ? Math.max(...items.map((c) => c.time)) : null,
                partial: results.some((r) => r.status === 'rejected'),
              };
            },
          };
          const results = await Promise.allSettled(Object.values(loaders).map((load) => load()));
          if (results.every((r) => r.status === 'rejected'))
            throw new Error('All cyclone sources unavailable');
          const sources = Object.keys(loaders).map((agency, i) => ({
            agency,
            status:
              results[i].status === 'rejected'
                ? 'unavailable'
                : results[i].value.partial
                  ? 'partial'
                  : 'ok',
            count: results[i].status === 'fulfilled' ? results[i].value.items.length : 0,
          }));
          const available = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
          const items = mergeCyclones(available.flatMap((r) => r.items));
          await observations.record(items);
          cache = {
            items,
            sources,
            feedTime: Math.max(0, ...available.map((r) => r.feedTime ?? 0)) || now(),
            fetchedAt: now(),
            source: sources
              .filter((s) => s.status !== 'unavailable')
              .map((s) => s.agency)
              .join(' / '),
            coverage: 'Combined agency coverage',
          };
          expires = now() + 10 * 60000;
          return cache;
        })().finally(() => {
          pending = null;
        });
      res.set('Cache-Control', 'public, max-age=60').json(await pending);
    } catch {
      cache = null;
      expires = now() + 30000;
      res.status(503).json({ error: 'Current cyclone data unavailable' });
    }
  });
  let collecting = null;
  const collect = () => {
    if (collecting) return;
    collecting = (async () => {
      const results = await Promise.allSettled(
        ['abioweb', 'abpwweb'].map(async (product) =>
          parseInvestAdvisory(
            await read(ROOT + '/products/' + product + '.txt', fetcher),
            product,
            now(),
          ),
        ),
      );
      await observations.record(
        results.flatMap((r) => (r.status === 'fulfilled' ? r.value.items : [])),
      );
    })()
      .catch(() => console.warn('Cyclone observation collection unavailable'))
      .finally(() => {
        collecting = null;
      });
  };
  const timer = db ? setInterval(collect, 10 * 60000) : null;
  if (db) collect();
  timer?.unref();
  return {
    router,
    close: async () => {
      if (timer) clearInterval(timer);
      await collecting;
    },
  };
}
