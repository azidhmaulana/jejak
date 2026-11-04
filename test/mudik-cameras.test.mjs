import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCameras } from '../server/camera-catalog.mjs';
import { cameraMediaUrl, rewriteCameraPlaylist } from '../server/osint-camera-media.mjs';
import { camerasAlongRoute } from '../server/routes/service.mjs';
const imported = publicCameras.filter((c) => c.id.startsWith('public-camera-mudik-'));
test('Mudik imports only verified regional public feeds without duplicate IDs or URLs', () => {
  assert.equal(imported.length, 12);
  assert.equal(imported.filter((c) => c.city === 'Jakarta').length, 8);
  assert.equal(imported.filter((c) => c.city === 'Tangerang').length, 4);
  assert.equal(new Set(publicCameras.map((c) => c.id)).size, publicCameras.length);
  for (const c of imported) {
    assert.equal(publicCameras.filter((other) => other.streamUrl === c.streamUrl).length, 1);
    assert.ok(['DKI Jakarta', 'Banten'].includes(c.province));
    assert.equal(c.coordinateAccuracy, 'approximate');
    assert.ok(c.sourceReference && c.discoveryUrl);
    const filename = new URL(c.streamUrl).pathname.split('/').at(-1);
    assert.equal(cameraMediaUrl(c.id, filename).href, c.streamUrl);
    assert.ok(
      rewriteCameraPlaylist('#EXTM3U\n#EXTINF:5,\nsegment.ts\n', c.id, c.streamUrl).includes('/~'),
    );
    assert.equal(cameraMediaUrl(c.id, '../other/index.m3u8'), null);
    assert.equal(cameraMediaUrl(c.id, 'https://localhost/private'), null);
    assert.equal(cameraMediaUrl(c.id, 'segment.ts?redirect=http://localhost'), null);
  }
});
test('approximate catalogue coordinates do not create false route matches', () => {
  const c = imported[0];
  assert.deepEqual(
    camerasAlongRoute(
      [
        [c.longitude - 0.001, c.latitude],
        [c.longitude + 0.001, c.latitude],
      ],
      [c],
      100,
    ),
    [],
  );
});
