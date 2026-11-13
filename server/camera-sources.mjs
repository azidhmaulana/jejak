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
  const catalog = cameraSourceCatalog();
  const known = new Set(catalog.sources.map((source) => source.name));
  const state = async () => {
    const rows = await db.prepare('SELECT name,active FROM camera_sources').all();
    const active = new Map(rows.map((row) => [row.name, row.active !== 0]));
    return Object.fromEntries(
      catalog.sources.map(({ name }) => [name, active.get(name) !== false]),
    );
  };
  return {
    state,
    catalog: async () => {
      const active = await state();
      return {
        ...catalog,
        sources: catalog.sources.map((source) => ({ ...source, active: active[source.name] })),
      };
    },
    predicate: async () => {
      const active = await state();
      return (camera) => active[camera.provider || 'ATCS DISHUB BANDUNG'] !== false;
    },
    enabled: async (camera) => (await state())[camera.provider || 'ATCS DISHUB BANDUNG'] !== false,
    async update(name, active) {
      if (!known.has(name)) throw Object.assign(new Error('Source not found.'), { status: 404 });
      if (typeof active !== 'boolean')
        throw Object.assign(new Error('Active must be a boolean.'), { status: 400 });
      await db
        .prepare(
          'INSERT INTO camera_sources VALUES (?,?) ON CONFLICT(name) DO UPDATE SET active=excluded.active',
        )
        .run(name, Number(active));
      return this.catalog();
    },
  };
}
