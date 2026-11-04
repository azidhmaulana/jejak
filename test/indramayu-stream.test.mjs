import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCameras } from '../server/camera-catalog.mjs';
import {
  cameraMediaUrl,
  rewriteCameraPlaylist,
  mediaResourcePath,
} from '../server/osint-camera-media.mjs';
import { probeCamera } from '../server/osint-camera-health.mjs';
const camera = publicCameras.find((c) => c.provider === 'DISKOMINFO INDRAMAYU');
const base = new URL(camera.streamUrl);
const session = '12345678-abcd-4321-abcd-123456789abc';
const variant = `video1_stream.m3u8?session=${session}`;
const segment = `video1_seg7.mp4?session=${session}`;
const init = `video1_init.mp4?session=${session}`;
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000\n' + variant;
const media = `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:7\n#EXT-X-MAP:URI="${init}"\n#EXT-X-PART:DURATION=0.2,URI="part1.mp4?session=${session}"\n#EXTINF:4,\n${segment}`;
test('Indramayu preserves scoped session URLs in variants, init, parts and segments', () => {
  assert.ok(
    rewriteCameraPlaylist(master, camera.id, base).includes(mediaResourcePath(camera.id, variant)),
  );
  const rewritten = rewriteCameraPlaylist(media, camera.id, new URL(variant, base));
  assert.ok(rewritten.includes('#EXT-X-PART:'));
  for (const resource of [init, segment])
    assert.ok(rewritten.includes(mediaResourcePath(camera.id, resource)));
  for (const resource of [
    '../other/index.m3u8?session=abc',
    'video.mp4?session=http%3A%2F%2Flocalhost',
    'video.mp4?destination=localhost',
  ])
    assert.equal(cameraMediaUrl(camera.id, resource), null);
  assert.equal(cameraMediaUrl('bandung-atcs-76', 'video.mp4?session=abc'), null);
});
test('Indramayu health follows session playlists through a real media sample', async () => {
  const seen = [];
  const result = await probeCamera(camera.id, base, {
    fetcher: async (url) => {
      seen.push(url.href);
      return new Response(
        url.href === base.href
          ? master
          : url.pathname.endsWith('.m3u8')
            ? media
            : new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
      );
    },
  });
  assert.equal(seen.length, 3);
  assert.equal(new URL(seen[2]).searchParams.get('session'), session);
  assert.ok(result.fingerprint.includes(segment));
});

test('Indramayu cookie-check redirect is limited to the exact same resource and preserves ranges', async () => {
  const { fetchCameraMedia } = await import('../server/osint-camera-media.mjs');
  const calls = [];
  const target = new URL(base);
  target.searchParams.set('cookieCheck', '1');
  const response = await fetchCameraMedia(
    base,
    { headers: { Range: 'bytes=0-1023' } },
    async (url, options) => {
      calls.push({ url: String(url), options });
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { Location: target.href } })
        : new Response('media');
    },
  );
  assert.equal(await response.text(), 'media');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[1].options.headers.Range, 'bytes=0-1023');
  for (const location of [
    'https://evil.example/a',
    'http://127.0.0.1/a',
    new URL('../other/index.m3u8?cookieCheck=1', base).href,
    base.href + '?cookieCheck=2',
  ]) {
    let count = 0;
    await assert.rejects(
      fetchCameraMedia(base, {}, async () => {
        count++;
        return new Response(null, { status: 302, headers: { Location: location } });
      }),
      /Unsupported media redirect/,
    );
    assert.equal(count, 1);
  }
});

test('Indramayu forwards only validated LL-HLS reload parameters', async (t) => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { serveOsintCameraMedia } = await import('../server/osint-camera-media.mjs');
  let seen;
  const server = createServer(
    (req, res) =>
      void serveOsintCameraMedia(req, res, async (url) => {
        seen = url;
        return new Response(media);
      }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = 'http://127.0.0.1:' + server.address().port + mediaResourcePath(camera.id, variant);
  assert.equal((await fetch(url + '?_HLS_msn=9&_HLS_part=2&_HLS_skip=YES')).status, 200);
  assert.equal(seen.searchParams.get('_HLS_msn'), '9');
  assert.equal(seen.searchParams.get('session'), session);
  for (const query of ['_HLS_msn=abc', '_HLS_part=-1', '_HLS_skip=no', 'url=https://evil.example'])
    assert.equal((await fetch(url + '?' + query)).status, 404);
  assert.equal(cameraMediaUrl('bandung-atcs-76', 'index.m3u8?_HLS_msn=1'), null);
});
