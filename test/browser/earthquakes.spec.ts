import { test, expect } from './fixtures';

test('earthquake panel filters, selects, shows source failures, and keeps live footer during history', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  const quake = { id: 'test-bmkg', source: 'BMKG', time: Date.now(), lat: -7, lng: 110, depth: 12, magnitude: 6.1, place: 'Fixture earthquake', felt: 'III Test', potential: 'Tidak berpotensi tsunami', shakemap: '', url: 'https://www.bmkg.go.id/gempabumi' };
  let fail = false;
  await page.route('**/api/earthquakes*', async route => {
    const history = new URL(route.request().url()).searchParams.has('start');
    if (history && fail) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    return route.fulfill({ json: { items: history ? [{ ...quake, id: 'historical', place: 'Historical fixture', time: Date.parse('2020-01-01') }] : [quake], latest: quake, hasMore: false, historyUnavailable: false, status: { bmkgUpdatedAt: new Date().toISOString(), usgsUpdatedAt: new Date().toISOString() } } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Earthquakes', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Earthquakes' });
  await expect(panel.getByRole('switch')).toBeChecked();
  await expect(panel.locator('.quake-row')).toHaveCount(1);
  await panel.getByRole('switch').uncheck(); await expect(panel.getByRole('switch')).not.toBeChecked();
  await panel.locator('.quake-row').click();
  await expect(panel.getByRole('switch')).toBeChecked();
  await expect(page.getByRole('dialog', { name: 'Earthquake details' })).toContainText('Tidak berpotensi tsunami');
  await expect(page.getByRole('link', { name: 'BMKG DETAILS' })).toHaveAttribute('href', quake.url);
  const triggerBox = await page.locator('[data-earthquake-trigger]').boundingBox();
  const panelBox = await panel.boundingBox();
  expect(Math.abs(triggerBox!.y - panelBox!.y)).toBeLessThan(2);
  await expect(page.locator('.quake-ticker-trigger')).toHaveAttribute('data-large', 'true');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Close earthquake details', exact: true }).click();
  const viewport = page.viewportSize()!;
  await expect(async () => {
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await expect(page.getByRole('dialog', { name: 'Earthquake details' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 20000 });
  await page.screenshot({ path: '.runtime/earthquake-popup.png' });
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await panel.getByLabel('History year').selectOption('2004');
  await expect(panel.getByLabel('Start date')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(panel.locator('.quake-row')).toContainText('Historical fixture');
  await expect(page.locator('.quake-ticker').first()).toContainText('Fixture earthquake');
  fail = true; await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await panel.getByRole('button', { name: '48 hours', exact: true }).click();
  await expect(panel.locator('.quake-row')).toContainText('Fixture earthquake');
  await page.screenshot({ path: '.runtime/earthquakes-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.runtime/earthquakes-mobile.png' });
  await page.mouse.move(380, 700);
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Earthquakes', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Earthquakes', exact: true }).hover();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Earthquakes', exact: true }).click();
  await expect(panel).toBeVisible();
});

test('earthquake markers are available after refresh without opening the panel or toggling', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  const quake = { id: 'refresh-quake', source: 'BMKG', time: Date.now(), lat: -6.9175, lng: 107.6191, depth: 10, magnitude: 4.5, place: 'Refresh fixture', felt: '', potential: '', shakemap: '', url: 'https://www.bmkg.go.id/gempabumi' };
  await page.route('**/api/earthquakes*', route => route.fulfill({ json: {
    items: [quake], latest: quake, hasMore: false, historyUnavailable: false,
    status: { bmkgUpdatedAt: new Date().toISOString(), usgsUpdatedAt: new Date().toISOString() },
  } }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.quake-ticker-trigger')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Earthquakes' })).toHaveCount(0);
    await expect(async () => {
      const point = await page.evaluate(() => {
        const container = document.querySelector('.maplibregl-map') as any;
        let fiber = container?.[Object.keys(container).find(key => key.startsWith('__reactFiber'))!];
        while (fiber) {
          let hook = fiber.memoizedState;
          while (hook) {
            const map = hook.memoizedState?.current;
            if (map?.getLayer?.('jejak-earthquake-markers')) {
              const feature = map.queryRenderedFeatures({ layers: ['jejak-earthquake-markers'] }).find((f: any) => f.properties.id === 'refresh-quake');
              if (!feature) return null;
              const p = map.project(feature.geometry.coordinates), rect = map.getCanvas().getBoundingClientRect();
              return { x: p.x + rect.left, y: p.y + rect.top };
            }
            hook = hook.next;
          }
          fiber = fiber.return;
        }
        return null;
      });
      expect(point).not.toBeNull();
      await page.mouse.click(point!.x, point!.y);
      await expect(page.getByRole('dialog', { name: 'Earthquake details' })).toContainText('Refresh fixture', { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    const details = page.getByRole('dialog', { name: 'Earthquake details' });
    await details.locator('h3').click();
    await expect(details).toBeVisible();
    await page.mouse.click(350, 650);
    await expect(details).toHaveCount(0);
  }
});

test('history loads every page and reports real completion; CCTV opens only on click', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  const pages: string[] = [];
  await page.route('**/api/earthquakes*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const history = params.has('start'), index = Number(params.get('page') || 0);
    if (history) pages.push(params.get('page')!);
    await route.fulfill({ json: { items: history ? [{ id: `q${index}`, source: 'USGS', magnitude: 9 - index, time: Date.parse('2004-12-26'), lat: 3, lng: 96, depth: 30, place: `Archive ${index}`, url: 'https://earthquake.usgs.gov', felt: '', potential: '', shakemap: '' }] : [], total: 2, latest: null, hasMore: history && index === 0, historyUnavailable: false, status: {} } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const cctv = page.getByRole('button', { name: 'Camera catalog', exact: true });
  await cctv.hover(); await expect(page.locator('#surveillance-hover-settings')).toHaveCount(0);
  await cctv.click(); await expect(page.locator('#surveillance-hover-settings')).toBeVisible();
  await page.mouse.move(700, 500); await expect(page.locator('#surveillance-hover-settings')).toBeVisible();
  await cctv.click(); await expect(page.locator('#surveillance-hover-settings')).toHaveCount(0);
  await page.getByRole('button', { name: 'Earthquakes', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Earthquakes' });
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await panel.getByLabel('History year').selectOption('2004');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(panel.locator('.quake-load')).toContainText('100%');
  await expect(panel.locator('.quake-row')).toHaveCount(2);
  expect(pages).toEqual(['0', '1']);
});

test('latest ticker cancels an in-flight history search', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  const quake = { id: 'live', source: 'USGS', time: Date.now(), lat: -7, lng: 110, depth: 10, magnitude: 5, place: 'Live event', felt: '', potential: '', shakemap: '', url: 'https://earthquake.usgs.gov' };
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/api/earthquakes*', async route => {
    const history = new URL(route.request().url()).searchParams.has('start');
    if (history) { requested = true; await wait; }
    await route.fulfill({ json: { items: [{ ...quake, place: history ? 'Old event' : 'Live event' }], latest: quake, total: 1, scanned: 1, hasMore: false, historyUnavailable: false, status: {} } }).catch(() => {});
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Earthquakes', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Earthquakes' });
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await panel.getByLabel('History year').selectOption('2004');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.locator('.quake-ticker-trigger').click(); release();
  await expect(panel.getByRole('button', { name: 'Latest', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.quake-row')).toContainText('Live event');
  await expect(panel.locator('.quake-row')).not.toContainText('Old event');
});
