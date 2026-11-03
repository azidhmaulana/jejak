import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraMediaUrl,
  rewriteCameraPlaylist,
  mediaResourcePath,
  serveOsintCameraMedia,
} from '../server/osint-camera-media.mjs';
test('camera proxy is scoped to catalogue camera and fixed upstream folder', () => {
  const id = 'bandung-atcs-76';
  assert.equal(cameraMediaUrl(id, 'index.m3u8').origin, 'https://atcs-dishub.bandung.go.id:1990');
  for (const path of [
    '../index.m3u8',
    'https://example.com/x',
    '%2e%2e',
    '//host/file',
    '..',
    'x?url=http://localhost',
  ])
    assert.equal(cameraMediaUrl(id, path), null);
  assert.equal(cameraMediaUrl('other', 'index.m3u8'), null);
});
test('HLS manifests rewrite variants, segments and init/key URIs without external destinations', () => {
  const id = 'bandung-atcs-76',
    base = cameraMediaUrl(id, 'index.m3u8');
  const text = rewriteCameraPlaylist(
    '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nvideo1_stream.m3u8\nsegment.ts\n',
    id,
    base,
  );
  assert.ok(text.includes(`URI="${mediaResourcePath(id, 'init.mp4')}"`));
  assert.ok(text.includes(mediaResourcePath(id, 'segment.ts')));
  assert.ok(!text.includes('.mp4'));
  assert.ok(!text.includes('.ts'));
  assert.throws(() => rewriteCameraPlaylist('#EXTM3U\nhttps://example.com/x.ts', id, base));
  assert.throws(() => rewriteCameraPlaylist('#EXTM3U\n../outside.ts', id, base));
});

test(
  'media forwards the first chunk before upstream finishes and stays inline',
  { timeout: 5000 },
  async (t) => {
    const { createServer } = await import('node:http');
    const { once } = await import('node:events');
    let finish;
    const gate = new Promise((resolve) => (finish = resolve));
    const server = createServer(
      (req, res) =>
        void serveOsintCameraMedia(
          req,
          res,
          async () =>
            new Response(
              new ReadableStream({
                async start(controller) {
                  controller.enqueue(new TextEncoder().encode('first'));
                  await gate;
                  controller.enqueue(new TextEncoder().encode('last'));
                  controller.close();
                },
              }),
            ),
        ),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      finish();
      server.closeAllConnections();
      server.close();
    });
    const response = await fetch(
      'http://127.0.0.1:' +
        server.address().port +
        mediaResourcePath('bandung-atcs-76', 'segment.mp4'),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-disposition'), 'inline');
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), 'first');
    finish();
    const last = await reader.read();
    assert.equal(new TextDecoder().decode(last.value), 'last');
  },
);

test('Pelindung playlists use official provider and reject cross-provider resources', () => {
  const id = 'bandung-public-6f1065bd-f94a-4730-b44b-1c4896b5fed3';
  const base = cameraMediaUrl(id, 'DepanTo.m3u8');
  assert.equal(base.href, 'https://pelindung.bandung.go.id:3443/video/DAHUA/DepanTo.m3u8');
  assert.ok(
    rewriteCameraPlaylist('#EXTM3U\nDepanTo3.ts', id, base).includes(
      mediaResourcePath(id, 'DepanTo3.ts'),
    ),
  );
  for (const name of [
    '../secret',
    '%2e%2e/secret',
    'https://localhost/x',
    '//localhost/x',
    'DepanTo.ts?url=http://localhost',
    'DepanTo.ts?api=changed',
  ])
    assert.equal(cameraMediaUrl(id, name), null);
  assert.throws(() =>
    rewriteCameraPlaylist('#EXTM3U\nhttps://cctv.kazuhamoe.my.id/proxy.php', id, base),
  );
});

test('KBB accepts dynamic playlist session tokens only on its fixed provider', () => {
  const id = 'bandung-public-kbb-cctv-633da1e9-5e53-4721-a03d-3312b3dcb436';
  const name = '633da1e9-5e53-4721-a03d-3312b3dcb436_output_0.m3u8?session=abc_DEF-123';
  const base = cameraMediaUrl(id, '633da1e9-5e53-4721-a03d-3312b3dcb436.m3u8');
  assert.equal(cameraMediaUrl(id, name).searchParams.get('session'), 'abc_DEF-123');
  assert.ok(
    rewriteCameraPlaylist('#EXTM3U\n' + name, id, base).includes(mediaResourcePath(id, name)),
  );
  assert.equal(cameraMediaUrl(id, 'segment.ts?session=https%3A%2F%2Fevil.example'), null);
  assert.equal(cameraMediaUrl(id, 'segment.ts?destination=other'), null);
  assert.equal(cameraMediaUrl('bandung-atcs-76', 'segment.ts?session=abc'), null);
});

test('rejects HTML errors and supports BOM and whitespace in HLS', () => {
  const id = 'bandung-atcs-76',
    base = cameraMediaUrl(id, 'index.m3u8');
  assert.throws(() => rewriteCameraPlaylist('<html>Error</html>', id, base));
  assert.ok(
    rewriteCameraPlaylist('\uFEFF#EXTM3U\n  segment.ts  \n', id, base).includes(
      mediaResourcePath(id, 'segment.ts'),
    ),
  );
});
test('byte ranges are forwarded and partial response semantics preserved', async (t) => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  let seen;
  const server = createServer(
    (req, res) =>
      void serveOsintCameraMedia(req, res, async (_url, options) => {
        seen = options.headers.Range;
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 206,
          headers: { 'Content-Range': 'bytes 10-12/100', 'Accept-Ranges': 'bytes' },
        });
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
    mediaResourcePath('bandung-atcs-76', 'segment.mp4');
  const response = await fetch(url, { headers: { Range: 'bytes=10-12' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 10-12/100');
  assert.equal(seen, 'bytes=10-12');
  assert.equal((await response.arrayBuffer()).byteLength, 3);
  assert.equal((await fetch(url, { headers: { Range: 'bytes=1-2,4-5' } })).status, 416);
});
