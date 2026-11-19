import { test, expect } from './fixtures';
test('weather fields switch exclusively, show values, loading, opacity and recover from errors', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-weather-clouds', 'false');
    localStorage.setItem('jejak-weather-wind', 'false');
  });
  await page.route('**/api/weather/fields/**', async (route) => {
    const field = new URL(route.request().url()).pathname.split('/').pop();
    if (field === 'uv') return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({
      json: {
        nx: 360,
        ny: 181,
        dx: 1,
        dy: 1,
        lon0: 0,
        lat0: 90,
        field,
        values: Array(65160).fill(field === 'pressure' ? 1010 : 25),
        validTime: Date.now(),
        referenceTime: Date.now() - 21600000,
      },
    });
  });
  await page.route('**/api/weather/wind?*', (r) =>
    r.fulfill({
      json: {
        nx: 360,
        ny: 181,
        dx: 1,
        dy: 1,
        lon0: 0,
        lat0: 90,
        u: Array(65160).fill(4),
        v: Array(65160).fill(2),
        validTime: Date.now(),
        referenceTime: Date.now() - 21600000,
      },
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const rail = page.getByRole('navigation', { name: 'Weather layers', exact: true });
  await rail.getByRole('button', { name: 'Temperature', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: 'Weather catalog', exact: true });
  await drawer.getByRole('button', { name: 'Temperature GFS / \u00b0C', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Weather field controls' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Model run:/)).toBeVisible({ timeout: 20000 });
  await expect(rail.getByRole('button', { name: 'Satellite', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('complementary', { name: 'Weather scale' })).toContainText('\u00b0C');
  await panel.getByRole('slider', { name: 'Weather opacity' }).fill('0.5');
  await expect(panel).toContainText('50%');
  await page.locator('.maplibregl-canvas').click({ position: { x: 550, y: 300 } });
  await expect(panel.locator('.scalar-reading')).toContainText('25.0');
  await drawer.getByRole('button', { name: 'Pressure GFS / hPa', exact: true }).click();
  await expect(panel.getByText(/Model run:/)).toBeVisible({ timeout: 20000 });
  await expect(panel.getByRole('switch', { name: 'Wind animation' })).toBeChecked();
  await panel.getByRole('switch', { name: 'Wind animation' }).uncheck();
  await drawer.getByRole('button', { name: 'UV index GFS / UVI', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Source unavailable');
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Humidity GFS / %', exact: true }).click();
  await expect(panel.getByText(/Model run:/)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: '.runtime/weather-fields-desktop.png' });
  await drawer.getByRole('button', { name: 'Close layer choices' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const legendBox = await page.getByRole('complementary', { name: 'Weather scale' }).boundingBox();
  expect(box!.y + box!.height).toBeLessThan(legendBox!.y);
  await page.screenshot({ path: '.runtime/weather-fields-mobile.png' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(panel.getByText(/Model run:/)).toBeVisible({ timeout: 20000 });
  await expect(panel).toContainText('Humidity');
  await panel.getByRole('button', { name: 'Close weather layer' }).click();
  await expect(panel).toHaveCount(0);
});

test('all temperature products and daily MODIS expose their own source and units', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/weather/fields/**', async (r) => {
    const field = new URL(r.request().url()).pathname.split('/').pop();
    await r.fulfill({
      json: {
        nx: 360,
        ny: 181,
        dx: 1,
        dy: 1,
        lon0: 0,
        lat0: 90,
        field,
        values: Array(65160).fill(20),
        validTime: Date.now(),
        referenceTime: Date.now() - 21600000,
      },
    });
  });
  await page.route('**/api/weather/surface', (r) =>
    r.fulfill({
      json: {
        date: '2026-11-15',
        tiles: 'https://gibs.earthdata.nasa.gov/wmts/test/{z}/{x}/{y}.png',
      },
    }),
  );
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    return c.toDataURL().split(',')[1];
  });
  await page.route('https://gibs.earthdata.nasa.gov/wmts/test/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('navigation', { name: 'Weather layers', exact: true })
    .getByRole('button', { name: 'Temperature', exact: true })
    .click();
  const drawer = page.getByRole('complementary', { name: 'Weather catalog', exact: true }),
    panel = page.getByRole('region', { name: 'Weather field controls' });
  for (const name of ['Dew point', 'Wet-bulb temperature', 'Solar radiation', 'UV index']) {
    await drawer.getByRole('button', { name: new RegExp('^' + name + ' GFS') }).click();
    await expect(panel.getByText(/Model run:/)).toBeVisible({ timeout: 15000 });
    await expect(panel.locator('header')).toContainText(name);
  }
  await panel.getByRole('slider', { name: 'Forecast hour' }).fill('24');
  await expect(panel.locator('.scalar-time output')).toHaveText('+24 h');
  await expect(panel.getByText(/Model run:/)).toBeVisible();
  await drawer.getByRole('button', { name: /^Surface heat/ }).click();
  await expect(panel).toContainText('NASA Aqua MODIS / 2026-11-15');
  await expect(panel.getByRole('slider', { name: 'Forecast hour' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Weather scale' })).toHaveCount(0);
  await expect(panel).toContainText('not air temperature');
  await expect(panel.getByRole('status', { name: 'Loading weather data' })).toHaveCount(0, {
    timeout: 20000,
  });
  await panel.getByRole('button', { name: 'Close weather layer' }).click();
  await expect(panel).toHaveCount(0);
});
