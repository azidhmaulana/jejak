import test from 'node:test';
import assert from 'node:assert/strict';
import { createSatellitePrewarm } from '../server/satellite-prewarm.mjs';
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
test('prewarm is bounded, deduplicates and stops obsolete work', async () => {
  const calls = [];
  let active = 0,
    max = 0;
  const warm = createSatellitePrewarm({
    render: async (...args) => {
      active++;
      max = Math.max(max, active);
      calls.push(args);
      await new Promise((r) => setImmediate(r));
      active--;
    },
  });
  warm('a');
  warm('a');
  await settle();
  assert.equal(calls.length, 12);
  assert.equal(max, 1);
  warm('a');
  await settle();
  assert.equal(calls.length, 12);
  warm('b');
  warm('c');
  await settle();
  assert.equal(calls.filter((c) => c[0] === 'c').length, 12);
  assert.ok(calls.filter((c) => c[0] === 'b').length < 12);
});
test('busy foreground skips background preparation', async () => {
  let calls = 0;
  const warm = createSatellitePrewarm({
    busy: () => true,
    render: async () => {
      calls++;
    },
  });
  warm('a');
  await settle();
  assert.equal(calls, 0);
});
