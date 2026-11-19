import { test, expect, type Page } from './fixtures';
const frames = Array.from({ length: 37 }, (_, i) => {
  const time = Date.UTC(2026, 10, 16, 1, i * 10);
  return { id: new Date(time).toISOString().replace(/\D/g, '').slice(0, 14), time };
});
async function state(page: Page) {
  return page.evaluate(async () =>
    (await import('/src/features/weather/himawariStore.ts' as string)).useHimawari.getState(),
  );
}
async function captureMap(page: Page) {
  await page.waitForFunction(() => {
    const container = document.querySelector('.maplibregl-map') as any;
    if (!container) return false;
    let fiber = container[Object.keys(container).find((key) => key.startsWith('__reactFiber'))!];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.getSource && map.getStyle()?.layers?.length) {
          (window as any).satelliteMap = map;
          return true;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    if (localStorage.getItem('jejak-weather-clouds') === null)
      localStorage.setItem('jejak-weather-clouds', 'false');
  });
  await page.route('**/api/hotspots/sources', (r) => r.fulfill({ json: { sources: [] } }));
  await page.route('**/api/hotspots?*', (r) => r.fulfill({ json: { items: [], sources: {} } }));
  await page.route('**/api/earthquakes?*', (r) => r.fulfill({ json: { items: [], sources: {} } }));
  await page.route('**/api/weather/himawari/frames*', (r) =>
    r.fulfill({ json: { frames, stale: false } }),
  );
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, 256, 256);
      return c.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  await page.route('**/api/weather/himawari/detail/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.route('**/api/weather/himawari/tiles/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: png }),
  );
});

test('weather switches reuse loaded sources and do not reload unchanged radar tiles', async ({
  page,
}) => {
  test.setTimeout(60000);
  let metadata = 0;
  await page.route('https://api.rainviewer.com/public/weather-maps.json', (r) => {
    metadata++;
    return r.fulfill({
      json: {
        host: 'https://tilecache.rainviewer.com',
        radar: { past: [{ time: frames.at(-1)!.time / 1000, path: '/v2/radar/123' }] },
      },
    });
  });
  await page.route('https://tilecache.rainviewer.com/**', (r) => r.fulfill({ status: 204 }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await captureMap(page);
  await page.evaluate(async () => {
    (await import('/src/features/weather/osintWeatherStore.ts' as string)).useOsintWeather.setState(
      { rain: true, clouds: false, wind: false },
    );
  });
  await expect
    .poll(async () => (await state(page)).displayed, { timeout: 20000 })
    .toBe(frames.at(-1)!.id);
  await page.evaluate(() => {
    const w = window as any,
      m = w.satelliteMap;
    w.cachedSatellite = m.getSource('jejak-himawari-20261116070000-blue');
    w.cachedRadar = m.getSource('osint-weather-rain');
    w.radarReloads = 0;
    const original = w.cachedRadar.setTiles.bind(w.cachedRadar);
    w.cachedRadar.setTiles = (tiles: any) => {
      w.radarReloads++;
      return original(tiles);
    };
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(async () => {
      const store = (await import('/src/features/weather/osintWeatherStore.ts' as string))
        .useOsintWeather;
      store.setState({ rain: false, clouds: true, radarOverlay: false });
      store.setState({ radarOverlay: true });
      store.setState({ radarOverlay: false });
      store.setState({ rain: true, clouds: false });
    });
  }
  expect(
    await page.evaluate(() => {
      const w = window as any,
        m = w.satelliteMap;
      return {
        satellite: m.getSource('jejak-himawari-20261116070000-blue') === w.cachedSatellite,
        radar: m.getSource('osint-weather-rain') === w.cachedRadar,
        reloads: w.radarReloads,
      };
    }),
  ).toEqual({ satellite: true, radar: true, reloads: 0 });
  expect(metadata).toBe(1);
  await page.evaluate(async () =>
    (await import('/src/features/weather/osintWeatherStore.ts' as string)).useOsintWeather.setState(
      { rain: false, clouds: true },
    ),
  );
  for (let i = 0; i < 6; i++) {
    await page.evaluate(
      async (index) =>
        (await import('/src/features/weather/himawariStore.ts' as string)).useHimawari.setState({
          index,
        }),
      i,
    );
    await expect.poll(async () => (await state(page)).displayed).toBe(frames[i].id);
  }
  expect(
    await page.evaluate(
      () =>
        Object.keys((window as any).satelliteMap.getStyle().sources).filter((id) =>
          id.startsWith('jejak-himawari-'),
        ).length,
    ),
  ).toBeLessThanOrEqual(4);

  await page.evaluate(async () =>
    (await import('/src/features/weather/osintWeatherStore.ts' as string)).useOsintWeather.setState(
      { rain: false, clouds: false },
    ),
  );
  expect(
    await page.evaluate(() =>
      (window as any).satelliteMap.getPaintProperty('osint-weather-rain', 'raster-opacity'),
    ),
  ).toBe(0);
});

test('Infra uses detailed tiles, preserves its timestamp and stays visible at close zoom', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await captureMap(page);
  await page.evaluate(async () => {
    (await import('/src/features/weather/osintWeatherStore.ts' as string)).useOsintWeather.setState(
      { clouds: true, rain: false },
    );
    (await import('/src/features/weather/himawariStore.ts' as string)).useHimawari.setState({
      product: 'enhanced',
    });
  });
  await expect.poll(async () => (await state(page)).displayed).toBe(frames.at(-1)!.id);
  const config = await page.evaluate(
    () => (window as any).satelliteMap.getStyle().sources['jejak-himawari-20261116070000-enhanced'],
  );
  expect(config.maxzoom).toBe(8);
  expect(
    await page.evaluate(() =>
      (window as any).satelliteMap.getPaintProperty(
        'jejak-himawari-20261116070000-enhanced',
        'raster-resampling',
      ),
    ),
  ).toBe('linear');
  expect(config.tileSize).toBe(512);
  expect(config.tiles[0]).toContain('/detail/20261116070000/');
  await page.evaluate(() => (window as any).satelliteMap.jumpTo({ center: [110, -7], zoom: 12 }));
  await expect.poll(async () => (await state(page)).tileError).toBe(false);
  expect(
    await page.evaluate(() =>
      (window as any).satelliteMap.getPaintProperty(
        'jejak-himawari-20261116070000-enhanced',
        'raster-opacity',
      ),
    ),
  ).toBeGreaterThan(0);
});

test('alternate satellite mode is loaded before switching and reuses its tiles', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/detail/') && request.url().includes('product=enhanced'))
      requests++;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await captureMap(page);
  await page.evaluate(async () =>
    (await import('/src/features/weather/osintWeatherStore.ts' as string)).useOsintWeather.setState(
      { clouds: true, rain: false },
    ),
  );
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const map = (window as any).satelliteMap;
        const id = 'jejak-himawari-20261116070000-enhanced';
        return !!map.getSource(id) && map.isSourceLoaded(id);
      }),
    )
    .toBe(true);
  expect(requests).toBeGreaterThan(0);
  const before = requests;
  await page.evaluate(async () =>
    (await import('/src/features/weather/himawariStore.ts' as string)).useHimawari.setState({
      product: 'enhanced',
    }),
  );
  await expect.poll(async () => (await state(page)).loading).toBe(false);
  expect(requests).toBe(before);
  expect(
    await page.evaluate(() =>
      (window as any).satelliteMap.getPaintProperty(
        'jejak-himawari-20261116070000-enhanced',
        'raster-opacity',
      ),
    ),
  ).toBeGreaterThan(0);
});

test('loading dots stay above player and previous satellite stays visible until replacement is ready', async ({page}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release=resolve;});
  await page.route('**/api/weather/himawari/detail/**', async route => {
    if(route.request().url().includes('product=enhanced')) await gate;
    await route.fallback();
  });
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await captureMap(page);
  await page.evaluate(async()=> (await import('/src/features/weather/osintWeatherStore.ts' as string)).useOsintWeather.setState({clouds:true,rain:false,wind:false}));
  await expect.poll(async()=> (await state(page)).displayed).toBe(frames.at(-1)!.id);
  await page.evaluate(async()=> (await import('/src/features/weather/himawariStore.ts' as string)).useHimawari.setState({product:'enhanced'}));
  const dots=page.locator('.weather-dock-loading');
  await expect(dots).toBeVisible();
  await expect(dots.locator('.weather-loading-dot')).toHaveCount(5);
  expect(await dots.locator('.weather-loading-dot').first().evaluate(node => getComputedStyle(node).animationName)).not.toBe('none');
  const position=await dots.boundingBox(), panel=await page.locator('.weather-dock').boundingBox();
  expect(position!.y+position!.height).toBeLessThan(panel!.y);
  expect(await page.evaluate(()=> (window as any).satelliteMap.getPaintProperty('jejak-himawari-20261116070000-blue','raster-opacity'))).toBeGreaterThan(0);
  await page.screenshot({path:'.runtime/weather-loading-visible.png'});
  release();
  await expect(dots).toBeHidden();
  expect(await page.evaluate(()=> (window as any).satelliteMap.getPaintProperty('jejak-himawari-20261116070000-enhanced','raster-opacity'))).toBeGreaterThan(0);
});
