import { cameraCatalogs } from './camera-catalog.mjs';
const sourceCities = {
  'ATCS DISHUB BANDUNG': 'Kota Bandung',
  'PELINDUNG BANDUNG': 'Kota Bandung',
  'DISHUB KABUPATEN BANDUNG': 'Kabupaten Bandung',
  'ATCS KBB': 'Kabupaten Bandung Barat',
  'CCTV CIMAHI': 'Kota Cimahi',
};

export function cameraSourceCatalog() {
  const groups = new Map();
  for (const catalog of cameraCatalogs) {
    for (const camera of catalog.cameras) {
      if (camera.kind !== 'camera') continue;
      const name = camera.provider || 'ATCS DISHUB BANDUNG';
      if (!groups.has(name))
        groups.set(name, {
          name,
          province: camera.province || catalog.province || '',
          city: camera.city || catalog.city || sourceCities[name] || '',
          cameraCount: 0,
          feedCount: 0,
          linkOnlyCount: 0,
          origins: new Set(),
          retrievedAt: catalog.retrievedAt,
        });
      const group = groups.get(name);
      group.cameraCount++;
      if (camera.streamUrl || camera.previewUrl) group.feedCount++;
      else group.linkOnlyCount++;
      group.origins.add(new URL(camera.url).origin);
    }
  }
  const sources = [...groups.values()]
    .map((group) => ({ ...group, origins: [...group.origins] }))
    .sort((a, b) => b.cameraCount - a.cameraCount);
  return {
    sources,
    sourceCount: sources.length,
    cameraCount: sources.reduce((n, source) => n + source.cameraCount, 0),
    feedCount: sources.reduce((n, source) => n + source.feedCount, 0),
  };
}

export function createCameraSources(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS camera_sources (name TEXT PRIMARY KEY, active INTEGER NOT NULL)',
  );
  const catalog = cameraSourceCatalog();
  const known = new Set(catalog.sources.map((source) => source.name));
  const state = () =>
    Object.fromEntries(
      catalog.sources.map(({ name }) => [
        name,
        db.prepare('SELECT active FROM camera_sources WHERE name=?').get(name)?.active !== 0,
      ]),
    );
  return {
    state,
    catalog: () => {
      const active = state();
      return {
        ...catalog,
        sources: catalog.sources.map((source) => ({ ...source, active: active[source.name] })),
      };
    },
    enabled: (camera) =>
      db
        .prepare('SELECT active FROM camera_sources WHERE name=?')
        .get(camera.provider || 'ATCS DISHUB BANDUNG')?.active !== 0,
    update(name, active) {
      if (!known.has(name)) throw Object.assign(new Error('Source not found.'), { status: 404 });
      if (typeof active !== 'boolean')
        throw Object.assign(new Error('Active must be a boolean.'), { status: 400 });
      db.prepare(
        'INSERT INTO camera_sources VALUES (?,?) ON CONFLICT(name) DO UPDATE SET active=excluded.active',
      ).run(name, Number(active));
      return this.catalog();
    },
  };
}
