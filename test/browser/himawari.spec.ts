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
  await page.route('**/api/weather/himawari/{tiles,detail}/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: png }),
  );
});

test.skip('daily cloud history (temporarily hidden) loads one selected day and clears old imagery when unavailable', async ({
  page,
}) => {
  const day = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const missing = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const time = Date.parse(day + 'T05:00:00Z');
  const frame = { id: 'h' + new Date(time).toISOString().replace(/\D/g, '').slice(0, 14), time };
  await page.route('**/api/weather/himawari/history?*', (r) =>
    new URL(r.request().url()).searchParams.get('date') === missing
      ? r.fulfill({ status: 404, json: { error: 'No imagery' } })
      : r.fulfill({ json: { frames: [frame], stale: false } }),
  );
  test.setTimeout(60000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Satellite weather' });
  await captureMap(page);
  await panel.getByRole('button', { name: 'Daily history', exact: true }).click();
  await panel.getByLabel('Archive date (UTC)').fill(day);
  await panel.getByRole('button', { name: 'Show', exact: true }).click();
  await expect.poll(async () => (await state(page)).displayed, { timeout: 15000 }).toBe(frame.id);
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const map = (window as any).satelliteMap;
      const layer = map.getStyle().layers.find((l: any) => l.id.startsWith('jejak-himawari-h'));
      return map.getPaintProperty(layer.id, 'raster-saturation');
    }),
  ).toBe(-1);
  await panel.getByRole('button', { name: 'Play daily', exact: true }).click();
  await expect.poll(async () => (await state(page)).historyDate, { timeout: 10000 }).not.toBe(day);
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedDay = (await state(page)).historyDate;
  await page.waitForTimeout(2100);
  expect((await state(page)).historyDate).toBe(pausedDay);
  await panel.getByLabel('Archive date (UTC)').fill(missing);
  await panel.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(panel).toContainText('No imagery for this date');
  await expect.poll(async () => (await state(page)).displayed).toBeNull();
  await panel.getByRole('button', { name: 'Recent', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).displayed, { timeout: 15000 })
    .toBe(frames.at(-1)!.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole('button', { name: 'Daily history', exact: true }).click();
  await expect(panel.getByLabel('Archive date (UTC)')).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.runtime/himawari-history-mobile.png' });
});
test('satellite timeline plays, switches infrared and restores layers after style changes', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const rail = page.getByRole('navigation', { name: 'Weather layers', exact: true });
  await rail.getByRole('button', { name: 'Satellite', exact: true }).click();
  const catalog = page.getByRole('complementary', { name: 'Weather catalog' });
  await catalog.getByRole('button', { name: /Satellite.*Auto/ }).click();
  const dock = page.getByRole('region', { name: 'Weather layers and timeline' });
  await expect(dock).toBeVisible();
  await captureMap(page);
  const layerCount = () =>
    page.evaluate(
      () =>
        (window as any).satelliteMap
          .getStyle()
          .layers.filter((l: any) => l.id.startsWith('jejak-himawari-')).length,
    );
  await expect.poll(layerCount, { timeout: 20000 }).toBeGreaterThan(0);
  await dock.getByRole('switch', { name: 'Infra', exact: true }).check();
  await expect(dock.getByRole('switch', { name: 'Infra', exact: true })).toBeChecked();
  await dock.getByRole('switch', { name: 'Infra', exact: true }).uncheck();
  const timeline = dock.getByRole('slider', { name: 'Weather time' });
  await timeline.fill('0');
  await dock.getByRole('button', { name: 'Play weather' }).click();
  await expect.poll(() => timeline.inputValue(), { timeout: 15000 }).not.toBe('0');
  await dock.getByRole('button', { name: 'Pause weather' }).click();
  await page.evaluate(() =>
    (window as any).satelliteMap.setStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'base', type: 'background', paint: { 'background-color': '#06120c' } }],
    }),
  );
  await expect.poll(layerCount, { timeout: 15000 }).toBeGreaterThan(0);
  await catalog.getByRole('button', { name: 'Turn weather off' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = (window as any).satelliteMap;
        return map
          .getStyle()
          .layers.filter((l: any) => l.id.startsWith('jejak-himawari-'))
          .every((l: any) => map.getPaintProperty(l.id, 'raster-opacity') === 0);
      }),
    )
    .toBe(true);
  await expect(dock).toHaveCount(0);
});

test('satellite errors are visible and mobile panel stays inside viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/weather/himawari/frames*', (r) =>
    r.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  test.setTimeout(60000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'More navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Satellite weather' });
  await panel.getByRole('switch', { name: 'Satellite imagery' }).check();
  await expect(panel.locator('.himawari-status')).toContainText('Source unavailable');
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: '.runtime/himawari-mobile.png' });
  await panel.getByRole('button', { name: 'Close weather', exact: true }).click();
  await expect(panel).toHaveCount(0);
});
