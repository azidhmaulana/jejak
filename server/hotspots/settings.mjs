import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const providers = [
  {
    id: 'firms',
    name: 'NASA FIRMS',
    kind: 'points',
    keyRequired: true,
    url: 'https://firms.modaps.eosdis.nasa.gov/',
    endpoint: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/',
  },
  {
    id: 'sipongi',
    name: 'SIPONGI',
    kind: 'points',
    keyRequired: false,
    url: 'https://sipongi.gakkum.kehutanan.go.id/peta',
    endpoint: 'https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot',
  },
  {
    id: 'bmkg',
    name: 'BMKG',
    kind: 'image',
    keyRequired: false,
    url: 'https://www.bmkg.go.id/cuaca/satelit/polar-hotspot',
    endpoint: 'https://inderaja.bmkg.go.id/IMAGE/HOTSPOT/Hotspot_Indonesia.png',
  },
];
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function secretCodec(key) {
  if (!/^[a-f0-9]{64}$/i.test(key || ''))
    throw Error('JEJAK_SOURCE_SECRET_KEY must be 32 bytes in hex.');
  const bytes = Buffer.from(key, 'hex');
  return {
    seal(value, id) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', bytes, iv);
      cipher.setAAD(Buffer.from(id));
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
    },
    open(value, id) {
      const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64'));
      const cipher = createDecipheriv('aes-256-gcm', bytes, iv);
      cipher.setAAD(Buffer.from(id));
      cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
    },
  };
}
export function createHotspotSettings(db, directory) {
  const file = path.join(directory, 'source-secret.key');
  let key = process.env.JEJAK_SOURCE_SECRET_KEY;
  if (!key) {
    mkdirSync(directory, { recursive: true });
    if (!existsSync(file))
      writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    key = readFileSync(file, 'utf8').trim();
  }
  const codec = secretCodec(key);
  const read = async (id) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) throw fail('Unknown hotspot source.', 404);
    const row = await db.prepare('SELECT * FROM hotspot_sources WHERE id=?').get(id);
    return {
      ...provider,
      active: row?.active ?? true,
      secret: row?.secret || '',
      version: row?.updated_at || 0,
    };
  };
  const publicRow = (row) => {
    const { secret, version, ...info } = row;
    return {
      ...info,
      configured: !row.keyRequired || Boolean(secret),
      hasKey: Boolean(secret),
      updatedAt: version || null,
    };
  };
  return {
    read,
    reveal: (row) => (row.secret ? codec.open(row.secret, row.id) : ''),
    list: async () => Promise.all(providers.map(async (p) => publicRow(await read(p.id)))),
    async update(id, body) {
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => !['active', 'apiKey', 'clearKey'].includes(k))
      )
        throw fail('Invalid source settings.');
      if (
        typeof body.active !== 'boolean' ||
        (body.clearKey !== undefined && typeof body.clearKey !== 'boolean')
      )
        throw fail('Invalid source settings.');
      const row = await read(id);
      if (
        body.apiKey !== undefined &&
        (typeof body.apiKey !== 'string' || !/^[a-f0-9]{32}$/i.test(body.apiKey))
      )
        throw fail('FIRMS MAP_KEY must contain 32 hexadecimal characters.');
      if (!row.keyRequired && (body.apiKey !== undefined || body.clearKey))
        throw fail('This public source does not use an API key.');
      if (body.clearKey && body.apiKey) throw fail('Choose replace or remove key.');
      const secret = body.clearKey ? '' : body.apiKey ? codec.seal(body.apiKey, id) : row.secret;
      await db
        .prepare(
          'INSERT INTO hotspot_sources(id,active,secret,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,secret=excluded.secret,updated_at=GREATEST(hotspot_sources.updated_at+1,excluded.updated_at)',
        )
        .run(id, body.active, secret, Date.now());
      return publicRow(await read(id));
    },
  };
}
