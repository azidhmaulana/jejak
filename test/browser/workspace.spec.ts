import { readFile } from 'node:fs/promises';
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

test('development server blocks private runtime files including raw and encoded URLs', async ({
  page,
}) => {
  for (const url of [
    '/.runtime/browser-tests/setup-token.txt',
    '/.runtime/browser-tests/accounts.sqlite',
    '/.runtime/browser-tests/accounts.sqlite-wal',
    '/.RUNTIME/browser-tests/setup-token.txt',
    '/%2eruntime/browser-tests/setup-token.txt',
    '/.runtime/browser-tests/setup-token.txt?raw',
    '/.runtime/browser-tests/setup-token.txt?url',
    `/@fs/${process.cwd().replaceAll('\\', '/')}/.runtime/browser-tests/setup-token.txt`,
  ])
    expect((await page.request.get(url)).status(), url).toBe(403);
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
  const session = await (await page.request.get('/api/auth/session')).json();
  if (session.setupRequired) {
    const response = await page.request.post('/api/auth/setup', {
      data: {
        token: await readFile('.runtime/browser-tests/setup-token.txt', 'utf8'),
        name: 'Browser Admin',
        email: 'browser@example.test',
        password: 'browser-test-password-123',
      },
    });
    expect(response.ok()).toBeTruthy();
  } else {
    const response = await page.request.post('/api/auth/login', {
      data: { email: 'browser@example.test', password: 'browser-test-password-123' },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.reload();

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
  // A real logout must clear private map state as well as the server cookie.
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, sign out', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const modulePath = '/src/modules/drawing/mapToolsStore.ts';
        const { useMapTools } = await import(modulePath);
        return useMapTools.getState().features.length;
      }),
    )
    .toBe(0);
  expect((await page.request.get('/api/bms/projects/osint')).status()).toBe(401);
  expect(await page.evaluate(() => localStorage.getItem('osint-map-project-v2'))).toBeNull();
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
        headerVerticalGap: utilities.top - brand.bottom,
        left: rect('.tactical-rail').width,
        right: rect('.map-hud-buttons').width,
      };
    });
    expect(bounds.bottom).toBeLessThanOrEqual(80);
    if (width >= 1101) expect(bounds.horizontalGap).toBeGreaterThanOrEqual(8);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.headerGap >= 0 || bounds.headerVerticalGap >= 0).toBe(true);
    expect(bounds.left).toBe(40);
    expect(bounds.right).toBe(34);
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

test('language menu contrast and dynamic English copy remain readable', async ({ page }) => {
  const option = page.locator('.language-dropdown option[value="en"]');
  await expect(option).toHaveCSS('color', 'rgb(230, 244, 233)');
  await expect(option).toHaveCSS('background-color', 'rgb(11, 28, 20)');
  await expect(page.locator('.ticker-track').first()).toContainText('registered cameras');
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await page.getByRole('tab', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.camera-dock')).toContainText('No favorites yet.');
  await page.locator('.language-dropdown select').selectOption('id');
  await expect(page.locator('.ticker-track').first()).toContainText('kamera terdaftar');
  await expect(page.locator('.camera-dock')).toContainText('Belum ada favorit.');
  await page.locator('.language-dropdown select').selectOption('en');
  await expect(page.locator('.camera-dock')).toContainText('No favorites yet.');
});

test('guest signs in as Viewer, filters CCTV by route and saves a private route', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'CCTV route', exact: true })).toHaveCount(0);
  expect(
    (
      await page.request.post('/api/routes/calculate', {
        data: { start: [107.61, -6.91], end: [107.62, -6.92] },
      })
    ).status(),
  ).toBe(401);
  const session = await (await page.request.get('/api/auth/session')).json();
  if (session.setupRequired)
    await page.request.post('/api/auth/setup', {
      data: {
        token: await readFile('.runtime/browser-tests/setup-token.txt', 'utf8'),
        name: 'Browser Admin',
        email: 'browser@example.test',
        password: 'browser-test-password-123',
      },
    });
  else
    await page.request.post('/api/auth/login', {
      data: { email: 'browser@example.test', password: 'browser-test-password-123' },
    });
  const email = `viewer-${Date.now()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/users', {
        data: { name: 'Route Viewer', email, password: 'viewer-test-password-123', role: 'viewer' },
      })
    ).status(),
  ).toBe(201);
  await page.request.post('/api/auth/logout');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const account = page.getByRole('dialog');
  await account.getByLabel('Email', { exact: true }).fill(email);
  await account.getByLabel('Password', { exact: true }).fill('wrong-password-123');
  await account.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.toast-item.error')).toContainText('Invalid email or password.');
  await account.getByLabel('Password', { exact: true }).fill('viewer-test-password-123');
  await account.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(account).toHaveCount(0);
  await expect(page.locator('.toast-item.success')).toContainText('Signed in successfully.');
  await expect(page.getByRole('button', { name: 'Drawing workspace' })).toBeDisabled();
  await page.route('**/api/routes/calculate', (route) =>
    route.fulfill({
      json: {
        start: [107.61, -6.91],
        end: [107.62, -6.92],
        tolerance: 50,
        distance: 2500,
        duration: 300,
        provider: 'OSRM',
        geometry: {
          type: 'LineString',
          coordinates: [
            [107.61, -6.91],
            [107.62, -6.92],
          ],
        },
        cameras: [{ ...cameras[0], distanceAlongRoute: 100, distanceFromRoute: 20 }],
      },
    }),
  );
  await page.getByRole('button', { name: 'CCTV route', exact: true }).click();
  const panel = page.getByRole('region', { name: 'CCTV route' });
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [107.61, -6.91] },
            properties: {
              name: 'Bandung',
              state: 'Jawa Barat',
              country: 'Indonesia',
            },
          },
        ],
      },
    }),
  );
  const startInput = panel.getByRole('combobox', { name: /Start/ });
  await expect(panel).toHaveAttribute('data-expanded', 'false');
  await startInput.fill('Bandung draft');
  await panel.getByRole('button', { name: /Clear A/ }).click();
  await expect(startInput).toHaveValue('');
  await startInput.fill('Bandung');
  await panel.getByRole('option', { name: 'Bandung, Jawa Barat, Indonesia' }).click();
  await expect(startInput).toHaveValue('Bandung, Jawa Barat, Indonesia');
  await panel.getByRole('combobox', { name: 'B · Destination', exact: true }).fill('-6.92, 107.62');
  await panel.getByRole('combobox', { name: 'B · Destination', exact: true }).blur();
  await startInput.fill('Bandung baru');
  await expect(panel.getByRole('button', { name: 'Find route', exact: true })).toBeDisabled();
  await panel.getByRole('option', { name: 'Bandung, Jawa Barat, Indonesia' }).waitFor();
  await startInput.press('ArrowDown');
  await startInput.press('Enter');
  await expect(startInput).toHaveValue('Bandung, Jawa Barat, Indonesia');
  await panel.getByRole('button', { name: 'Find route', exact: true }).click();
  await expect(panel).toContainText('2.5 km');
  await expect(panel).toHaveAttribute('data-expanded', 'true');
  await panel.getByRole('button', { name: 'Not expand' }).click();
  await expect(panel).toHaveAttribute('data-expanded', 'false');
  await expect(panel.getByRole('region', { name: 'CCTV along route' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Expand' }).click();
  await expect(panel.getByRole('region', { name: 'CCTV along route' })).toBeVisible();
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(628);
  await page.screenshot({ path: '.runtime/route-expanded.png' });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const container = document.querySelector('.maplibregl-map') as any;
        let fiber =
          container?.[Object.keys(container).find((key) => key.startsWith('__reactFiber'))!];
        while (fiber) {
          let hook = fiber.memoizedState;
          while (hook) {
            const map = hook.memoizedState?.current;
            if (map?.getLayer && map.getLayer('jejak-route-line')) {
              const ids = map.getStyle().layers.map((layer: any) => layer.id);
              return (
                ids.indexOf('jejak-cameras-points') > ids.indexOf('jejak-route-line') &&
                ids.indexOf('jejak-cameras-selected') > ids.indexOf('jejak-route-line')
              );
            }
            hook = hook.next;
          }
          fiber = fiber.return;
        }
        return false;
      }),
    )
    .toBe(true);
  await panel.getByRole('button', { name: 'Motorcycle', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Motorcycle', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const motorcycleRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/routes/calculate') && request.postDataJSON()?.mode === 'motorcycle',
  );
  await panel.getByRole('button', { name: 'Find route', exact: true }).click();
  await motorcycleRequest;
  await expect(panel).toContainText('2.5 km');

  await expect(panel.locator('.route-cameras li')).toHaveCount(1);
  await page.getByRole('button', { name: 'CCTV', exact: true }).click();
  await expect(page.locator('.camera-card')).toHaveCount(1);
  await panel.getByLabel('Route name', { exact: true }).fill('My test route');
  await panel.getByRole('button', { name: 'Save route', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'My test route', exact: true })).toBeVisible();
  await startInput.fill('Unselected start text');
  await panel.getByRole('combobox', { name: /Destination/ }).fill('Unselected destination text');
  await panel.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(startInput).toHaveValue('');
  await expect(panel.getByRole('combobox', { name: /Destination/ })).toHaveValue('');

  await expect(page.locator('.camera-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CMS', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText(
    'Route Viewer',
  );
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Sign out of JEJAK?' });
  await expect(confirmation).toBeVisible();
  expect((await (await page.request.get('/api/auth/session')).json()).user).not.toBeNull();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText(
    'Route Viewer',
  );
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Yes, sign out', exact: true }).click();

  await expect(page.getByRole('button', { name: 'CCTV route', exact: true })).toHaveCount(0);
  await expect(panel).toHaveCount(0);
});

test('account dropdown opens separate profile and CMS tables for administrators', async ({
  page,
}) => {
  const session = await (await page.request.get('/api/auth/session')).json();
  if (session.setupRequired)
    await page.request.post('/api/auth/setup', {
      data: {
        token: await readFile('.runtime/browser-tests/setup-token.txt', 'utf8'),
        name: 'Browser Admin',
        email: 'browser@example.test',
        password: 'browser-test-password-123',
      },
    });
  else
    await page.request.post('/api/auth/login', {
      data: { email: 'browser@example.test', password: 'browser-test-password-123' },
    });
  await page.reload();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.locator('.account-dropdown hr')).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show current password', exact: true }).click();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page.screenshot({ path: 'test-results/profile-design.png' });

  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Users', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'CMS', exact: true }).click();
  const cms = page.getByRole('dialog', { name: 'JEJAK CMS' });
  await expect(cms.getByRole('table')).toBeVisible();
  await expect(cms).not.toContainText('superadmin');
  expect((await cms.boundingBox())!.width).toBe(940);
  await cms.getByRole('button', { name: 'CCTV Source', exact: true }).click();
  await expect(cms.locator('.cms-source-summary')).toContainText('2254');
  await expect(cms.locator('.cms-camera-sources tbody tr')).toHaveCount(99);
  const filterBoxes = await cms
    .locator('.cms-source-field > .cms-search, .cms-source-field > select')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        y: element.getBoundingClientRect().y,
        height: element.getBoundingClientRect().height,
      })),
    );
  expect(filterBoxes).toHaveLength(3);
  expect(new Set(filterBoxes.map((box) => box.y)).size).toBe(1);
  expect(filterBoxes.every((box) => box.height === 36)).toBe(true);
  await cms.getByRole('combobox', { name: 'Filter city' }).selectOption('Kota Bandung');
  await expect(cms.locator('.cms-camera-sources tbody tr')).toHaveCount(2);
  await cms.getByRole('combobox', { name: 'Filter city' }).selectOption('Kabupaten Bandung');
  await expect(cms.locator('.cms-camera-sources tbody tr')).toHaveCount(1);
  await expect(cms.locator('.cms-camera-sources tbody tr')).toContainText(
    'DISHUB KABUPATEN BANDUNG',
  );
  await cms.getByRole('combobox', { name: 'Filter province' }).selectOption('Jawa Barat');
  await expect(cms.getByRole('combobox', { name: 'Filter city' })).toHaveValue('');
  await expect(cms.locator('.cms-camera-sources tbody tr')).toHaveCount(15);
  await cms.getByRole('combobox', { name: 'Filter city' }).selectOption('Kabupaten Garut');
  await expect(cms.locator('.cms-camera-sources tbody tr')).toHaveCount(1);
  await expect(cms.locator('.cms-camera-sources tbody tr')).toContainText('DISKOMINFO GARUT');
  await expect(
    cms.getByRole('checkbox', { name: 'Active DISKOMINFO GARUT', exact: true }),
  ).toBeChecked();
  await cms.getByRole('combobox', { name: 'Filter city' }).selectOption('');
  await expect(cms.locator('.cms-camera-sources tbody tr').first()).toContainText('West Java');
  await cms.getByRole('textbox', { name: 'Search CCTV sources' }).fill('no matching provider');
  await expect(cms.locator('.cms-camera-sources')).toContainText('No matching sources.');
  await cms.getByRole('textbox', { name: 'Search CCTV sources' }).fill('cimahi');
  await expect(cms.locator('.cms-camera-sources tbody tr')).toHaveCount(1);
  await expect(cms.locator('.cms-camera-sources tbody tr')).toContainText('CCTV CIMAHI');
  const activeSource = cms.getByRole('checkbox', { name: 'Active CCTV CIMAHI', exact: true });
  await expect(activeSource).toBeChecked();
  try {
    await activeSource.uncheck();
    await expect(activeSource).not.toBeChecked();
    await expect(activeSource).toBeEnabled();
    expect(
      (await (await page.request.get('/api/cctv-source-state')).json()).active['CCTV CIMAHI'],
    ).toBe(false);
    await cms.getByRole('button', { name: 'Settings', exact: true }).click();
    await cms.getByRole('button', { name: 'CCTV Source', exact: true }).click();
    await expect(
      cms.getByRole('checkbox', { name: 'Active CCTV CIMAHI', exact: true }),
    ).not.toBeChecked();
  } finally {
    await page.request.patch('/api/cctv-sources', { data: { name: 'CCTV CIMAHI', active: true } });
  }
  await cms.getByRole('button', { name: 'Users', exact: true }).click();
  await cms
    .getByRole('button', { name: /^Edit .*@/ })
    .first()
    .click();
  await expect(cms.locator('select[name=role]')).toBeVisible();
  await cms.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: 'test-results/cms-users-compact.png' });
  await cms.getByRole('button', { name: 'Roles & permissions', exact: true }).click();
  await cms.getByRole('button', { name: 'Edit viewer', exact: true }).click();
  await expect(cms.getByLabel('Role name', { exact: true })).toHaveValue('viewer');
  await page.screenshot({ path: 'test-results/cms-tables.png' });
  await cms.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(cms).toHaveCount(0);
  const email = `cms-admin-${Date.now()}@example.test`;
  await page.request.post('/api/auth/users', {
    data: { name: 'CMS Admin', email, password: 'cms-admin-password-123', role: 'admin' },
  });
  await page.request.post('/api/auth/logout');
  await page.request.post('/api/auth/login', {
    data: { email, password: 'cms-admin-password-123' },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'CMS', exact: true }).click();
  await expect(cms.getByRole('table')).toBeVisible();
  await expect(cms).not.toContainText('superadmin');
  await cms.getByRole('button', { name: 'Roles & permissions', exact: true }).click();
  await expect(cms.getByRole('button', { name: 'Add role', exact: true })).toHaveCount(0);
  await expect(cms).toContainText('Read only');
  await expect(cms.getByRole('button', { name: 'CCTV Source', exact: true })).toHaveCount(0);
});

test('public registration creates a Viewer account', async ({ page }) => {
  const session = await (await page.request.get('/api/auth/session')).json();
  if (session.setupRequired) {
    await page.request.post('/api/auth/setup', {
      data: {
        token: await readFile('.runtime/browser-tests/setup-token.txt', 'utf8'),
        name: 'Browser Admin',
        email: 'browser@example.test',
        password: 'browser-test-password-123',
      },
    });
    await page.request.post('/api/auth/logout');
    await page.reload();
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Register', exact: true }).click();
  await dialog.getByLabel('Full name', { exact: true }).fill('Public Viewer');
  await dialog.getByLabel('Email', { exact: true }).fill(`public-${Date.now()}@example.test`);
  await dialog.getByLabel('Password', { exact: true }).fill('public-password-123');
  await dialog.getByLabel('Confirm password', { exact: true }).fill('public-password-123');
  await dialog.locator('input[name=terms]').check();
  await page.screenshot({ path: 'test-results/register-design.png' });
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'CCTV route', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CMS', exact: true })).toHaveCount(0);
});

test('keyboard camera search stays valid when available sources change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Search cameras', exact: true }).click();
  const input = page.getByLabel('Search camera catalog', { exact: true });
  await input.fill('Audit Camera');
  for (let i = 0; i < 5; i++) await input.press('ArrowDown');
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    useSurveillance.setState({ sources: useSurveillance.getState().sources.slice(0, 1) });
  });
  await expect(page.locator('#navbar-camera-results [role=option]')).toHaveCount(1);
  await input.press('Enter');
  await expect(page.locator('.camera-inspector h2')).toHaveText('Audit Camera 1');
  expect(errors).toEqual([]);
});

test('toll camera catalog search opens streams and flies to mapped results', async ({ page }) => {
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    const { useWorkspace } = await import('/src/features/osint/workspaceStore.ts' as string);
    useSurveillance.setState({ bandung: false });
    useWorkspace.setState({ cameraTab: 'nearby' });
  });
  await page.getByRole('button', { name: 'Search cameras', exact: true }).click();
  await page.getByLabel('Search camera catalog', { exact: true }).fill('BINA MARGA');
  await expect(page.locator('#navbar-camera-results [role=option]').first()).toBeVisible();
  await page.getByRole('button', { name: /Show more/ }).click();
  await expect(page.locator('#navbar-camera-results [role=option]')).toHaveCount(40);
  await expect(page.locator('.camera-card')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useWorkspace } = await import('/src/features/osint/workspaceStore.ts' as string);
        return useWorkspace.getState().cameraTab;
      }),
    )
    .toBe('all');
  await page.locator('#navbar-camera-results [role=option]').first().click();
  await expect(page.locator('.navbar-camera-search')).toHaveCount(0);
  await expect(page.locator('.camera-inspector')).toBeVisible();
  await expect(page.locator('.camera-card')).toHaveCount(0);

  await page.getByRole('button', { name: 'Search cameras', exact: true }).click();
  await page.getByLabel('Search camera catalog', { exact: true }).fill('Audit Camera 1');
  await page.locator('#navbar-camera-results [role=option]').first().click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = document.querySelector('.maplibregl-map') as any;
        let fiber = element?.[Object.keys(element).find((key) => key.startsWith('__reactFiber'))!];
        while (fiber) {
          let hook = fiber.memoizedState;
          while (hook) {
            const map = hook.memoizedState?.current;
            if (map?.getZoom && map?.getCenter)
              return (
                Math.abs(map.getZoom() - 14) < 0.01 &&
                Math.abs(map.getCenter().lng - 107.6191) < 0.001
              );
            hook = hook.next;
          }
          fiber = fiber.return;
        }
        return false;
      }),
    )
    .toBe(true);
});
