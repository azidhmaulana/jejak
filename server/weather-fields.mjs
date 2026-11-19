import express from 'express';
import { boundedFetch, decodeWind } from './wind.mjs';
import { rateLimit, concurrencyLimit } from './request-protection.mjs';

export const FIELD_SPECS = {
  gust: { fields: [['GUST', 'surface']], unit: 'mph' },
  pressure: { fields: [['PRMSL', 'mean sea level']], unit: 'hPa' },
  temperature: { fields: [['TMP', '2 m above ground']], unit: 'C' },
  dewpoint: { fields: [['DPT', '2 m above ground']], unit: 'C' },
  humidity: { fields: [['RH', '2 m above ground']], unit: '%' },
  wetbulb: {
    fields: [
      ['TMP', '2 m above ground'],
      ['RH', '2 m above ground'],
    ],
    unit: 'C',
  },
  solar: { fields: [['DSWRF', 'surface']], unit: 'W/m2' },
  uv: { fields: [['DUVB', 'surface']], unit: 'UVI' },
};
export function scalarRanges(index, field) {
  const rows = index
    .trim()
    .split('\n')
    .map((line) => line.split(':'));
  return FIELD_SPECS[field].fields.map(([name, level]) => {
    const i = rows.findIndex((row) => row[3] === name && row[4] === level);
    const start = Number(rows[i]?.[1]),
      end = Number(rows[i + 1]?.[1]) - 1;
    if (
      i < 0 ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end - start > 2000000
    )
      throw new Error('Missing GFS field');
    return [start, end];
  });
}
export function scalarValue(field, values) {
  const v = values[0];
  if (!values.every(Number.isFinite)) return null;
  if (field === 'temperature' || field === 'dewpoint') return v - 273.15;
  if (field === 'pressure') return v / 100;
  if (field === 'gust') return Math.max(0, v) * 2.2369362921;
  if (field === 'humidity') return Math.min(100, Math.max(0, v));
  // Stull (2011) approximation: do not extrapolate outside its published domain.
  if (field === 'wetbulb') {
    const t = v - 273.15,
      rh = values[1];
    if (t < -20 || t > 50 || rh < 5 || rh > 99 || (t < 0 && rh < 20)) return null;
    return (
      t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(t + rh) -
      Math.atan(rh - 1.676331) +
      0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
      4.686035
    );
  }
  // Empirical DUVB conversion used by Open-Meteo's GFS reader; an estimate, not an instrument reading.
  if (field === 'uv') return Math.max(0, v * 18.9 * 0.025);
  return Math.max(0, v);
}
export function createWeatherFields({
  fetcher = fetch,
  decode = (bytes) => decodeWind(bytes, 'decode-weather.py'),
  now = Date.now,
} = {}) {
  const router = express.Router(),
    cache = new Map(),
    pending = new Map();
  router.use(rateLimit({ limit: 90 }), concurrencyLimit(10));
  router.get('/:field', async (req, res) => {
    const { field } = req.params,
      raw = req.query.hour ?? '0';
    if (
      !Object.hasOwn(FIELD_SPECS, field) ||
      typeof raw !== 'string' ||
      !/^-?\d{1,3}$/.test(raw) ||
      +raw < -72 ||
      +raw > 120 ||
      +raw % 3
    )
      return res.status(400).json({ error: 'Invalid weather field or hour' });
    const H = 3600000,
      validTime = Math.floor((now() + +raw * H) / (3 * H)) * 3 * H,
      key = `${field}:${validTime}`;
    const hit = cache.get(key);
    if (hit?.expires > now())
      return hit.data
        ? res.json(hit.data)
        : res.status(503).json({ error: 'GFS temporarily unavailable' });
    try {
      let job = pending.get(key);
      if (!job) {
        if (pending.size >= 2)
          return res.set('Retry-After', '5').status(503).json({ error: 'Weather service busy' });
        job = (async () => {
          const latest = Math.floor((now() - 5 * H) / (6 * H)) * 6 * H;
          for (let attempt = 0; attempt < 3; attempt++) {
            // Fluxes are absent at analysis hour zero. Use the preceding run for a valid interval.
            let referenceTime =
              Math.min(latest, Math.floor(validTime / (6 * H)) * 6 * H) - attempt * 6 * H;
            if ((field === 'solar' || field === 'uv') && referenceTime === validTime)
              referenceTime -= 6 * H;
            const forecastHours = (validTime - referenceTime) / H;
            const iso = new Date(referenceTime).toISOString(),
              day = iso.slice(0, 10).replaceAll('-', ''),
              cycle = iso.slice(11, 13);
            const url = `https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.${day}/${cycle}/atmos/gfs.t${cycle}z.${field === 'uv' ? 'pgrb2b' : 'pgrb2'}.1p00.f${String(forecastHours).padStart(3, '0')}`;
            try {
              const ranges = scalarRanges(
                (await boundedFetch(url + '.idx', fetcher)).toString(),
                field,
              );
              const bytes = [];
              for (const range of ranges) bytes.push(await boundedFetch(url, fetcher, range));
              const grid = await decode(Buffer.concat(bytes));
              if (
                grid.reference !== day + cycle + '00' ||
                grid.forecastHours !== forecastHours ||
                grid.nx !== 360 ||
                grid.ny !== 181 ||
                grid.dx !== 1 ||
                grid.dy !== 1 ||
                grid.lon0 !== 0 ||
                grid.lat0 !== 90 ||
                grid.fields?.length !== ranges.length ||
                !grid.fields.every(
                  (a) => Array.isArray(a) && a.length === 65160 && a.every(Number.isFinite),
                )
              )
                throw new Error('Invalid GFS metadata');
              const values = grid.fields[0].map((_, i) => {
                const value = scalarValue(
                  field,
                  grid.fields.map((a) => a[i]),
                );
                return value === null ? null : Math.round(value * 100) / 100;
              });
              const { fields, ...metadata } = grid;
              return {
                ...metadata,
                values,
                field,
                validTime,
                referenceTime,
                source: 'NOAA GFS',
                resolution: 1,
                unit: FIELD_SPECS[field].unit,
                interval:
                  field === 'solar' || field === 'uv'
                    ? 'model interval mean ending at valid time'
                    : 'instant',
                derived: field === 'wetbulb' || field === 'uv',
              };
            } catch (error) {
              if (attempt === 2) throw error;
            }
          }
        })()
          .then((data) => {
            cache.set(key, { data, expires: now() + 20 * 60000 });
            return data;
          })
          .catch((error) => {
            cache.set(key, { expires: now() + 30000 });
            throw error;
          })
          .finally(() => {
            pending.delete(key);
            while (cache.size > 24) cache.delete(cache.keys().next().value);
          });
        pending.set(key, job);
      }
      res.set('Cache-Control', 'public, max-age=300').json(await job);
    } catch {
      res.status(503).json({ error: 'Weather source unavailable' });
    }
  });
  return { router };
}
