import { test, expect } from '@playwright/test';

const cameras = Array.from({ length: 12 }, (_, i) => ({
  id: `audit-camera-${i}`,
  name: `Audit Camera ${i + 1}`,
  kind: 'camera',
  latitude: -6.9175 + Math.floor(i / 2) * 0.0001,
  longitude: 107.6191,
  url: 'https://camera.test/source',
  previewUrl: 'https://camera.test/preview.svg',
  provider: 'Audit',
}));

test.beforeEach(async ({ page }) => {
  await page.addInitScript((sources) => {
    if (sessionStorage.getItem('audit-initialized')) return;
    sessionStorage.setItem('audit-initialized', 'true');
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('osint-surveillance-bandung-v1', 'false');
    localStorage.setItem('osint-surveillance-config-v1', JSON.stringify(sources));
    localStorage.setItem(
      'osint-surveillance-switches-v1',
      JSON.stringify({ cameras: true, previews: true, showOffline: true, news: false }),
    );
    localStorage.setItem('jejak-camera-dock-collapsed', 'false');
  }, cameras);
  await page.route('https://camera.test/preview.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#163d26"/></svg>',
    }),
  );
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('pagination keeps cards and empty tabs stable; monitor never overlaps tray', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const before = await page.locator('#map-corner-compass').boundingBox();
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await expect(page.locator('.camera-card').first()).toBeVisible();
  const dock = await page.locator('.camera-dock').boundingBox();
  expect(Math.abs(dock!.x - (1440 - dock!.x - dock!.width))).toBeLessThan(1);
  expect((await page.locator('#map-corner-compass').boundingBox())!.y).toBe(before!.y);
  const width = (await page.locator('.camera-card').first().boundingBox())!.width;
  await page.getByRole('button', { name: 'Last camera page', exact: true }).click();
  expect((await page.locator('.camera-card').first().boundingBox())!.width).toBeCloseTo(width, 0);
  await expect(page.locator('.camera-pagination > span')).toHaveText(/\d+-12 \/ 12/);
  await page.getByRole('tab', { name: 'Favorites', exact: true }).click();
  expect((await page.locator('.camera-dock').boundingBox())!.height).toBe(dock!.height);
  await page.getByRole('tab', { name: 'Cameras', exact: true }).click();
  await page.locator('.camera-card').first().click();
  const monitor = await page.locator('.compact-monitor').boundingBox();
  const selectedDock = await page.locator('.camera-dock').boundingBox();
  expect(selectedDock!.x + selectedDock!.width).toBeLessThan(monitor!.x);
  expect(monitor!.y + monitor!.height).toBeGreaterThan(800);
  await page.getByRole('button', { name: 'Favorite camera', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await page.getByRole('tab', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.camera-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hide camera panel', exact: true }).click();
  await expect
    .poll(async () => (await page.locator('.camera-dock').boundingBox())!.height)
    .toBeLessThan(40);
  await page.reload();
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show camera panel', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('hover settings, preview threshold and multi-camera dropdown work together', async ({
  page,
}) => {
  await expect(page.locator('.osint-camera-mini')).toHaveCount(0);
  await page.getByRole('button', { name: 'Camera catalog', exact: true }).hover();
  const popover = page.locator('.surveillance-popover');
  await expect(popover.getByRole('switch')).toHaveCount(4);
  await popover.hover();
  await expect(popover).toBeVisible();
  await popover.getByRole('switch', { name: /CCTV CAMERAS/ }).uncheck();
  await expect(page.locator('.osint-camera-marker')).toHaveCount(0);
  await popover.getByRole('switch', { name: /CCTV CAMERAS/ }).check();
  await page.mouse.move(700, 100);
  await expect(popover).toHaveCount(0);
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await page.locator('.camera-card').first().click();
  await expect(page.locator('.monitor-camera-selector option')).toHaveCount(2);
  await page.locator('.monitor-camera-selector select').selectOption('audit-camera-1');
  await expect(page.locator('.monitor-title h2')).toHaveText('Audit Camera 2');
  await expect(page.locator('.osint-camera-mini').first()).toBeVisible();
  await page.getByRole('button', { name: 'Camera catalog', exact: true }).hover();
  await popover.getByRole('switch', { name: 'LIVE PREVIEWS', exact: true }).uncheck();
  await expect(page.locator('.osint-camera-mini')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Camera catalog', exact: true }).hover();
  await expect(
    popover.getByRole('switch', { name: 'LIVE PREVIEWS', exact: true }),
  ).not.toBeChecked();
});

test('expand, fullscreen and language survive state changes', async ({ page }) => {
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await page.locator('.camera-card').first().click();
  await page.getByRole('button', { name: 'Reconnect camera', exact: true }).click();
  await expect(page.locator('.monitor-refresh')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.monitor-refresh')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Expand camera', exact: true }).click();
  await expect
    .poll(async () => (await page.locator('.compact-monitor').boundingBox())!.width)
    .toBe(760);
  await page.getByRole('button', { name: 'Fullscreen camera', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.fullscreenElement?.classList.contains('compact-monitor')),
    )
    .toBe(true);
  await expect(page.locator('.monitor-footer')).toBeInViewport();
  await page.getByRole('button', { name: 'Exit camera fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByRole('button', { name: 'Close camera', exact: true }).click();
  await page.locator('.language-dropdown select').selectOption('id');
  await page.reload();
  await expect(page.locator('.language-dropdown select')).toHaveValue('id');
});

test('drawing persists and providers remain accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'Map provider settings', exact: true }).click();
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
  await page.reload();
  await page.getByRole('button', { name: 'Objects and groups', exact: true }).click();
  await expect(page.locator('.bms-object-row')).toHaveCount(initial.features.length + 1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Map provider settings', exact: true }).click();
  const provider = page.locator('.map-provider-select');
  await provider.selectOption('google');
  await expect(page.locator('.map-key-form')).toBeVisible();
  await provider.selectOption('esri');
  await page.locator('.tactical-basemap > button').nth(1).click();
  await expect(page.locator('.tactical-basemap > button').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

for (const width of [390, 768, 1024, 1440]) {
  test(`layout remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'CCTV', exact: true }).click();
    await expect(page.locator('.camera-card').first()).toBeVisible();
    await page.locator('.camera-card').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const bounds = await page.evaluate(() => {
      const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const dock = rect('.camera-dock'),
        monitor = rect('.compact-monitor'),
        header = rect('.command-header');
      const brand = rect('.tactical-brand'),
        utilities = rect('.navbar-utilities');
      return {
        gap: dock.top - monitor.bottom,
        horizontalGap: monitor.left - dock.right,
        bottom: innerHeight - monitor.bottom,
        top: monitor.top - header.bottom,
        headerGap: utilities.left - brand.right,
        left: rect('.tactical-rail').width,
        right: rect('.map-hud-buttons').width,
      };
    });
    expect(bounds.bottom).toBeLessThanOrEqual(80);
    if (width >= 1101) expect(bounds.horizontalGap).toBeGreaterThanOrEqual(8);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.headerGap).toBeGreaterThanOrEqual(0);
    expect(bounds.left).toBe(bounds.right);
  });
}

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('surveillance popover closes when tapping the map', async ({ page }) => {
    await page.getByRole('button', { name: 'Camera catalog', exact: true }).tap();
    await expect(page.locator('.surveillance-popover')).toBeVisible();
    await page.locator('.maplibregl-canvas').tap({ position: { x: 350, y: 500 } });
    await expect(page.locator('.surveillance-popover')).toHaveCount(0);
  });
});
