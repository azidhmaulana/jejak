import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const asUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`;
const catalogUrl = asUrl(
  readFileSync(new URL('../src/modules/maps/mapProviders.ts', import.meta.url), 'utf8').replaceAll(
    'import.meta.env.',
    '({}).',
  ),
);
const catalog = await import(catalogUrl);
const service = await import(
  asUrl(
    readFileSync(
      new URL('../src/modules/maps/onlineMapService.ts', import.meta.url),
      'utf8',
    ).replace("'./mapProviders'", JSON.stringify(catalogUrl)),
  )
);

test('brand switches preserve compatible map types and choose a valid fallback', () => {
  assert.equal(catalog.providerForBrand('google', 'satellite'), 'google-satellite');
  assert.equal(catalog.providerForBrand('esri', 'google-hybrid'), 'esri-hybrid');
  assert.equal(catalog.providerForBrand('osm', 'satellite'), 'osm');
  assert.equal(catalog.providerForBrand('esri', 'osm'), 'esri-street');
  assert.equal(catalog.getMapProvider('esri-dark').brand, 'esri');
  assert.equal(catalog.offlineProviderFor('offline-satellite'), 'eox-satellite');
  assert.equal(catalog.offlineProviderFor('eox-satellite'), undefined);
  for (const provider of catalog.mapProviders) {
    if (typeof provider.style === 'string') continue;
    for (const source of Object.values(provider.style.sources)) {
      if (source.type === 'raster') assert.ok(Number.isFinite(source.maxzoom), provider.id);
    }
    for (const layer of provider.style.layers)
      assert.equal(layer.maxzoom, undefined, 'overzoom must not hide the map');
  }
});
test('Google map types use the official session API, hybrid/terrain include roads', async () => {
  assert.deepEqual(service.googleSessionOptions('street'), {
    mapType: 'roadmap',
    language: 'id-ID',
    region: 'ID',
  });
  assert.equal(service.googleSessionOptions('satellite').layerTypes, undefined);
  assert.deepEqual(service.googleSessionOptions('hybrid').layerTypes, ['layerRoadmap']);
  assert.equal(service.googleSessionOptions('topographic').mapType, 'terrain');
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return Response.json({
        session: 'test/session',
        expiry: String(Math.ceil(Date.now() / 1000) + 3600),
        tileWidth: 256,
      });
    };
    await assert.rejects(
      service.resolveOnlineMap('google-street', '', new AbortController().signal),
      /API key/,
    );
    assert.equal(calls.length, 0);
    const result = await service.resolveOnlineMap(
      'google-hybrid',
      'test&key',
      new AbortController().signal,
    );
    assert.equal(new URL(calls[0].url).searchParams.get('key'), 'test&key');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(JSON.parse(calls[0].init.body).mapType, 'satellite');
    assert.ok(result.style.sources.google.tiles[0].includes('/v1/2dtiles/{z}/{x}/{y}'));
    assert.ok(result.style.sources.google.tiles[0].includes('test%2Fsession'));
    globalThis.fetch = async () => new Response('<!doctype html>', { status: 403 });
    await assert.rejects(
      service.resolveOnlineMap('google-street', 'key', new AbortController().signal),
      /Could not load/,
    );
    globalThis.fetch = async () => Response.json({ session: 'expired', expiry: '1' });
    await assert.rejects(
      service.resolveOnlineMap('google-street', 'key', new AbortController().signal),
      /Invalid map session/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('MapTiler requires a key; viewport metadata normalizes wrapped worlds', async () => {
  await assert.rejects(
    service.resolveOnlineMap('maptiler-street', '', new AbortController().signal),
  );
  const result = await service.resolveOnlineMap(
    'maptiler-street',
    'test&key',
    new AbortController().signal,
  );
  assert.equal(new URL(result.style).searchParams.get('key'), 'test&key');
  const url = new URL(
    service.googleViewportUrl('session', 'key', 18.5, {
      west: 467,
      east: 468,
      north: -6,
      south: -7,
    }),
  );
  assert.equal(url.pathname, '/tile/v1/viewport');
  assert.equal(url.searchParams.get('west'), '107');
  assert.equal(url.searchParams.get('east'), '108');
  assert.equal(url.searchParams.get('zoom'), '18');
});
