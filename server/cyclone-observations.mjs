export function investDeckId(item) {
  const match = item.id.match(/^invest-(9\d)([spwabc])-(\d{4})$/i);
  if (!match) return null;
  const basin = { s: 'sh', p: 'sh', w: 'wp', a: 'io', b: 'io', c: 'cp' }[match[2].toLowerCase()];
  const date = new Date(item.time),
    year = date.getUTCFullYear() + (basin === 'sh' && date.getUTCMonth() >= 6 ? 1 : 0);
  return `${basin}${match[1]}${year}`;
}
export function parseBdeck(text, id, now = Date.now()) {
  const points = new Map();
  for (const line of text.split(/\r?\n/)) {
    const a = line.split(',').map((x) => x.trim());
    if (
      a[0]?.toLowerCase() !== id.slice(0, 2) ||
      a[1] !== id.slice(2, 4) ||
      a[4] !== 'BEST' ||
      a[5] !== '0' ||
      !/^\d{10}$/.test(a[2])
    )
      continue;
    const time = Date.parse(a[2].replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:00:00Z'));
    const coord = (value, axis) => {
      const m = value?.match(axis === 'lat' ? /^(\d+)([NS])$/ : /^(\d+)([EW])$/);
      return m ? (+m[1] / 10) * ('SW'.includes(m[2]) ? -1 : 1) : NaN;
    };
    const lat = coord(a[6], 'lat'),
      lng = coord(a[7], 'lng');
    if (
      !Number.isFinite(time) ||
      time > now ||
      now - time > 14 * 86400000 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      continue;
    points.set(time, {
      time,
      lat,
      lng,
      windKnots: +a[8] > 0 && +a[8] <= 250 ? +a[8] : null,
      pressureHpa: +a[9] >= 800 && +a[9] <= 1100 ? +a[9] : null,
    });
  }
  const sorted = [...points.values()].sort((a, b) => a.time - b.time);
  // Invest numbers are reused: retain only the latest continuous episode.
  let start = 0;
  for (let i = 1; i < sorted.length; i++)
    if (
      sorted[i].time - sorted[i - 1].time > 48 * 3600000 ||
      Math.abs(sorted[i].lat - sorted[i - 1].lat) > 8 ||
      Math.abs(sorted[i].lng - sorted[i - 1].lng) > 12
    )
      start = i;
  return sorted.slice(start);
}
export function createObservations({ db, fetcher = fetch, now = Date.now }) {
  const memory = new Map();
  async function save(id, points, source) {
    if (!db) return;
    await db.transaction(async () => {
      for (const p of points)
        await db.query(
          'INSERT INTO cyclone_observations(storm_id,time,lat,lng,wind_knots,pressure_hpa,source) VALUES(?,?,?,?,?,?,?) ON CONFLICT(storm_id,time,source) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,wind_knots=EXCLUDED.wind_knots,pressure_hpa=EXCLUDED.pressure_hpa',
          [id, p.time, p.lat, p.lng, p.windKnots, p.pressureHpa ?? null, source],
        );
    });
  }
  async function record(items) {
    for (const item of items) {
      await save(item.id, [item], item.source);
      const id = investDeckId(item);
      if (!id) continue;
      const source = `https://hurricanes.ral.ucar.edu/repository/data/bdecks_open/${id.slice(4)}/b${id}.dat`;
      try {
        const r = await fetcher(source, { signal: AbortSignal.timeout(12000), redirect: 'error' });
        if (!r.ok) throw new Error();
        const reader = r.body.getReader();
        let size = 0;
        const chunks = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 500000) throw new Error();
            chunks.push(Buffer.from(value));
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const points = parseBdeck(Buffer.concat(chunks).toString(), id, now());
        const nearest = points.reduce(
          (best, p) =>
            Math.abs(p.time - item.time) < Math.abs((best?.time ?? Infinity) - item.time)
              ? p
              : best,
          null,
        );
        if (
          !nearest ||
          Math.abs(nearest.time - item.time) > 24 * 3600000 ||
          Math.abs(nearest.lat - item.lat) > 5 ||
          Math.abs(nearest.lng - item.lng) > 5
        )
          continue;
        memory.set(item.id, { points, source });
        await save(item.id, points, source);
        const latest = points.at(-1);
        if (latest.time > item.time) {
          Object.assign(item, latest, { source, agency: 'JTWC', windRangeKnots: null });
        }
      } catch {
        /* Keep the advisory position when the operational archive is unavailable. */
      }
    }
  }
  async function history(id) {
    if (!db) return memory.get(id) || { points: [], source: '' };
    const rows = await db
      .prepare(
        "SELECT time,lat,lng,wind_knots,pressure_hpa,source FROM cyclone_observations WHERE storm_id=? AND time>=? ORDER BY time,CASE WHEN source LIKE 'https://hurricanes.ral.ucar.edu/%' THEN 1 ELSE 0 END LIMIT 1000",
      )
      .all(id, now() - 14 * 86400000);
    const points = new Map();
    for (const p of rows)
      points.set(Number(p.time), {
        time: Number(p.time),
        lat: p.lat,
        lng: p.lng,
        windKnots: p.wind_knots,
        pressureHpa: p.pressure_hpa,
      });
    return {
      points: [...points.values()].slice(-240),
      source: memory.get(id)?.source || rows.at(-1)?.source || '',
    };
  }
  return { record, history };
}
