import { test, expect } from '@playwright/test';

test('OSINT preserves drawing, switches providers and opens independent feature panels', async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/osint/camera-health', (route) =>
    route.fulfill({ json: { health: {} } }),
  );
  await page.route('**/api/osint/camera-media/**', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'OSINT map workspace' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  const drawing = page.getByRole('button', { name: 'BMS drawing tools', exact: true });
  await expect(drawing).toBeEnabled();
  const initial = await (await page.request.get('/api/bms/projects/osint')).json();
  await drawing.click();
  await page.getByRole('button', { name: 'Point', exact: true }).click();
  await page.locator('.maplibregl-canvas').click({ position: { x: 600, y: 350 } });
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/bms/projects/osint')).json()).features.length,
    )
    .toBe(initial.features.length + 1);
  const project = await (await page.request.get('/api/bms/projects/osint')).json();
  await page.reload();
  await expect(drawing).toBeEnabled();
  await page.getByRole('button', { name: 'Objects and groups', exact: true }).click();
  await expect(page.locator('.osint-map-objects')).toBeVisible();
  await expect(page.locator('.osint-map-objects .bms-object-row')).toHaveCount(
    project.features.length,
  );
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/bms/projects/osint')).json()).features.length,
    )
    .toBe(project.features.length);
  await page.keyboard.press('Escape');
  const provider = page.locator('.map-provider-select');
  await provider.selectOption('osm');
  await expect(provider).toHaveValue('osm');
  await provider.selectOption('google');
  await expect(page.locator('.map-key-form')).toBeVisible();
  await provider.selectOption('esri');
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Weather', exact: true })
    .click();
  await expect(page.locator('.osint-weather-panel input[role=switch]')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Camera Sources' })).toBeVisible();
  await expect(page.locator('.surveillance-settings').getByRole('switch')).toHaveCount(4);
  await expect(page.locator('.surveillance-settings input[type="text"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Style studio', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Workspace Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#osint-map-footer .map-panel-navbar')).toBeVisible();
  await page.locator('.camera-card').first().click();
  await expect(page.locator('.inspector-video')).toBeVisible();
  await page.getByRole('button', { name: 'Favorite camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorite camera', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.camera-card')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.camera-card')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Recent', exact: true }).click();
  await expect(page.locator('.camera-card')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Cameras', exact: true }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  // Restore the layer panel if it was already open after reload.
  if (!(await page.locator('#camera-search').isVisible()))
    await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.locator('#camera-search').fill('ASIA AFRIKA');
  await expect(
    page
      .locator('.camera-card')
      .filter({ hasText: /ASIA AFRIKA/i })
      .first(),
  ).toBeVisible();
  expect(await page.locator('.camera-card').count()).toBeLessThan(512);
  await page.locator('#camera-search').fill('');
  await page.getByRole('button', { name: 'Hide camera panel', exact: true }).click();
  await expect(page.locator('.camera-dock-collapse')).toHaveAttribute('aria-hidden', 'true');
  await expect
    .poll(async () => (await page.locator('.camera-dock').boundingBox())!.height)
    .toBeLessThan(50);
  await expect(page.getByRole('tab', { name: 'Nearby', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show camera panel', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cameras', exact: true }).click();
  await expect
    .poll(async () => (await page.locator('.camera-dock').boundingBox())!.height)
    .toBeGreaterThan(100);
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const nav = rect('.workspace-nav'),
      panel = rect('.layer-panel'),
      map = rect('.osint-map-stage'),
      main = rect('.osint-map-workspace'),
      toolbar = rect('.workspace-map-toolbar'),
      header = rect('.command-header'),
      footer = rect('.workspace-status');
    return {
      narrow: nav.width <= 52 && panel.width <= 228,
      separate: nav.right <= panel.left && panel.right <= map.left,
      bottom:
        toolbar.top >= main.bottom && header.top >= toolbar.bottom && footer.top >= header.bottom,
    };
  });
  expect(bounds).toEqual({ narrow: true, separate: true, bottom: true });
  await page.screenshot({ path: 'test-results/osint-workspace.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(
    requests.filter((url) => /\/api\/(motor|targets|camera-relay|auth|gps)/.test(url)),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/osint-mobile.png', fullPage: true });
});
