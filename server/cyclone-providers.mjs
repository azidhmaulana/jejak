const MAX_AGE = 36 * 3600000;
export const NHC_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
export const JMA_ROOT = 'https://www.jma.go.jp/bosai/typhoon/data';
export function fresh(time, now) {
  return Number.isFinite(time) && time <= now + 3600000 && now - time <= MAX_AGE;
}
function number(value, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export function parseNhc(data, now) {
  if (!Array.isArray(data?.activeStorms) || data.activeStorms.length > 40)
    throw new Error('Invalid NHC feed');
  const items = [];
  for (const row of data.activeStorms) {
    if (
      !/^(al|ep|cp)\d{6}$/.test(row.id) ||
      !['TD', 'TS', 'HU', 'SD', 'SS'].includes(row.classification)
    )
      continue;
    const time = Date.parse(row.lastUpdate),
      lat = row.latitudeNumeric,
      lng = row.longitudeNumeric;
    if (!fresh(time, now)) continue;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      typeof row.name !== 'string'
    )
      throw new Error('Invalid NHC observation');
    items.push({
      id: row.id,
      name: row.name.slice(0, 80),
      designation: row.id.toUpperCase(),
      lat,
      lng,
      time,
      windKnots: number(row.intensity, 250),
      gustKnots: null,
      direction: number(row.movementDir, 360),
      speedKnots: number(row.movementSpeed, 150),
      agency: 'NHC',
      windPeriodMinutes: 1,
      source: NHC_URL,
    });
  }
  return { items, feedTime: items.length ? Math.max(...items.map((c) => c.time)) : null };
}
export function jmaTargets(data) {
  if (!Array.isArray(data) || data.length > 40) throw new Error('Invalid JMA feed');
  return data
    .filter((row) => row.category !== 'LOW')
    .map((row) => {
      if (
        !/^TC\d{4,20}$/.test(row.tropicalCyclone) ||
        !/^[a-zA-Z0-9]{1,12}$/.test(row.typhoonNumber)
      )
        throw new Error('Invalid JMA identifier');
      return row;
    });
}
export function parseJma(target, data, now) {
  if (!Array.isArray(data)) throw new Error('Invalid JMA bulletin');
  const observation = data.find((row) => row.part !== 'title' && row.advancedHours === 0);
  if (!observation) throw new Error('JMA analysis missing');
  const time = Date.parse(observation.validtime?.JST);
  if (!fresh(time, now)) return null;
  const [lat, lng] = observation.center ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new Error('Invalid JMA position');
  return {
    id: 'jma-' + target.tropicalCyclone,
    name: 'T' + target.typhoonNumber,
    designation: target.typhoonNumber,
    lat,
    lng,
    time,
    windKnots: null,
    gustKnots: null,
    direction: null,
    speedKnots: null,
    agency: 'JMA',
    windPeriodMinutes: 10,
    source:
      'https://www.jma.go.jp/bosai/map.html#contents=typhoon&typhoon=' + target.tropicalCyclone,
  };
}
function distance(a, b) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlon = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function mergeCyclones(items) {
  const matches = (a, b) => {
    const named =
      a.name.toUpperCase() === b.name.toUpperCase() &&
      !/^(UNNAMED|NONAME|TEST|T\d|TD)/i.test(a.name);
    return (
      a.agency !== b.agency &&
      Math.abs(a.time - b.time) <= 6 * 3600000 &&
      distance(a, b) < (named ? 400 : 150)
    );
  };
  const unambiguous = (a, b) =>
    matches(a, b) &&
    items.filter((c) => c.agency === a.agency && matches(c, b)).length === 1 &&
    items.filter((c) => c.agency === b.agency && matches(a, c)).length === 1;
  const groups = [];
  for (const item of [...items].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))) {
    const candidates = groups.filter(
      (g) => g.every((c) => c.agency !== item.agency) && g.some((c) => unambiguous(c, item)),
    );
    if (candidates.length === 1) candidates[0].push(item);
    else groups.push([item]);
  }
  return groups
    .map((group) => {
      const primary = [...group].sort(
        (a, b) =>
          b.time - a.time ||
          Number(b.windKnots !== null) - Number(a.windKnots !== null) ||
          a.id.localeCompare(b.id),
      )[0];
      const stable = [...group].sort((a, b) => a.id.localeCompare(b.id))[0];
      const named = group.find((c) => !/^T\d/.test(c.name));
      return {
        ...primary,
        id: stable.id,
        name: named?.name ?? primary.name,
        reports: group.map((c) => ({ agency: c.agency, source: c.source, time: c.time })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
