import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(
  new URL('../src/modules/maps/offlineSelection.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
});
const { offlineSelectionBounds } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const near = (actual, expected) =>
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9));
test('selection accepts both drag directions and encloses all four corners on a rotated map', () => {
  near(
    offlineSelectionBounds([
      { lng: 107.5, lat: -6.8 },
      { lng: 107.8, lat: -7 },
    ]),
    [107.5, -7, 107.8, -6.8],
  );
  near(
    offlineSelectionBounds([
      { lng: 107.8, lat: -7 },
      { lng: 107.5, lat: -6.8 },
    ]),
    [107.5, -7, 107.8, -6.8],
  );
  near(
    offlineSelectionBounds([
      { lng: 107.5, lat: -6.9 },
      { lng: 107.6, lat: -7 },
      { lng: 107.8, lat: -6.9 },
      { lng: 107.6, lat: -6.8 },
    ]),
    [107.5, -7, 107.8, -6.8],
  );
});
test('repeated-world coordinates normalize without silently downloading across the date line', () => {
  near(
    offlineSelectionBounds([
      { lng: 467.5, lat: -7 },
      { lng: 467.8, lat: -6.8 },
    ]),
    [107.5, -7, 107.8, -6.8],
  );
  assert.throws(
    () =>
      offlineSelectionBounds([
        { lng: 179, lat: 0 },
        { lng: 181, lat: 1 },
      ]),
    /garis tanggal/,
  );
  assert.throws(
    () =>
      offlineSelectionBounds([
        { lng: -200, lat: 0 },
        { lng: 200, lat: 0.1 },
      ]),
    /luas/,
  );
});
test('empty, degenerate, non-finite, polar and oversized selections are rejected', () => {
  for (const input of [
    [],
    [{ lng: 1, lat: 2 }],
    [
      { lng: 1, lat: 2 },
      { lng: 1, lat: 3 },
    ],
    [
      { lng: NaN, lat: 2 },
      { lng: 1, lat: 3 },
    ],
    [
      { lng: 1, lat: 86 },
      { lng: 2, lat: 84 },
    ],
    [
      { lng: 1, lat: 0 },
      { lng: 12, lat: 10 },
    ],
  ])
    assert.throws(() => offlineSelectionBounds(input));
});
