import { test, expect } from './fixtures';

test('viewer analytics opens after login and monitor tracking excludes previews', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { setupRequired: false, user: {
    id: 'analytics-viewer', name: 'Viewer', email: 'viewer@example.test', role: 'viewer', active: true, permissions: ['routes.use'],
  } } }));
  await page.route('**/api/auth/preferences', (r) => r.fulfill({ json: { favorites: [], recent: [] } }));
  const events: { kind: string; camera?: string }[] = [];
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/analytics/events', async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/analytics/public?*', (route) =>
    route.fulfill({ json: { cameras: [], regions: [], trend: [] } }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => events.filter((e) => e.kind === 'visit').length).toBe(1);
  await page.locator('.tactical-nav-left button').nth(2).click();
  const panel = page.getByRole('complementary', { name: 'Analytics', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Collapse analytics' })).toHaveCount(0);
  await expect(panel.getByText('No camera activity yet.')).toBeVisible();
  await expect(panel.getByText('Unique visitors', { exact: true })).toHaveCount(0);
  expect(events.filter((e) => e.kind === 'camera_open')).toHaveLength(0);
  for (const [id, name] of [
    ['garut-diskominfo-22', 'Bunderan Kerkof'],
    ['garut-diskominfo-21', 'Simpang 5'],
  ]) {
    await page.getByRole('button', { name: 'Search cameras', exact: true }).click();
    await page.getByLabel('Search camera catalog', { exact: true }).fill(name);
    await page.locator('.navbar-camera-search [role=option]').first().click();
    await expect
      .poll(() => events.filter((e) => e.kind === 'camera_open' && e.camera === id).length)
      .toBe(1);
  }
});

test('CMS analytics has a separate admin view', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({
      json: {
        setupRequired: false,
        user: {
          id: 'analytics-admin',
          name: 'Admin',
          email: 'admin@example.test',
          role: 'admin',
          active: true,
          permissions: ['analytics.view', 'users.manage'],
        },
      },
    }),
  );
  await page.route('**/api/auth/preferences', (r) =>
    r.fulfill({ json: { favorites: [], recent: [] } }),
  );
  await page.route('**/api/auth/users', (r) => r.fulfill({ json: { users: [] } }));
  await page.route('**/api/auth/roles', (r) => r.fulfill({ json: { roles: [], permissions: [] } }));
  await page.route('**/api/analytics/admin?*', (r) =>
    r.fulfill({
      json: {
        cameras: [],
        regions: [],
        trend: [],
        summary: { visitors: 12, sessions: 15 },
        active: 2,
        devices: [],
        referrals: [],
      },
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'CMS', exact: true }).click();
  await page
    .locator('.cms-sidebar')
    .getByRole('button', { name: 'Analytics', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Admin analytics' })).toBeVisible();
  await expect(page.getByText('Unique visitors', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.runtime/analytics-cms.png' });
});

test('analytics handles period changes, errors, chart overflow and close on mobile', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { setupRequired: false, user: {
    id: 'analytics-viewer', name: 'Viewer', email: 'viewer@example.test', role: 'viewer', active: true, permissions: ['routes.use'],
  } } }));
  await page.route('**/api/auth/preferences', (r) => r.fulfill({ json: { favorites: [], recent: [] } }));
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  let fail = false;
  const requests: string[] = [];
  await page.route('**/api/analytics/events', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/analytics/public?*', (r) => {
    requests.push(r.request().url());
    return fail
      ? r.fulfill({ status: 503, json: { error: 'Unavailable' } })
      : r.fulfill({
          json: {
            cameras: [
              { id: 'test', name: 'A long camera name for overflow verification', views: 8 },
            ],
            regions: [],
            trend: Array.from({ length: 57 }, (_, i) => ({
              day:
                new Date(Date.UTC(2026, 10, 1) + i * 10800000).toISOString().slice(0, 16) +
                '+07:00',
              views: i % 8,
            })),
          },
        });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.tactical-nav-left button').nth(2).click();
  const panel = page.getByRole('complementary', { name: 'Analytics', exact: true });
  const chart = panel.locator('.camera-opening-scroll');
  await expect(chart.locator('rect')).toHaveCount(57);
  await expect.poll(() => chart.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await panel.getByLabel('Analytics period').selectOption('30');
  await expect.poll(() => requests.some((url) => url.endsWith('days=30'))).toBe(true);
  fail = true;
  await panel.getByRole('button', { name: 'Refresh analytics' }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  fail = false;
  await panel.getByRole('button', { name: 'Refresh analytics' }).click();
  await expect(chart.locator('rect')).toHaveCount(57);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThanOrEqual(844 * 0.6 + 1);
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeLessThanOrEqual(350);
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(844 * 0.6 + 1);
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await panel.getByRole('button', { name: 'Close analytics' }).click();
  await expect(panel).toHaveCount(0);
});
