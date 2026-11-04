import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCameras } from '../server/camera-catalog.mjs';
import { cameraSourceCatalog } from '../server/camera-sources.mjs';
import { cameraMediaUrl, rewriteCameraPlaylist } from '../server/osint-camera-media.mjs';
test('West Java catalogs preserve publisher coordinates, city filters and scoped public playback', () => {
  const added = publicCameras.filter((c) => c.id.startsWith('jabar-public-'));
  assert.equal(added.length, 295);
  assert.equal(new Set(added.map((c) => c.provider)).size, 8);
  const sources = cameraSourceCatalog().sources;
  const fields = new Set([
    'id',
    'name',
    'kind',
    'provider',
    'province',
    'city',
    'url',
    'discoveryUrl',
    'previewUrl',
    'streamUrl',
    'latitude',
    'longitude',
    'locationName',
  ]);
  for (const c of added) {
    assert.ok(Object.keys(c).every((k) => fields.has(k)));
    assert.ok(c.latitude > -8.5 && c.latitude < -5.5 && c.longitude > 105 && c.longitude < 109.5);
    assert.equal(sources.find((s) => s.name === c.provider).city, c.city);
    const base = new URL(c.streamUrl);
    assert.equal(base.username + base.password, '');
    assert.equal(base.protocol, 'https:');
    assert.equal(cameraMediaUrl(c.id, base.pathname.split('/').pop()).href, base.href);
    assert.equal(cameraMediaUrl(c.id, '../secret'), null);
    assert.throws(() => rewriteCameraPlaylist('#EXTM3U\nhttps://other.example/a.ts', c.id, base));
  }
});
