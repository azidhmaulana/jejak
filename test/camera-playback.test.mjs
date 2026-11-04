import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/features/surveillance/cameraPlayback.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  external: ['hls.js'],
});
const { startCameraPlayback } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  globalThis.window = new EventTarget();
  class Video extends EventTarget {
    currentTime = 0;
    paused = false;
    readyState = 0;
    play() {
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    load() {}
    removeAttribute() {}
  }
  const instances = [];
  class Player {
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static ErrorTypes = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
    static isSupported() {
      return true;
    }
    handlers = {};
    recovered = 0;
    destroyed = false;
    constructor() {
      instances.push(this);
    }
    on(name, handler) {
      this.handlers[name] = handler;
    }
    loadSource() {}
    attachMedia() {}
    stopLoad() {}
    destroy() {
      this.destroyed = true;
    }
    recoverMediaError() {
      this.recovered++;
    }
    error(type) {
      this.handlers.error('error', { fatal: true, type });
    }
  }
  const video = new Video();
  const statuses = [];
  const stop = startCameraPlayback(
    video,
    '/stream.m3u8',
    { status: (s) => statuses.push(s), frame() {} },
    async () => ({ default: Player }),
  );
  t.after(() => {
    stop();
    delete globalThis.window;
  });
  return { video, statuses, instances, stop };
}
test('fatal network failure retries with backoff and stops all work on unmount', async (t) => {
  const f = fixture(t);
  await flush();
  f.instances[0].error('network');
  assert.equal(f.statuses.at(-1), 'MENGHUBUNGKAN ULANG');
  t.mock.timers.tick(999);
  await flush();
  assert.equal(f.instances.length, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(f.instances.length, 2);
  f.instances[1].error('network');
  t.mock.timers.tick(1999);
  await flush();
  assert.equal(f.instances.length, 2);
  f.stop();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(f.instances.length, 2);
});
test('media recovery is bounded and a startup stall triggers reconnection', async (t) => {
  const f = fixture(t);
  await flush();
  f.instances[0].error('media');
  f.instances[0].error('media');
  assert.equal(f.instances[0].recovered, 2);
  f.instances[0].error('media');
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.instances.length, 2);
  t.mock.timers.tick(22000);
  await flush();
  assert.equal(f.statuses.at(-1), 'MENGHUBUNGKAN ULANG');
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(f.instances.length, 3);
});
test('intentional pause does not cause watchdog reconnections', async (t) => {
  const f = fixture(t);
  await flush();
  f.video.dispatchEvent(new Event('playing'));
  f.video.paused = true;
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(f.instances.length, 1);
});
