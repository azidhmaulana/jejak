import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCamera, createCameraHealthMonitor } from '../server/osint-camera-health.mjs';
import { cameraMediaUrl } from '../server/osint-camera-media.mjs';
const id = 'bandung-atcs-76',
  base = cameraMediaUrl(id, 'index.m3u8');
test('health checks a segment, not just HTTP success on a playlist', async () => {
  const calls = [];
  const result = await probeCamera(id, base, {
    fetcher: async (u, options) => {
      calls.push({ u: String(u), options });
      return String(u).endsWith('.m3u8')
        ? new Response('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:12\n#EXT-X-TARGETDURATION:2\nclip.ts')
        : new Response(new Uint8Array([0x47, 1, 2, 3]));
    },
  });
  assert.equal(result.fingerprint, '12|clip.ts');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Range, 'bytes=0-1023');
  await assert.rejects(
    probeCamera(id, base, { fetcher: async () => new Response('<html>Error</html>') }),
  );
  await assert.rejects(
    probeCamera(id, base, {
      fetcher: async () => new Response('#EXTM3U\nhttps://example.com/clip.ts'),
    }),
  );
});
test('monitor bounds concurrency and confirms failure then recovery', async (t) => {
  let at = 10000,
    fail = true,
    active = 0,
    max = 0;
  const catalogue = new Map(
    Array.from({ length: 6 }, (_, i) => ['id' + i, new URL('https://example.com/' + i)]),
  );
  const monitor = createCameraHealthMonitor({
    catalogue,
    now: () => at,
    interval: 100,
    probe: async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (fail) throw Error('timeout');
      return { fingerprint: String(at), staleAfter: 90000 };
    },
  });
  t.after(() => monitor.close());
  for (let i = 0; i < 3; i++) {
    monitor.snapshot();
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(monitor.snapshot().checked, 6);
  assert.equal(max, 2);
  assert.equal(monitor.snapshot().health.id0.status, 'unknown');
  at += 200;
  monitor.snapshot();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(monitor.snapshot().health.id0.status, 'offline');
  fail = false;
  at += 200;
  monitor.snapshot();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(monitor.snapshot().health.id0.status, 'offline');
  assert.equal(monitor.retry('id0'), true);
  assert.equal(monitor.retry('id0'), false);
  for (let i = 0; i < 4; i++) {
    monitor.snapshot();
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(monitor.snapshot().health.id0.status, 'online');
});

test('unsupported playlist references remain unknown after repeated probes', async (t) => {
  let at = 10000;
  const monitor = createCameraHealthMonitor({
    catalogue: new Map([[id, base]]),
    now: () => at,
    interval: 100,
    probe: async () => {
      throw Error('Unsupported reference');
    },
  });
  t.after(() => monitor.close());
  for (let i = 0; i < 3; i++) {
    monitor.snapshot();
    await new Promise((r) => setTimeout(r, 1));
    at += 200;
  }
  assert.equal(monitor.snapshot().health[id].status, 'unknown');
  assert.match(monitor.snapshot().health[id].reason, /belum didukung/);
});
