import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { installRandomUUID as dashboard } from '../src/shared/compat/random-uuid.js';
for (const [name, install] of [['dashboard', dashboard]]) {
  test(name + ' generates UUID v4 on HTTP LAN without native randomUUID', () => {
    const crypto = { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) };
    install(crypto);
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids)
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  test(name + ' preserves native UUID implementation', () => {
    const native = () => 'native';
    const crypto = { randomUUID: native };
    install(crypto);
    assert.equal(crypto.randomUUID, native);
  });
}
