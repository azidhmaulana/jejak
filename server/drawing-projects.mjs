import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const validId = (id) =>
  (typeof id === 'string' && id.length > 0 && id.length <= 100) || Number.isSafeInteger(id);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateEntity(entity, kind, id) {
  if (!object(entity) || entity.id !== id) fail(422, 'Entity ID mismatch.');
  if (kind === 'folders') {
    if (
      typeof id !== 'string' ||
      typeof entity.name !== 'string' ||
      !entity.name.trim() ||
      entity.name.length > 80 ||
      typeof entity.visible !== 'boolean' ||
      typeof entity.collapsed !== 'boolean'
    )
      fail(422, 'Invalid folder.');
    return;
  }
  const { properties: props, geometry } = entity;
  const expected = {
    point: 'Point',
    linestring: 'LineString',
    polygon: 'Polygon',
    rectangle: 'Polygon',
    circle: 'Polygon',
  };
  if (
    entity.type !== 'Feature' ||
    !object(props) ||
    !object(geometry) ||
    !Object.hasOwn(expected, props.mode) ||
    geometry.type !== expected[props.mode]
  )
    fail(422, 'Unsupported drawing geometry.');
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) fail(422, 'Coordinates required.');
  let points;
  if (geometry.type === 'Point') points = [coordinates];
  else if (geometry.type === 'LineString') {
    if (coordinates.length < 2) fail(422, 'Line needs two points.');
    points = coordinates;
  } else {
    if (
      !coordinates.length ||
      coordinates.some(
        (ring) => !Array.isArray(ring) || ring.length < 4 || !equal(ring[0], ring.at(-1)),
      )
    )
      fail(422, 'Polygon rings must be closed.');
    points = coordinates.flat();
  }
  if (
    points.length > 20000 ||
    points.some(
      (point) =>
        !Array.isArray(point) ||
        point.length < 2 ||
        !point.every(Number.isFinite) ||
        Math.abs(point[0]) > 180 ||
        Math.abs(point[1]) > 90,
    )
  )
    fail(422, 'Invalid coordinates.');
  if (
    props.currentlyDrawing ||
    typeof (props.bmsFolderId ?? '') !== 'string' ||
    ('bmsLocked' in props && typeof props.bmsLocked !== 'boolean') ||
    !['none', 'guard', 'white'].includes(props.bmsZone ?? 'none') ||
    String(props.bmsName ?? '').length > 100 ||
    String(props.bmsNotes ?? '').length > 2000
  )
    fail(422, 'Invalid drawing metadata.');
}

export function applyChanges(project, changes) {
  if (
    !object(changes) ||
    changes.version !== 2 ||
    Object.keys(changes).some((key) => !['version', 'features', 'folders'].includes(key))
  )
    fail(422, 'Invalid project changes.');
  const next = structuredClone(project);
  for (const kind of ['folders', 'features']) {
    const edits = changes[kind];
    if (!Array.isArray(edits) || edits.length > (kind === 'folders' ? 1000 : 10000))
      fail(422, 'Too many changes.');
    const seen = new Set();
    const entities = new Map(next[kind].map((entity) => [entity.id, entity]));
    for (const edit of edits) {
      if (
        !object(edit) ||
        !validId(edit.id) ||
        seen.has(edit.id) ||
        !Object.hasOwn(edit, 'before') ||
        !Object.hasOwn(edit, 'after')
      )
        fail(422, 'Invalid or duplicate change ID.');
      seen.add(edit.id);
      for (const entity of [edit.before, edit.after])
        if (entity !== null) validateEntity(entity, kind, edit.id);
      const current = entities.get(edit.id) ?? null;
      if (equal(current, edit.after)) continue; // Exact retries are idempotent.
      if (!equal(current, edit.before)) fail(409, 'Object changed in another client.');
      if (kind === 'features' && current?.properties.bmsLocked) {
        const visibleOnly = structuredClone(current);
        visibleOnly.properties.bmsVisible = edit.after?.properties.bmsVisible ?? true;
        const unlocking = edit.after && !edit.after.properties.bmsLocked;
        if (!unlocking && !equal(edit.after, visibleOnly))
          fail(409, 'Unlock this object before editing.');
      }
      if (edit.after === null) entities.delete(edit.id);
      else entities.set(edit.id, structuredClone(edit.after));
    }
    next[kind] = [...entities.values()];
  }
  const folders = new Set(next.folders.map((folder) => folder.id));
  for (const feature of next.features) {
    if (folders.has(feature.properties.bmsFolderId)) continue;
    if (feature.properties.bmsLocked && feature.properties.bmsFolderId)
      fail(409, 'Folder contains locked objects.');
    feature.properties.bmsFolderId = '';
  }
  if (
    next.features.length > 10000 ||
    next.folders.length > 1000 ||
    Buffer.byteLength(JSON.stringify(next)) > 8_000_000
  )
    fail(413, 'Project storage limit exceeded.');
  return next;
}

/** One process owns each data directory. Writes are serialized and atomically renamed. */
export function createDrawingStore(directory) {
  const file = path.join(directory, 'osint-project.json');
  let queue = Promise.resolve();
  const read = async () => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 2, features: [], folders: [] };
      throw error;
    }
  };
  return {
    read,
    patch(changes) {
      const work = queue.then(async () => {
        const current = await read();
        const next = applyChanges(current, changes);
        if (equal(current, next)) return current;
        await mkdir(directory, { recursive: true });
        await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
        await rename(file + '.tmp', file);
        return next;
      });
      queue = work.catch(() => {});
      return work;
    },
  };
}
