import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCameraSources } from '../server/camera-sources.mjs';
test('source activation survives database reopening and filters cameras by provider', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jejak-sources-'));
  let db = new DatabaseSync(path.join(dir, 'sources.sqlite'));
  try {
    const sources = createCameraSources(db);
    assert.equal(sources.enabled({}), true);
    sources.update('ATCS DISHUB BANDUNG', false);
    assert.equal(sources.enabled({}), false);
    assert.equal(sources.enabled({ provider: 'ATCS KBB' }), true);
    db.close();
    db = new DatabaseSync(path.join(dir, 'sources.sqlite'));
    const reopened = createCameraSources(db);
    assert.equal(reopened.state()['ATCS DISHUB BANDUNG'], false);
    reopened.update('ATCS DISHUB BANDUNG', true);
    assert.equal(reopened.enabled({}), true);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
