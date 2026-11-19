import sharp from 'sharp';

const TILE = 688;
// CIRA Himawari full-disk navigation: 140.69 E, satellite radius 42171.7 km.
// Scan extent and disk radii are published in SLIDER's sector metadata.
export function satellitePixel(lat, lng, level = 3) {
  const rad = Math.PI / 180,
    phi = lat * rad,
    lambda = (lng - 140.69) * rad;
  const e2 = 0.00669438002301184,
    a = 6378.137,
    h = 42171.7;
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const X = n * Math.cos(phi) * Math.cos(lambda);
  const Y = n * Math.cos(phi) * Math.sin(lambda);
  const Z = n * (1 - e2) * Math.sin(phi);
  if (h * X < X * X + Y * Y + (Z * Z) / (1 - e2)) return null;
  const distance = Math.hypot(h - X, Y, Z);
  const sx = Math.asin(Y / distance),
    sy = Math.atan2(Z, h - X);
  const scale = 2 ** level;
  return [
    (TILE * scale) / 2 + 0.5 + (sx / 0.150618) * 337 * scale,
    (TILE * scale) / 2 + 0.5 - (sy / 0.150485) * 336 * scale,
  ];
}

export function createSatelliteDetail({ download, fetcher, withTileSlot, now = Date.now }) {
  const cache = new Map(),
    pending = new Map();
  let bytes = 0;
  const geometryCache = new Map();
  async function tile(frame, level, row, col, product) {
    const key = `${product}/${frame}/${level}/${row}/${col}`;
    const saved = cache.get(key);
    if (saved && saved.until > now()) {
      if (!saved.data) throw new Error('Satellite detail unavailable');
      return saved.data;
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 64) throw new Error('Satellite detail busy');
    const request = (async () => {
      let data;
      try {
        const pad = (n, length) => String(n).padStart(length, '0');
        const url = `https://slider.cira.colostate.edu/data/imagery/${frame.slice(0, 4)}/${frame.slice(4, 6)}/${frame.slice(6, 8)}/himawari---full_disk/${product}/${frame}/${pad(level, 2)}/${pad(row, 3)}_${pad(col, 3)}.png`;
        const result = await withTileSlot(() => download(url, 2500000, fetcher));
        if (!result.type.startsWith('image/png')) throw new Error('Invalid detail image');
        const decoded = await sharp(result.body, { limitInputPixels: TILE * TILE })
          .removeAlpha()
          .toColourspace('srgb')
          .raw()
          .toBuffer({ resolveWithObject: true });
        if (
          decoded.info.width !== TILE ||
          decoded.info.height !== TILE ||
          decoded.info.channels !== 3
        )
          throw new Error('Invalid detail size');
        data = decoded.data;
        return data;
      } finally {
        pending.delete(key);
        if (cache.has(key)) bytes -= cache.get(key).data?.length || 0;
        cache.delete(key);
        cache.set(key, { data, until: now() + (data ? 1800000 : 30000) });
        bytes += data?.length || 0;
        while (bytes > 64 * 1024 * 1024 || cache.size > 256) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).data?.length || 0;
          cache.delete(oldest);
        }
      }
    })();
    pending.set(key, request);
    return request;
  }
  return async function render(frame, z, x, y, product = 'band_13') {
    if (!['band_13', 'geocolor'].includes(product)) throw new Error('Invalid detail product');
    const level = Math.min(product === 'geocolor' ? 4 : 3, Math.max(0, z - 1));
    const size = 512,
      scale = 2 ** z,
      full = TILE * 2 ** level;
    const geometryKey = `${level}/${z}/${x}/${y}`;
    let geometry = geometryCache.get(geometryKey);
    if (!geometry) {
      const locations = new Float32Array(size * size * 2),
        required = new Set();
      locations.fill(-1);
      for (let row = 0; row < size; row++) {
        const lat =
          (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (row + 0.5) / size)) / scale))) * 180) /
          Math.PI;
        for (let col = 0; col < size; col++) {
          const lng = ((x + (col + 0.5) / size) / scale) * 360 - 180;
          const point = satellitePixel(lat, lng, level)?.map(Math.fround);
          if (
            !point ||
            point[0] < 0 ||
            point[1] < 0 ||
            point[0] >= full - 1 ||
            point[1] >= full - 1
          )
            continue;
          const index = (row * size + col) * 2;
          locations[index] = point[0];
          locations[index + 1] = point[1];
          for (const dy of [0, 1])
            for (const dx of [0, 1])
              required.add(
                `${Math.floor((Math.floor(point[1]) + dy) / TILE)},${Math.floor((Math.floor(point[0]) + dx) / TILE)}`,
              );
        }
      }
      if (required.size > 16) throw new Error('Detail request too large');
      geometry = { locations, required };
      geometryCache.set(geometryKey, geometry);
      while (geometryCache.size > 12) geometryCache.delete(geometryCache.keys().next().value);
    }
    const { locations, required } = geometry;
    const tiles = new Map(
      await Promise.all(
        [...required].map(async (key) => {
          const [row, col] = key.split(',').map(Number);
          return [key, await tile(frame, level, row, col, product)];
        }),
      ),
    );
    const output = Buffer.alloc(size * size * 4);
    const sample = (x, y, c) =>
      tiles.get(`${Math.floor(y / TILE)},${Math.floor(x / TILE)}`)[
        ((y % TILE) * TILE + (x % TILE)) * 3 + c
      ];
    for (let i = 0; i < size * size; i++) {
      const px = locations[i * 2],
        py = locations[i * 2 + 1];
      if (px < 0) continue;
      const x0 = Math.floor(px),
        y0 = Math.floor(py),
        fx = px - x0,
        fy = py - y0;
      for (let c = 0; c < 3; c++)
        output[i * 4 + c] = Math.round(
          sample(x0, y0, c) * (1 - fx) * (1 - fy) +
            sample(x0 + 1, y0, c) * fx * (1 - fy) +
            sample(x0, y0 + 1, c) * (1 - fx) * fy +
            sample(x0 + 1, y0 + 1, c) * fx * fy,
        );
      output[i * 4 + 3] = 255;
    }
    return sharp(output, { raw: { width: size, height: size, channels: 4 } })
      .png({ compressionLevel: 3 })
      .toBuffer();
  };
}
