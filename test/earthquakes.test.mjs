import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBmkg, normalizeUsgs, mergeEvents, parseRange } from '../server/earthquakes.mjs';

const record = { DateTime: '2026-11-12T19:14:40+00:00', Coordinates: '-8.20,116.76', Magnitude: '4.6', Kedalaman: '17 km', Wilayah: 'Test event', Dirasakan: 'III Test', Shakemap: 'event.mmi.jpg' };
test('BMKG coordinates are latitude first and unsafe shakemap paths are rejected', () => {
  const quake = normalizeBmkg(record);
  assert.equal(quake.lat, -8.2); assert.equal(quake.lng, 116.76); assert.equal(quake.depth, 17);
  assert.equal(normalizeBmkg({ ...record, Coordinates: 'bad' }), null);
  assert.equal(normalizeBmkg({ ...record, Shakemap: '../secret.jpg' }).shakemap, '');
});
test('USGS preserves a real magnitude zero and rejects missing magnitude', () => {
  const f = { id: 'test', properties: { time: Date.now(), mag: 0 }, geometry: { coordinates: [110, -7, 10] } };
  assert.equal(normalizeUsgs(f).magnitude, 0);
  assert.equal(normalizeUsgs({ ...f, properties: { time: Date.now(), mag: null } }), null);
});
test('overlapping BMKG feeds merge without losing felt or potential information', () => {
  const a = normalizeBmkg({ ...record, Potensi: 'Tidak berpotensi tsunami' });
  const b = normalizeBmkg({ ...record, Potensi: '', Shakemap: '' });
  const merged = mergeEvents([a, b]);
  assert.equal(merged.length, 1); assert.equal(merged[0].potential, a.potential); assert.equal(merged[0].shakemap, a.shakemap);
});
test('date boundaries include the whole WIB day and invalid or reversed ranges fail', () => {
  const range = parseRange({ start: '2020-01-01', end: '2020-01-01' });
  assert.equal(new Date(range.start).toISOString(), '2019-12-31T17:00:00.000Z');
  assert.equal(new Date(range.end).toISOString(), '2020-01-01T16:59:59.999Z');
  for (const q of [{ start: '2020-02-30', end: '2020-03-01' }, { start: '2020-02-02', end: '2020-01-01' }, { start: '2020-01-01', end: '2020-01-02', page: '-1' }, { start: ['2020-01-01'], end: '2020-01-02' }])
    assert.throws(() => parseRange(q), { status: 400 });
});

test('historical minimum magnitude is validated', () => {
  const dates = { start: '2004-12-26', end: '2004-12-26' };
  assert.equal(parseRange({ ...dates, minMagnitude: '9' }).minMagnitude, 9);
  for (const minMagnitude of ['NaN', '-1', '10']) assert.throws(() => parseRange({ ...dates, minMagnitude }), { status: 400 });
});

test('history rejects ranges longer than one year, including leap years', () => {
  assert.ok(parseRange({ start: '2004-01-01', end: '2004-12-31' }));
  assert.throws(() => parseRange({ start: '2004-01-01', end: '2005-01-01' }), { status: 400 });
});

test('archive accepts the first supported WIB day and rejects repeated parameters', () => {
  assert.ok(parseRange({ start: '1900-01-01', end: '1900-12-31' }));
  assert.throws(() => parseRange({ start: '2004-01-01', end: '2004-12-31', page: ['0'] }), { status: 400 });
});
