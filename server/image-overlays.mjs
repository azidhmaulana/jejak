import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const error = (status, message) => Object.assign(new Error(message), { status });
export function validateOverlay(input) {
  if (!input || typeof input !== 'object') throw error(400, 'Invalid overlay.');
  const {
    name,
    description = '',
    image,
    west,
    east,
    south,
    north,
    rotation = 0,
    opacity = 0.7,
  } = input;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 100 ||
    typeof description !== 'string' ||
    description.length > 2000
  )
    throw error(400, 'Enter a name (up to 100 characters) and description (up to 2000).');
  if (
    ![west, east, south, north, rotation, opacity].every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    west >= east ||
    south < -85 ||
    north > 85 ||
    south >= north ||
    rotation < -180 ||
    rotation > 180 ||
    opacity < 0 ||
    opacity > 1
  )
    throw error(400, 'Invalid bounding box, rotation or opacity.');
  if (
    typeof image !== 'string' ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image) ||
    image.length > 5600000
  )
    throw error(400, 'Use a PNG image up to 4 MB.');
  const bytes = Buffer.from(image.split(',')[1], 'base64');
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.subarray(12, 16).toString() !== 'IHDR' ||
    bytes.readUInt32BE(16) < 1 ||
    bytes.readUInt32BE(20) < 1 ||
    bytes.readUInt32BE(16) > 4096 ||
    bytes.readUInt32BE(20) > 4096
  )
    throw error(400, 'Invalid PNG or dimensions above 4096 pixels.');
  return { name: name.trim(), description, image, west, east, south, north, rotation, opacity };
}
export function createOverlayStore(directory) {
  const file = path.join(directory, 'image-overlays.json');
  let queue = Promise.resolve();
  const read = async () => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  };
  return {
    read,
    mutate(id, method, input) {
      const work = queue.then(async () => {
        if (!input || typeof input !== 'object') throw error(400, 'Invalid overlay request.');
        const items = await read(),
          index = items.findIndex((x) => x.id === id),
          old = items[index];
        if (id && !old) throw error(404, 'Overlay not found.');
        if (old && input.revision !== old.revision)
          throw error(409, 'Overlay changed. Reopen it before saving.');
        if (method === 'DELETE') {
          if (old.locked) throw error(409, 'Unlock this overlay before deleting.');
          items.splice(index, 1);
        } else if (method === 'PATCH') {
          if (
            typeof input.locked !== 'boolean' ||
            Object.keys(input).some((k) => !['locked', 'revision'].includes(k))
          )
            throw error(400, 'Invalid lock request.');
          items[index] = { ...old, locked: input.locked, revision: randomUUID() };
        } else {
          if (old?.locked) throw error(409, 'Unlock this overlay before editing.');
          const data = validateOverlay(input),
            item = {
              ...data,
              id: id || randomUUID(),
              locked: false,
              revision: randomUUID(),
              updatedAt: Date.now(),
            };
          if (id) items[index] = item;
          else {
            if (items.length >= 30) throw error(400, 'Maximum 30 overlays.');
            items.push(item);
          }
        }
        const contents = JSON.stringify(items);
        if (Buffer.byteLength(contents) > 50000000)
          throw error(413, 'Overlay storage limit reached (50 MB).');
        await mkdir(directory, { recursive: true });
        const temp = file + '.tmp';
        await writeFile(temp, contents, { mode: 0o600 });
        await rename(temp, file);
        return items;
      });
      queue = work.catch(() => {});
      return work;
    },
  };
}
