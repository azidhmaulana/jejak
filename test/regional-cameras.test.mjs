import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraCatalogs } from '../server/camera-catalog.mjs';
import { cameraMediaUrl, rewriteCameraPlaylist } from '../server/osint-camera-media.mjs';
import { camerasAlongRoute } from '../server/routes/service.mjs';
test('regional import contains only six reviewed streams and preserves missing coordinates', () => {
  const cameras = cameraCatalogs.at(-1).cameras;
  assert.equal(cameras.length, 6);
  assert.equal(
    cameras.filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude)).length,
    4,
  );
  const unmapped = cameras.filter((c) => c.latitude === null);
  assert.equal(unmapped.length, 2);
  assert.deepEqual(
    camerasAlongRoute(
      [
        [-0.01, 0],
        [0.01, 0],
      ],
      unmapped,
      100,
    ),
    [],
  );
  for (const c of cameras)
    assert.ok(cameraMediaUrl(c.id, new URL(c.streamUrl).pathname.split('/').at(-1)));
});
test('Bogor sessions and Jakarta nested HLS remain scoped to catalog origins', () => {
  const [bogor] = cameraCatalogs.at(-1).cameras;
  assert.ok(
    rewriteCameraPlaylist(
      '#EXTM3U\nvariant.m3u8?session=Ab12_x\n',
      bogor.id,
      bogor.streamUrl,
    ).includes('/~'),
  );
  assert.equal(cameraMediaUrl(bogor.id, 'variant.m3u8?session=bad%2Fvalue'), null);
  const jakarta = cameraCatalogs.at(-1).cameras[4];
  assert.ok(
    rewriteCameraPlaylist(
      '#EXTM3U\ntracks-v1/index.fmp4.m3u8\n',
      jakarta.id,
      jakarta.streamUrl,
    ).includes('/~'),
  );
  assert.throws(() =>
    rewriteCameraPlaylist(
      '#EXTM3U\nhttps://example.com/live.m3u8\n',
      jakarta.id,
      jakarta.streamUrl,
    ),
  );
});
