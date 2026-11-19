import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHsdWorkerMessage } from '../server/himawari-temperature.mjs';

test('malformed HSD worker messages reject safely instead of throwing in the event handler', () => {
  for (const value of [
    undefined,
    null,
    {},
    { result: {} },
    { result: { pixels: [] } },
    { error: 'bad segment' },
  ])
    assert.throws(() => readHsdWorkerMessage(value));
  const result = readHsdWorkerMessage({ result: { number: 6, pixels: new Uint8Array([1, 2]) } });
  assert.equal(result.number, 6);
  assert.deepEqual(result.pixels, Buffer.from([1, 2]));
});
