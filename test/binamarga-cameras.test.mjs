import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCameras } from '../server/camera-catalog.mjs';
import { cameraMediaUrl } from '../server/osint-camera-media.mjs';
import { camerasAlongRoute } from '../server/routes/service.mjs';
const imported = publicCameras.filter((c) => c.id.startsWith('public-camera-binamarga-'));
test('Biringkanaya uses its named gate rather than the Ujung Pandang road midpoint', () => {
  const road = imported.filter((c) => c.provider === 'BINA MARGA - UJUNG PANDANG SEKSI 1 3');
  assert.equal(road.length, 20);
  const camera = road.find((c) => c.name === 'BIRINGKANAYA');
  assert.equal(camera.coordinateKind, 'junction-reference');
  assert.ok(camera.latitude > -5.08 && camera.latitude < -5.07);
  assert.ok(camera.longitude > 119.51 && camera.longitude < 119.52);
  assert.equal(camera.cameraPositionVerified, false);
  assert.equal(camera.eligibleForRouteMatching, false);
  const west = road.find((c) => c.name === 'Tallo Barat');
  const east = road.find((c) => c.name === 'Tallo Timur');
  assert.ok(west.longitude < east.longitude && east.longitude < camera.longitude);
});
test('Semarang ABC uses separate section geometries and preserves station metres', () => {
  const road = imported.filter((c) => c.provider === 'BINA MARGA - SEMARANG ABC');
  assert.equal(road.length, 26);
  assert.equal(road.filter((c) => c.coordinateKind === 'chainage-estimate').length, 23);
  assert.equal(road.filter((c) => c.coordinateKind === 'junction-reference').length, 2);
  const klampisan = road.find((c) => c.name === 'KM 421 + 000 - A/A (Klampisan)');
  assert.ok(klampisan.longitude > 110.36 && klampisan.longitude < 110.38);
  assert.ok(klampisan.latitude > -7.01 && klampisan.latitude < -6.99);
  const jangli = road.find((c) => c.name.includes('Jembatan Jangli 2'));
  assert.equal(jangli.coordinateReferences[0].cameraKm, 430.2);
  assert.equal(jangli.coordinateReferences[0].section, 'C');
  const tembalang = road.find((c) => c.name.includes('GT. Tembalang 1'));
  assert.ok(tembalang.latitude < jangli.latitude - 0.02);
  const ramp = road.find((c) => c.name.includes('Of Ramp Jatingaleh'));
  assert.equal(ramp.coordinateReferences[0].featureId, 103);
  assert.equal(ramp.coordinateReferences[0].section, 'A');
  assert.equal(road.find((c) => c.name.includes('Lingkar Jangli')).coordinateKind, 'road-reference');
});
test('Sayung-Demak uses operational KM 449-465 rather than construction STA', () => {
  const road = imported.filter((c) => c.provider.includes('BINA MARGA - SEMARANG DEMAK'));
  assert.equal(road.length, 32);
  const stations = road.filter((c) => c.name.startsWith('KM '));
  assert.equal(stations.length, 25);
  assert.equal(new Set(stations.map((c) => `${c.latitude},${c.longitude}`)).size, 25);
  for (const c of stations) {
    assert.equal(c.coordinateKind, 'chainage-estimate');
    assert.ok(c.longitude >= 110.50 && c.longitude <= 110.65);
    assert.ok(c.latitude >= -6.96 && c.latitude <= -6.90);
    assert.equal(c.coordinateReferences[0].anchorKm, 449);
  }
  const target = stations.find((c) => c.name === 'KM 462+800');
  assert.ok(target.longitude > 110.62 && target.longitude < 110.65);
  const start = stations.find((c) => c.name === 'KM 449+000');
  assert.ok(target.longitude > start.longitude + 0.1);
  assert.equal(road.filter((c) => c.coordinateKind === 'junction-reference').length, 7);
});
test('Jakarta-Cikampek stations and cross-road rest areas no longer share one midpoint', () => {
  const road = imported.filter((c) => c.provider === 'BINA MARGA - JAKARTA CIKAMPEK');
  assert.equal(road.length, 66);
  assert.equal(road.filter((c) => c.coordinateKind === 'road-reference').length, 2);
  const km22 = road.find((c) => c.name === 'CIKAMPEK KM 22+000');
  assert.ok(km22.longitude > 107.04 && km22.longitude < 107.08);
  assert.ok(km22.latitude > -6.30 && km22.latitude < -6.26);
  for (const c of road.filter((c) => c.name.startsWith('CIPULARANG REST AREA'))) {
    assert.equal(c.coordinateReferences[0].featureId, 64);
    assert.ok(c.latitude < -6.5);
  }
  for (const c of road.filter((c) => c.name.startsWith('(Palimanan-Kanci)'))) {
    assert.ok(c.longitude > 108.5);
    assert.equal(c.coordinateKind, 'junction-reference');
  }
  const a = road.find((c) => c.name === 'CIKAMPEK KM 35+000');
  const b = road.find((c) => c.name === 'CIKAMPEK (EWS) KM 35+000 B');
  assert.notEqual(a.coordinateReferences[0].featureId, b.coordinateReferences[0].featureId);
  assert.ok(Math.hypot(a.latitude-b.latitude, a.longitude-b.longitude) < 0.003);
});
test('Sedyatmo kilometre positions follow the mainline without collapsing into the geometry loop', () => {
  const road = imported.filter((c) => c.provider === 'BINA MARGA - SEDYATMO');
  assert.equal(road.length, 15);
  assert.equal(new Set(road.map((c) => `${c.latitude},${c.longitude}`)).size, 15);
  const gate = road.find((c) => c.name === 'SEDYATMO GT CENGKARENG LAJUR');
  const km32 = road.find((c) => c.name === 'SEDYATMO KM 32+000');
  assert.equal(gate.coordinateKind, 'junction-reference');
  assert.ok(km32.longitude < gate.longitude);
  const stations = road.filter((c) => !c.name.includes('GT '));
  for (const c of stations) {
    assert.equal(c.coordinateKind, 'chainage-estimate');
    assert.ok(c.longitude > 106.68 && c.longitude < 106.79);
    assert.ok(c.latitude > -6.14 && c.latitude < -6.09);
    assert.equal(c.eligibleForRouteMatching, false);
  }
  const a = road.find((c) => c.name === 'SEDYATMO KM 24+000 | A');
  const b = road.find((c) => c.name === 'SEDYATMO KM 24+000 | B');
  assert.ok(Math.hypot(a.latitude-b.latitude, a.longitude-b.longitude) < 0.001);
  assert.notEqual(a.coordinateReferences[0].featureId, b.coordinateReferences[0].featureId);
});
test('Tangerang-Merak cameras use kilometre or named-junction references instead of one road midpoint', () => {
  const road = imported.filter((c) => c.provider === 'BINA MARGA - TANGERANG MERAK');
  assert.equal(road.length, 16);
  assert.equal(road.filter((c) => c.coordinateKind === 'road-reference').length, 0);
  const km29 = road.find((c) => c.name === 'KM 29+700 B');
  assert.equal(km29.coordinateKind, 'chainage-estimate');
  assert.ok(km29.longitude > 106.52 && km29.longitude < 106.56);
  assert.ok(km29.latitude > -6.23 && km29.latitude < -6.19);
  const km94 = road.find((c) => c.name === 'KM 94+800 B');
  const km96 = road.find((c) => c.name === 'KM 96+500 B');
  assert.ok(km29.longitude > km94.longitude && km94.longitude > km96.longitude);
  const cikupa = road.find((c) => c.name === 'Cikupa Entrance');
  const merak = road.find((c) => c.name === 'Merak Entrance');
  assert.ok(cikupa.longitude - merak.longitude > 0.4);
  for (const c of road) {
    assert.equal(c.coordinateAccuracy, 'approximate');
    assert.equal(c.eligibleForRouteMatching, false);
  }
});
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
