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
function fixture(t, url = '/stream.m3u8') {
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
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error', LEVEL_LOADED: 'level' };
    static ErrorTypes = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
    static isSupported() {
      return true;
    }
    handlers = {};
    recovered = 0;
    destroyed = false;
    constructor(config) {
      this.config = config;
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
    url,
    { status: (s) => statuses.push(s), frame() {} },
    async () => ({ default: Player }),
  );
  t.after(() => {
    stop();
    delete globalThis.window;
  });
  return { video, statuses, instances, stop };
}
test('fatal network failure stops playback until manual retry, including after network returns', async (t) => {
  const f = fixture(t);
  await flush();
  f.instances[0].error('network');
  assert.equal(f.statuses.at(-1), 'STREAM TIDAK TERSEDIA');
  assert.equal(f.instances[0].destroyed, true);
  window.dispatchEvent(new Event('online'));
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(f.instances.length, 1);
  assert.equal(f.statuses.at(-1), 'STREAM TIDAK TERSEDIA');
});

test('media recovery is bounded and does not restart a failed camera', async (t) => {
  const f = fixture(t);
  await flush();
  f.instances[0].error('media');
  f.instances[0].error('media');
  assert.equal(f.instances[0].recovered, 2);
  f.instances[0].error('media');
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(f.instances.length, 1);
  assert.equal(f.statuses.at(-1), 'STREAM TIDAK TERSEDIA');
});

test('startup stall stops requests instead of entering a reconnection loop', async (t) => {
  const f = fixture(t);
  await flush();
  t.mock.timers.tick(46000);
  await flush();
  assert.equal(f.statuses.at(-1), 'STREAM TIDAK TERSEDIA');
  assert.equal(f.instances[0].destroyed, true);
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(f.instances.length, 1);
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

test('Indramayu uses provider low-latency hold-back without overriding full-segment sync', async (t) => {
  const f = fixture(t, '/api/osint/camera-media/jabar-public-diskominfo-indramayu-1/~index');
  await flush();
  const config = f.instances[0].config;
  assert.equal(config.lowLatencyMode, true);
  assert.equal(config.enableWorker, false);
  assert.equal(Object.hasOwn(config, 'liveSyncDurationCount'), false);
  const { default: Hls } = await import('hls.js');
  const realPlayer = new Hls(config);
  realPlayer.destroy();
});

test('ended HLS playlists are recordings rather than live video', async (t) => {
  const f = fixture(t);
  await flush();
  f.instances[0].handlers.level('level', { details: { live: false } });
  f.video.dispatchEvent(new Event('playing'));
  assert.equal(f.statuses.at(-1), 'REKAMAN');
  f.video.readyState = 2;
  f.video.currentTime = 1;
  f.video.dispatchEvent(new Event('timeupdate'));
  assert.equal(f.statuses.at(-1), 'REKAMAN');
});
