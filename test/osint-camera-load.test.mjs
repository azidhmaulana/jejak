import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { serveOsintCameraMedia, mediaResourcePath } from '../server/osint-camera-media.mjs';
import { createCameraHealthMonitor } from '../server/osint-camera-health.mjs';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  '100 simultaneous media requests enforce cap, release slots, and recover',
  { timeout: 15000 },
  async (t) => {
    let active = 0,
      peak = 0,
      total = 0,
      release;
    const gate = new Promise((r) => (release = r));
    let hold = true;
    const server = createServer(
      (req, res) =>
        void serveOsintCameraMedia(req, res, async (_url, { signal }) => {
          active++;
          peak = Math.max(peak, active);
          total++;
          try {
            if (hold)
              await Promise.race([
                gate,
                new Promise((_, reject) =>
                  signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
                ),
              ]);
            return new Response(new Uint8Array(65536));
          } finally {
            active--;
          }
        }),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      release();
      server.closeAllConnections();
      server.close();
    });
    const url =
      'http://127.0.0.1:' +
      server.address().port +
      mediaResourcePath('bandung-atcs-76', 'segment.ts');
    const started = performance.now(),
      rss = process.memoryUsage().rss;
    const tasks = Array.from({ length: 100 }, async () => {
      const r = await fetch(url);
      await r.arrayBuffer();
      return r.status;
    });
    await pause(500);
    assert.equal(peak, 20);
    release();
    const statuses = await Promise.all(tasks);
    assert.equal(statuses.filter((x) => x === 200).length, 20);
    assert.equal(statuses.filter((x) => x === 503).length, 80);
    assert.equal(total, 20);
    hold = false;
    const recovered = await fetch(url);
    assert.equal(recovered.status, 200);
    await recovered.arrayBuffer();
    console.log(
      JSON.stringify({
        scenario: 'media burst',
        requests: 100,
        peakUpstream: peak,
        ok: 20,
        busy: 80,
        recovery: recovered.status,
        elapsedMs: Math.round(performance.now() - started),
        rssDeltaMiB: Math.round((process.memoryUsage().rss - rss) / 1048576),
      }),
    );
  },
);
test('many health clients share four probes and do not duplicate in-flight camera work', async (t) => {
  let active = 0,
    peak = 0,
    total = 0,
    release;
  const hostActive = new Map(),
    hostPeak = new Map(),
    ids = new Set();
  const gate = new Promise((r) => (release = r));
  const catalogue = new Map(
    Array.from({ length: 495 }, (_, i) => [
      'cam' + i,
      new URL('https://host' + (i % 4) + '.example/' + i),
    ]),
  );
  const monitor = createCameraHealthMonitor({
    catalogue,
    probe: async (id, url) => {
      assert.ok(!ids.has(id));
      ids.add(id);
      total++;
      active++;
      peak = Math.max(peak, active);
      hostActive.set(url.host, (hostActive.get(url.host) || 0) + 1);
      hostPeak.set(url.host, Math.max(hostPeak.get(url.host) || 0, hostActive.get(url.host)));
      await gate;
      active--;
      hostActive.set(url.host, hostActive.get(url.host) - 1);
      return { fingerprint: id, staleAfter: 90000 };
    },
  });
  t.after(() => {
    release();
    monitor.close();
  });
  const start = performance.now();
  for (let i = 0; i < 1000; i++) monitor.snapshot();
  assert.equal(total, 4);
  assert.equal(peak, 4);
  for (const n of hostPeak.values()) assert.ok(n <= 2);
  console.log(
    JSON.stringify({
      scenario: 'health burst',
      clients: 1000,
      catalogue: 495,
      probes: total,
      peak,
      elapsedMs: Math.round(performance.now() - start),
    }),
  );
  release();
  await pause(5);
});

test(
  'disconnect cancels upstream; repeated batches do not exhaust slots',
  { timeout: 15000 },
  async (t) => {
    let cancelled = 0,
      started = 0,
      stall = true;
    const server = createServer(
      (req, res) =>
        void serveOsintCameraMedia(req, res, async (_url, { signal }) => {
          started++;
          if (stall)
            await new Promise((_, reject) =>
              signal.addEventListener(
                'abort',
                () => {
                  cancelled++;
                  reject(Error('client gone'));
                },
                { once: true },
              ),
            );
          return new Response(new Uint8Array(4096));
        }),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const url =
      'http://127.0.0.1:' +
      server.address().port +
      mediaResourcePath('bandung-atcs-76', 'segment.ts');
    const controllers = Array.from({ length: 20 }, () => new AbortController());
    const pending = controllers.map((controller) =>
      fetch(url, { signal: controller.signal }).catch(() => null),
    );
    for (let i = 0; i < 100 && started < 20; i++) await pause(10);
    assert.equal(started, 20);
    controllers.forEach((c) => c.abort());
    await Promise.all(pending);
    for (let i = 0; i < 100 && cancelled < 20; i++) await pause(10);
    assert.equal(cancelled, 20);
    stall = false;
    const start = performance.now();
    let completed = 0;
    for (let batch = 0; batch < 50; batch++)
      await Promise.all(
        Array.from({ length: 20 }, async () => {
          const r = await fetch(url);
          assert.equal(r.status, 200);
          assert.equal((await r.arrayBuffer()).byteLength, 4096);
          completed++;
        }),
      );
    assert.equal(completed, 1000);
    console.log(
      JSON.stringify({
        scenario: 'disconnect and repeated load',
        cancelled,
        completed,
        elapsedMs: Math.round(performance.now() - start),
      }),
    );
  },
);
