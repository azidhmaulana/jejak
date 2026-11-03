import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';

test('standalone API serves project, overlay and offline contracts and rejects cross-site writes', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jejak-api-'));
  const app = await createApp({ directory });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app.locals.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(base + '/api/osint/map-overlays')).json(), { items: [] });
  assert.ok(
    Array.isArray((await (await fetch(base + '/api/offline-maps/regions')).json()).regions),
  );
  const changes = {
    version: 2,
    features: [],
    folders: [
      {
        id: 'a',
        before: null,
        after: { id: 'a', name: 'Browser folder', visible: true, collapsed: false },
      },
    ],
  };
  const options = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  };
  assert.equal((await fetch(base + '/api/bms/projects/osint', options)).status, 200);
  assert.equal(
    (await (await fetch(base + '/api/bms/projects/osint')).json()).folders[0].name,
    'Browser folder',
  );
  assert.equal(
    (
      await fetch(base + '/api/bms/projects/osint', {
        ...options,
        headers: { ...options.headers, Origin: 'https://other.example' },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(base + '/api/motor')).status, 404);
});
