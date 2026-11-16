import express from 'express';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rateLimit, concurrencyLimit } from './request-protection.mjs';

const ROOT = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';
const HOUR = 3600000;
export function windRanges(index) {
  const lines = index
    .trim()
    .split('\n')
    .map((line) => line.split(':'));
  return ['UGRD', 'VGRD'].map((name) => {
    const i = lines.findIndex((row) => row[3] === name && row[4] === '10 m above ground');
    const start = Number(lines[i]?.[1]),
      end = Number(lines[i + 1]?.[1]) - 1;
    if (
      i < 0 ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end - start > 2000000
    )
      throw new Error('Invalid wind index');
    return [start, end];
  });
}
export function decodeWind(bytes) {
  const local = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? '../.runtime/wind-python/Scripts/python.exe'
        : '../.runtime/wind-python/bin/python',
      import.meta.url,
    ),
  );
  const python =
    process.env.JEJAK_WIND_PYTHON ||
    (existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3');
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [fileURLToPath(new URL('../scripts/decode-wind.py', import.meta.url))],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '',
      size = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Wind decoder timeout'));
    }, 30000);
    child.on('error', reject);
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 3000000) {
        child.kill();
        reject(new Error('Wind grid too large'));
      } else output += chunk;
    });
    child.stderr.resume();
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new Error('Wind decoder unavailable; check Python dependencies'));
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error('Invalid decoded wind'));
      }
    });
    child.stdin.end(bytes);
  });
}
async function boundedFetch(url, fetcher, range) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
    headers: range ? { Range: `bytes=${range[0]}-${range[1]}` } : {},
  });
  if (response.status !== (range ? 206 : 200)) {
    await response.body?.cancel();
    throw new Error('GFS unavailable');
  }
  if (
    range &&
    !response.headers.get('content-range')?.startsWith(`bytes ${range[0]}-${range[1]}/`)
  ) {
    await response.body?.cancel();
    throw new Error('Invalid GFS range');
  }
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > (range ? 2000000 : 200000)) throw new Error('GFS response too large');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const body = Buffer.concat(chunks);
  if (range && (body.length !== range[1] - range[0] + 1 || body.toString('ascii', 0, 4) !== 'GRIB'))
    throw new Error('Invalid GRIB');
  return body;
}
export function createWind({ fetcher = fetch, decode = decodeWind, now = Date.now } = {}) {
  const router = express.Router(),
    cache = new Map(),
    pending = new Map();
  router.use(rateLimit({ limit: 60 }), concurrencyLimit(12));
  router.get('/', async (req, res) => {
    const raw = req.query.hour ?? '0';
    if (
      typeof raw !== 'string' ||
      !/^-?\d{1,3}$/.test(raw) ||
      +raw < -72 ||
      +raw > 120 ||
      +raw % 3 !== 0
    )
      return res.status(400).json({ error: 'Invalid wind forecast hour' });
    const validTime = Math.floor((now() + +raw * HOUR) / (3 * HOUR)) * 3 * HOUR;
    const hit = cache.get(validTime);
    if (hit && hit.expires > now())
      return hit.data
        ? res.json(hit.data)
        : res.status(503).json({ error: 'GFS temporarily unavailable' });
    try {
      let job = pending.get(validTime);
      if (!job) {
        if (pending.size >= 2)
          return res.set('Retry-After', '5').status(503).json({ error: 'Wind service busy' });
        job = (async () => {
          const latest = Math.floor((now() - 5 * HOUR) / (6 * HOUR)) * 6 * HOUR;
          let lastError;
          for (let attempt = 0; attempt < 3; attempt++) {
            const referenceTime =
              Math.min(latest, Math.floor(validTime / (6 * HOUR)) * 6 * HOUR) - attempt * 6 * HOUR;
            const forecastHours = (validTime - referenceTime) / HOUR;
            const iso = new Date(referenceTime).toISOString(),
              day = iso.slice(0, 10).replaceAll('-', ''),
              cycle = iso.slice(11, 13);
            const url = `${ROOT}/gfs.${day}/${cycle}/atmos/gfs.t${cycle}z.pgrb2.1p00.f${String(forecastHours).padStart(3, '0')}`;
            try {
              const ranges = windRanges((await boundedFetch(url + '.idx', fetcher)).toString());
              const bytes = [];
              for (const range of ranges) bytes.push(await boundedFetch(url, fetcher, range));
              const grid = await decode(Buffer.concat(bytes));
              if (
                grid.reference !== day + cycle + '00' ||
                grid.forecastHours !== forecastHours ||
                grid.nx !== 360 ||
                grid.ny !== 181 ||
                grid.u?.length !== 65160 ||
                grid.v?.length !== 65160
              )
                throw new Error('GFS metadata mismatch');
              return { ...grid, referenceTime, validTime, source: 'NOAA GFS', resolution: 1 };
            } catch (error) {
              lastError = error;
            }
          }
          throw lastError;
        })()
          .then((data) => {
            cache.set(validTime, { data, expires: now() + 20 * 60000 });
            return data;
          })
          .catch((error) => {
            cache.set(validTime, { expires: now() + 30000 });
            throw error;
          })
          .finally(() => {
            pending.delete(validTime);
            while (cache.size > 16) cache.delete(cache.keys().next().value);
          });
        pending.set(validTime, job);
      }
      res.set('Cache-Control', 'public, max-age=300').json(await job);
    } catch {
      res.status(503).json({ error: 'GFS unavailable or decoder not installed' });
    }
  });
  return { router };
}
