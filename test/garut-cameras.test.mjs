import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCameras } from '../server/camera-catalog.mjs';
import {
  cameras,
  cameraMediaUrl,
  rewriteCameraPlaylist,
  mediaResourcePath,
} from '../server/osint-camera-media.mjs';
import { camerasAlongRoute } from '../server/routes/service.mjs';

test('Garut catalog has unique georeferenced cameras usable by route matching and scoped HLS proxy', () => {
  const garut = publicCameras.filter((camera) => camera.provider === 'DISKOMINFO GARUT');
  assert.equal(garut.length, 16);
  assert.equal(new Set(publicCameras.map((camera) => camera.id)).size, publicCameras.length);
  assert.equal(new Set(garut.map((camera) => camera.streamUrl)).size, 16);
  for (const camera of garut) {
    assert.ok(camera.latitude > -8 && camera.latitude < -6);
    assert.ok(camera.longitude > 107 && camera.longitude < 109);
    assert.equal(cameras.get(camera.id).href, camera.streamUrl);
    const base = cameraMediaUrl(camera.id, 'live.m3u8');
    assert.equal(base.origin, 'https://cctv.garutkab.go.id');
    const manifest = rewriteCameraPlaylist('#EXTM3U\n#EXTINF:2,\nlive123.ts\n', camera.id, base);
    assert.ok(manifest.includes(mediaResourcePath(camera.id, 'live123.ts')));
    assert.equal(cameraMediaUrl(camera.id, '../other/live.m3u8'), null);
    assert.throws(() =>
      rewriteCameraPlaylist('#EXTM3U\nhttps://other.example/segment.ts\n', camera.id, base),
    );
  }
  const camera = garut[0];
  assert.ok(
    camerasAlongRoute(
      [
        [camera.longitude - 0.001, camera.latitude],
        [camera.longitude + 0.001, camera.latitude],
      ],
      garut,
      25,
    ).some((hit) => hit.id === camera.id),
  );
});
