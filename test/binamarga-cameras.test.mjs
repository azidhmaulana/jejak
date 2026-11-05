import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCameras } from '../server/camera-catalog.mjs';
import { cameraMediaUrl } from '../server/osint-camera-media.mjs';
import { camerasAlongRoute } from '../server/routes/service.mjs';
const imported = publicCameras.filter((c) => c.id.startsWith('public-camera-binamarga-'));
test('Bina Marga display positions are sourced, approximate, and excluded from precise routes', () => {
  assert.equal(imported.length, 1413);
  assert.equal(new Set(publicCameras.map((c) => c.id)).size, publicCameras.length);
  assert.equal(imported.filter((c) => c.latitude !== null).length, 1413);
  for (const c of imported) {
    assert.equal(c.latitude === null, c.longitude === null);
    if (c.latitude !== null) assert.equal(c.coordinateAccuracy, 'approximate');
    assert.equal(c.cameraPositionVerified, false);
    assert.equal(c.eligibleForRouteMatching, false);
    assert.ok(c.latitude >= -11 && c.latitude <= 6 && c.longitude >= 95 && c.longitude <= 141);
    assert.ok(c.coordinateReferences.length > 0);
    assert.ok(
      [
        'chainage-estimate',
        'road-reference',
        'locality-reference',
        'source-location',
        'junction-reference',
      ].includes(c.coordinateKind),
    );
    if (!c.streamUrl) continue;
    const u = new URL(c.streamUrl);
    assert.ok(u.pathname.endsWith('.m3u8'));
    assert.equal(cameraMediaUrl(c.id, u.pathname.split('/').at(-1) + u.search)?.href, u.href);
    assert.equal(cameraMediaUrl(c.id, '../private.m3u8'), null);
    assert.equal(cameraMediaUrl(c.id, 'https://localhost/private'), null);
    assert.equal(publicCameras.filter((other) => other.streamUrl === c.streamUrl).length, 1);
  }
  assert.deepEqual(
    camerasAlongRoute(
      [
        [107.5784, -6.8912],
        [107.5786, -6.8912],
      ],
      imported,
      100,
    ),
    [],
  );
});
