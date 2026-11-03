import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyChanges, createDrawingStore } from '../server/drawing-projects.mjs';

const empty = () => ({ version: 2, features: [], folders: [] });
const point = (id = 'one') => ({
  id,
  type: 'Feature',
  properties: { mode: 'point', bmsFolderId: '' },
  geometry: { type: 'Point', coordinates: [107.6, -6.9] },
});
const edit = (before, after) => ({
  version: 2,
  folders: [],
  features: [{ id: (before || after).id, before, after }],
});

test('drawings persist across restart, retry idempotently, and merge independent concurrent edits', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jejak-drawings-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createDrawingStore(dir);
  const changes = edit(null, point());
  await Promise.all([store.patch(changes), store.patch(edit(null, point('two')))]);
  await store.patch(changes);
  assert.equal((await createDrawingStore(dir).read()).features.length, 2);
  await assert.rejects(
    store.patch(edit(null, { ...point(), properties: { mode: 'point', bmsName: 'conflict' } })),
    { status: 409 },
  );
  assert.equal((await store.read()).features.length, 2);
});

test('locks prevent deletion; malformed coordinates and duplicate IDs are rejected atomically', () => {
  const locked = point();
  locked.properties.bmsLocked = true;
  const project = applyChanges(empty(), edit(null, locked));
  assert.throws(() => applyChanges(project, edit(locked, null)), { status: 409 });
  const bad = point();
  bad.geometry.coordinates = [190, 0];
  assert.throws(() => applyChanges(project, edit(null, bad)), { status: 422 });
  const duplicate = edit(null, point());
  duplicate.features.push(duplicate.features[0]);
  assert.throws(() => applyChanges(empty(), duplicate), { status: 422 });
  assert.equal(project.features.length, 1);
});

test('stale multi-entity patch never partially commits and deleted folders detach unlocked drawings', () => {
  const folder = { id: 'folder', name: 'Group', visible: true, collapsed: false };
  const feature = point();
  feature.properties.bmsFolderId = folder.id;
  const original = { version: 2, folders: [folder], features: [feature] };
  const changes = edit(null, point('two'));
  changes.features.push({ id: feature.id, before: null, after: point() });
  assert.throws(() => applyChanges(original, changes), { status: 409 });
  assert.equal(original.features.length, 1);
  const next = applyChanges(original, {
    version: 2,
    folders: [{ id: folder.id, before: folder, after: null }],
    features: [],
  });
  assert.equal(next.features[0].properties.bmsFolderId, '');
});
