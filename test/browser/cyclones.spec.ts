import { test, expect } from './fixtures';
test('current cyclone panel, selection and marker toggle', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-cyclones', 'false');
  });
  await page.route('**/api/weather/cyclones', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            agency: 'JTWC',
            windPeriodMinutes: 1,
            id: 'invest-96s-2026',
            kind: 'invest',
            potential: 'MEDIUM',
            windRangeKnots: [28, 33],
            name: '96S',
            designation: '04P',
            lat: -8,
            lng: 110,
            time: Date.now(),
            windKnots: null,
            gustKnots: 70,
            direction: 245,
            speedKnots: 4,
            source: 'https://www.metoc.navy.mil/jtwc/products/abioweb.txt',
          },
        ],
        feedTime: Date.now(),
        sources: [
          { agency: 'JTWC', status: 'ok', count: 1 },
          { agency: 'NHC', status: 'ok', count: 0 },
          { agency: 'JMA', status: 'ok', count: 0 },
        ],
      },
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('navigation', { name: 'Weather layers', exact: true })
    .getByRole('button', { name: 'Storm tracker', exact: true })
    .click();
  await page.getByRole('button', { name: 'Storm settings', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Tropical cyclones', exact: true });
  const toggle = panel.getByRole('switch', { name: 'Cyclone markers' });
  await toggle.check();
  await expect(page.locator('.cyclone-marker')).toHaveCount(1);
  await page.locator('.cyclone-marker').click();
  await expect(panel).toContainText('28-33 kt');
  const row = panel.locator('.cyclone-list > button').first();
  const rowBox = await row.boundingBox();
  const listBox = await panel.locator('.cyclone-list').boundingBox();
  expect(rowBox!.width).toBeGreaterThan(60);
  expect(rowBox!.width).toBeLessThan(listBox!.width / 2);
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(282);
  expect(await row.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await panel.locator('summary').click();
  await expect(panel).toContainText('JTWC: 1');
  await expect(panel).toContainText('NHC: 0');
  await expect(panel).toContainText('70 kt');
  await expect(panel).toContainText('MEDIUM');
  await expect(panel).toContainText('96S (Invest)');
  await expect(panel.getByRole('link', { name: 'JTWC', exact: true })).toHaveAttribute(
    'href',
    'https://www.metoc.navy.mil/jtwc/products/abioweb.txt',
  );
  await expect(page.locator('.cyclone-marker-symbol img')).toHaveAttribute(
    'src',
    '/images/weather/cyclone.svg',
  );
  await toggle.uncheck();
  await expect(page.locator('.cyclone-marker')).toHaveCount(0);
});


test('forecast track appears on selection and is removed when disabled', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-cyclones', 'true');
  });
  const time = Math.floor(Date.now()/(6*3600000))*(6*3600000);
  await page.route('**/api/weather/cyclones', route => route.fulfill({ json: {
    items: [{ id: 'sh0426', name: 'Test storm', designation: '04P', agency: 'JTWC',
      time, lat: -8, lng: 110, windKnots: 50, gustKnots: 60, direction: 180, speedKnots: 5,
      source: 'https://www.metoc.navy.mil/jtwc/products/sh0426web.txt',
      forecast: [{ time: time + 12 * 3600000, lat: -10, lng: 111, windKnots: 55 },
        { time: time + 24 * 3600000, lat: -12, lng: 112, windKnots: 60 }] }], feedTime: time
  } }));
  await page.route('**/api/weather/cyclones/sh0426/history', route => route.fulfill({json:{id:'sh0426',points:[
    {time:time-12*3600000,lat:-6,lng:108,windKnots:35,pressureHpa:1000},
    {time:time-6*3600000,lat:-7,lng:109,windKnots:40,pressureHpa:990}
  ]}}));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cyclone-marker')).toHaveCount(1);
  await expect(page.locator('.cyclone-forecast-point')).toHaveCount(0);
  await page.locator('.cyclone-marker').click();
  await expect(page.locator('.cyclone-forecast-point')).toHaveCount(5);
  await expect(page.locator('.cyclone-forecast-point[data-kind=history]')).toHaveCount(2);
  await expect(page.locator('.cyclone-forecast-point[data-kind=current]')).toHaveCount(1);
  await expect(page.locator('.cyclone-forecast-point[data-kind=history]').first()).toContainText('1000 hPa');
  await expect(page.locator('.cyclone-forecast-point[data-kind=forecast]').first()).toContainText('55 kt');
  await page.getByRole('switch', { name: 'Cyclone markers' }).uncheck();
  await expect(page.locator('.cyclone-forecast-point')).toHaveCount(0);
});
