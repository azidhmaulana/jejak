import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database/index.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCameraSources } from '../server/camera-sources.mjs';
test('source activation survives database reopening and filters cameras by provider', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jejak-sources-'));
  let db = await createDatabase(dir);
  try {
    const sources = createCameraSources(db);
    assert.equal(await sources.enabled({}), true);
    await sources.update('ATCS DISHUB BANDUNG', false);
    assert.equal(await sources.enabled({}), false);
    assert.equal(await sources.enabled({ provider: 'ATCS KBB' }), true);
    await db.close();
    db = await createDatabase(dir);
    const reopened = createCameraSources(db);
    assert.equal((await reopened.state())['ATCS DISHUB BANDUNG'], false);
    await reopened.update('ATCS DISHUB BANDUNG', true);
    assert.equal(await reopened.enabled({}), true);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
