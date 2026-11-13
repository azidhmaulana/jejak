import test from 'node:test';
import assert from 'node:assert/strict';
import { createTollResolver, parseTollStreams } from '../server/toll-streams.mjs';
import { cameras, fetchCameraManifest } from '../server/osint-camera-media.mjs';
const old = 'https://jmlive.jasamarga.com/hls/6/5523b226-bbc4-4059-b55c-bf7d554286d6/index.m3u8';
const next = 'https://jmlive.jasamarga.com/hls/6/664fdc45-3d82-4c58-8caa-f3bce26045ef/index.m3u8';
const source = {
  id: 'toll-test',
  name: 'GT. PASTEUR EXIT',
  streamUrl: old,
  url: 'https://binamarga.pu.go.id/contents/cctv_tol/?id_ruas=padalarang-cileunyi',
};
const html = (url) =>
  `<div class="card-cctv"><video><source src="${url}"></video><h5> GT. PASTEUR EXIT </h5></div>`;
test('other Bina Marga HLS providers refresh only within their registered origin', async () => {
  const camera = { ...source, streamUrl: 'https://pub2.hk-opt.com/old/index.m3u8' };
  const replacement = 'https://pub2.hk-opt.com/new/index.m3u8?token=published';
  const resolve = createTollResolver({ catalogue: [camera], fetchPage: async () => html(replacement).replace('class="card-cctv"', 'class="card-cctv active"') });
  assert.equal((await resolve(camera.id, camera.streamUrl)).href, replacement);
  for (const url of ['https://other.example/new/index.m3u8', 'http://127.0.0.1/a.m3u8', 'https://pub2.hk-opt.com/admin']) {
    const unsafe = createTollResolver({ catalogue: [camera], fetchPage: async () => html(url) });
    assert.equal(await unsafe(camera.id, camera.streamUrl), null);
  }
});
test('toll URLs resolve by exact camera name and road, coalesce fetches and reject unsafe destinations', async () => {
  let calls = 0;
  const resolve = createTollResolver({
    catalogue: [source],
    fetchPage: async () => {
      calls++;
      return html(next);
    },
  });
  const results = await Promise.all([resolve(source.id, old), resolve(source.id, old)]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.href === next));
  assert.equal(await resolve('unknown', old), null);
  for (const url of [
    'http://127.0.0.1/secrets',
    next.replace('/hls/6/', '/hls/7/'),
    next + '?token=untrusted',
  ]) {
    const unsafe = createTollResolver({ catalogue: [source], fetchPage: async () => html(url) });
    assert.equal(await unsafe(source.id, old), null);
  }
  assert.equal(parseTollStreams(html(next) + html(old)).get('gt. pasteur exit'), null);
});
test('empty HTTP 200 toll playlist refreshes once, while valid streams never refresh', async () => {
  cameras.set(source.id, new URL(old));
  let calls = 0,
    refresh = 0;
  try {
    const result = await fetchCameraManifest(
      source.id,
      new URL(old),
      {},
      async (url) => {
        calls++;
        return new Response(String(url) === old ? '' : '#EXTM3U\nsegment/1.ts');
      },
      async () => {
        refresh++;
        return new URL(next);
      },
    );
    assert.equal(result.url.href, next);
    assert.equal(calls, 2);
    assert.equal(refresh, 1);
    await fetchCameraManifest(
      source.id,
      new URL(next),
      {},
      async () => new Response('#EXTM3U\nsegment/1.ts'),
      async () => {
        throw Error('must not refresh');
      },
    );
    calls = 0;
    refresh = 0;
    await assert.rejects(
      fetchCameraManifest(
        source.id,
        new URL(next),
        {},
        async () => {
          calls++;
          return new Response('');
        },
        async () => {
          refresh++;
          return new URL(old);
        },
      ),
      /Empty manifest/,
    );
    assert.equal(calls, 2);
    assert.equal(refresh, 1);
  } finally {
    cameras.delete(source.id);
  }
});
