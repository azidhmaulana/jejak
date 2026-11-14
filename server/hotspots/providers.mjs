import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fail } from './settings.mjs';

const boundary = JSON.parse(
  readFileSync(new URL('../../public/data/indonesia-boundary.geojson', import.meta.url), 'utf8'),
).geometry;
const polygons = (boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates).map(
  (rings) => {
    const points = rings[0];
    return {
      rings,
      box: [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
      ],
    };
  },
);
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const inIndonesia = (lng, lat) =>
  polygons.some(
    ({ box: [w, s, e, n], rings }) =>
      lng >= w &&
      lng <= e &&
      lat >= s &&
      lat <= n &&
      inRing(lng, lat, rings[0]) &&
      !rings.slice(1).some((r) => inRing(lng, lat, r)),
  );
export function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const ms = Date.parse(day);
  return (
    Number.isFinite(ms) &&
    new Date(ms).toISOString().slice(0, 10) === day &&
    day >= '2000-01-01' &&
    day <= new Date().toISOString().slice(0, 10)
  );
}
export async function download(url, type = 'text') {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'error' });
  if (!response.ok) throw Error(`upstream-${response.status}`);
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 12 * 1024 * 1024) throw Error('response-limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const body = Buffer.concat(chunks);
  return type === 'buffer' ? body : body.toString('utf8');
}
export function parseCsv(input) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if (c === '\n' && !quoted) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = rows.shift()?.map((x) => x.replace(/^\uFEFF/, '')) || [];
  return {
    headers,
    rows: rows
      .filter((r) => r.length === headers.length)
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
  };
}
const text = (v) => (typeof v === 'string' ? v.slice(0, 250) : '');
function satellite(value) {
  const s = String(value || '').toUpperCase();
  if (/NOAA.?21|N21/.test(s)) return 'NOAA-21';
  if (/NOAA.?20|N20|J1|JPSS.?1/.test(s)) return 'NOAA-20';
  if (/SNPP|S.NPP|NPP|^N$/.test(s)) return 'Suomi NPP';
  if (/AQUA|^A$/.test(s)) return 'Aqua';
  if (/TERRA|^T$/.test(s)) return 'Terra';
  return /MODIS/.test(s) ? 'Terra/Aqua' : text(value) || 'Unknown';
}
function confidence(value, modis) {
  const s = String(value).toLowerCase();
  if (['h', 'high'].includes(s)) return 'high';
  if (['n', 'nominal', 'medium'].includes(s)) return 'medium';
  if (['l', 'low'].includes(s)) return 'low';
  if (modis && value !== '' && Number.isFinite(Number(value)))
    return Number(value) >= 80 ? 'high' : Number(value) >= 30 ? 'medium' : 'low';
  return 'unknown';
}
function event({ lat, lng, time, ...rest }) {
  if (
    ![lat, lng, time].every(Number.isFinite) ||
    !inIndonesia(lng, lat) ||
    time > Date.now() + 300000 ||
    time < Date.parse('2000-01-01')
  )
    return null;
  const id = createHash('sha256')
    .update(`${rest.satellite}|${Math.floor(time / 60000)}|${lat.toFixed(4)}|${lng.toFixed(4)}`)
    .digest('hex')
    .slice(0, 24);
  return { id, lat, lng, time, ...rest };
}
export function normalizeFirms(row, sensor) {
  const clock = String(row.acq_time || '').padStart(4, '0');
  return event({
    lat: row.latitude === '' ? NaN : Number(row.latitude),
    lng: row.longitude === '' ? NaN : Number(row.longitude),
    time: /^\d{4}$/.test(clock)
      ? Date.parse(`${row.acq_date}T${clock.slice(0, 2)}:${clock.slice(2)}:00Z`)
      : NaN,
    satellite: satellite(row.satellite || sensor),
    confidence: confidence(row.confidence, sensor === 'MODIS'),
    frp: row.frp !== '' && Number.isFinite(Number(row.frp)) ? Number(row.frp) : null,
    place: '',
    providers: ['firms'],
  });
}
export function normalizeSipongi(feature) {
  const p = feature?.properties || {},
    coords = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(coords)) return null;
  return event({
    lng: coords[0],
    lat: coords[1],
    time: Date.parse(p.date_hotspot_ori),
    satellite: satellite(p.ori_sumber || p.sumber),
    confidence: confidence(p.confidence_level, false),
    frp: null,
    place: [p.desa, p.kabkota, p.nama_provinsi]
      .filter((v) => typeof v === 'string' && v)
      .map(text)
      .join(', '),
    providers: ['sipongi'],
  });
}
export function mergeDetections(items) {
  const merged = new Map();
  for (const item of items.filter(Boolean)) {
    const previous = merged.get(item.id);
    merged.set(
      item.id,
      previous
        ? {
            ...previous,
            place: previous.place || item.place,
            frp: previous.frp ?? item.frp,
            providers: [...new Set([...previous.providers, ...item.providers])],
          }
        : item,
    );
  }
  return [...merged.values()].sort((a, b) => a.time - b.time);
}
export async function fetchSipongi(day, read = download) {
  const query = new URLSearchParams({
    wilayah: 'IN',
    filterperiode: 'true',
    from: day,
    to: new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10),
    late: '24',
    provinsi: '',
    kabkota: '',
  });
  for (const s of [
    'LPN-MODIS',
    'LPN-NPP',
    'LPN-NOAA20',
    'NASA-MODIS',
    'NASA-NOAA20',
    'NASA-NOAA21',
  ])
    query.append('satelit[]', s);
  for (const c of ['low', 'medium', 'high']) query.append('confidence[]', c);
  const data = JSON.parse(
    await read(`https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot?${query}`),
  );
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features))
    throw Error('invalid-format');
  return data.features.map(normalizeSipongi).filter(Boolean);
}
export async function fetchFirms(day, key, read = download) {
  if (!key) throw fail('API key not configured.', 409);
  const availability = parseCsv(
    await read(`https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${key}/ALL`),
  );
  if (!availability.headers.includes('data_id')) throw Error('invalid-key-or-format');
  const items = [],
    unavailable = [];
  for (const sensor of ['MODIS', 'VIIRS_SNPP', 'VIIRS_NOAA20', 'VIIRS_NOAA21']) {
    const product = ['SP', 'NRT']
      .map((kind) => `${sensor}_${kind}`)
      .find((id) =>
        availability.rows.some(
          (r) =>
            r.data_id === id && r.min_date?.slice(0, 10) <= day && r.max_date?.slice(0, 10) >= day,
        ),
      );
    if (!product) {
      unavailable.push(sensor);
      continue;
    }
    const csv = parseCsv(
      await read(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/92,-12,142,8/1/${day}`,
      ),
    );
    if (!csv.headers.includes('latitude') || !csv.headers.includes('longitude'))
      throw Error('invalid-source-format');
    items.push(...csv.rows.map((r) => normalizeFirms(r, sensor)).filter(Boolean));
  }
  return { items, unavailable };
}
