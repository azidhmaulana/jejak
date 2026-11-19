import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { hsdPixel, interpolateTemperature, temperatureColor } from './himawari-hsd.mjs';

export function readHsdWorkerMessage(message) {
  if (message?.error) throw new Error(String(message.error));
  const result = message?.result;
  if (!result || !(result.pixels instanceof Uint8Array) || !result.pixels.byteLength)
    throw new Error('Invalid HSD decoder response');
  return { ...result, pixels: Buffer.from(result.pixels) };
}

export function createTemperatureRenderer({ download, fetcher, withTileSlot, now = Date.now }) {
  const cache = new Map(),
    pending = new Map(),
    geometry = new Map();
  let bytes = 0,
    decoders = 0;
  const queue = [];
  async function decode(body) {
    if (queue.length >= 16) throw new Error('HSD decoder busy');
    if (decoders >= 2) await new Promise((resolve) => queue.push(resolve));
    else decoders++;
    try {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./himawari-hsd-worker.mjs', import.meta.url), {
          workerData: body,
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 96 },
        });
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new Error('HSD decode timeout'));
        }, 15000);
        worker.once('message', (message) => {
          clearTimeout(timer);
          void worker.terminate();
          try {
            resolve(readHsdWorkerMessage(message));
          } catch (error) {
            reject(error);
          }
        });
        worker.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        worker.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`HSD decoder stopped before a result (${code})`));
        });
      });
    } finally {
      const next = queue.shift();
      if (next) next();
      else decoders--;
    }
  }
  async function segment(frame, number) {
    const key = `${frame}/${number}`,
      saved = cache.get(key);
    if (saved && saved.until > now()) {
      if (!saved.data) throw new Error('HSD source unavailable');
      return saved.data;
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 16) throw new Error('HSD source busy');
    const task = (async () => {
      let data;
      try {
        const day = frame.slice(0, 8),
          hhmm = frame.slice(8, 12),
          part = String(number).padStart(2, '0');
        const url = `https://noaa-himawari9.s3.amazonaws.com/AHI-L1b-FLDK/${day.slice(0, 4)}/${day.slice(4, 6)}/${day.slice(6, 8)}/${hhmm}/HS_H09_${day}_${hhmm}_B13_FLDK_R20_S${part}10.DAT.bz2`;
        const result = await withTileSlot(() => download(url, 7000000, fetcher));
        if (result.body.subarray(0, 3).toString() !== 'BZh')
          throw new Error('Invalid HSD response');
        const decoded = await decode(result.body);
        if (
          decoded.number !== number ||
          decoded.filename !== `HS_H09_${day}_${hhmm}_B13_FLDK_R20_S${part}10.DAT`
        )
          throw new Error('Wrong HSD segment');
        data = decoded;
        return data;
      } finally {
        pending.delete(key);
        if (cache.has(key)) bytes -= cache.get(key).data?.pixels.length || 0;
        cache.delete(key);
        cache.set(key, { data, until: now() + (data ? 1800000 : 30000) });
        bytes += data?.pixels.length || 0;
        while (bytes > 96 * 1024 * 1024 || cache.size > 160) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).data?.pixels.length || 0;
          cache.delete(oldest);
        }
      }
    })();
    pending.set(key, task);
    return task;
  }
  return async function render(frame, z, x, y) {
    if (
      !/^\d{12}00$/.test(frame) ||
      !Number.isInteger(z) ||
      z < 3 ||
      z > 8 ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= 2 ** z ||
      y >= 2 ** z
    )
      throw new Error('Invalid temperature tile');
    const reference = await segment(frame, 6),
      size = 512,
      n = 2 ** z;
    const key = JSON.stringify([reference.nav, z, x, y]);
    let grid = geometry.get(key);
    if (!grid) {
      const coordinates = new Float32Array(size * size * 2);
      coordinates.fill(-1);
      const needed = new Set();
      for (let row = 0; row < size; row++) {
        const lat =
          (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (row + 0.5) / size)) / n))) * 180) /
          Math.PI;
        for (let col = 0; col < size; col++) {
          const lng = ((x + (col + 0.5) / size) / n) * 360 - 180,
            point = hsdPixel(lat, lng, reference.nav)?.map(Math.fround);
          if (!point || point[0] < 0 || point[1] < 0 || point[0] >= 5499 || point[1] >= 5499)
            continue;
          coordinates[(row * size + col) * 2] = point[0];
          coordinates[(row * size + col) * 2 + 1] = point[1];
          needed.add(Math.floor(Math.floor(point[1]) / 550) + 1);
          needed.add(Math.floor((Math.floor(point[1]) + 1) / 550) + 1);
        }
      }
      grid = { coordinates, needed };
      geometry.set(key, grid);
      while (geometry.size > 12) geometry.delete(geometry.keys().next().value);
    }
    const segments = new Map(
      await Promise.all(
        [...grid.needed].map(async (number) => [number, await segment(frame, number)]),
      ),
    );
    const sample = (col, row) => {
      const part = segments.get(Math.floor(row / 550) + 1),
        index = ((row - (part.firstLine - 1)) * 5500 + col) * 2;
      const count = part.pixels.readUInt16LE(index);
      return part.temperatures[count] ?? NaN;
    };
    const output = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const px = grid.coordinates[i * 2],
        py = grid.coordinates[i * 2 + 1];
      if (px < 0) continue;
      const col = Math.floor(px),
        row = Math.floor(py);
      const value = interpolateTemperature(
        [sample(col, row), sample(col + 1, row), sample(col, row + 1), sample(col + 1, row + 1)],
        px - col,
        py - row,
      );
      output.set(temperatureColor(value), i * 4);
    }
    return sharp(output, { raw: { width: size, height: size, channels: 4 } })
      .png({ compressionLevel: 3 })
      .toBuffer();
  };
}
