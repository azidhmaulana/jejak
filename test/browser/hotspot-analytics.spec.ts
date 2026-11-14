import { test, expect } from './fixtures';

test('hotspot analytics deduplicates detections, filters confidence and reports incomplete coverage', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-hotspots-enabled', 'false');
  });
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({
      json: {
        setupRequired: false,
        user: {
          id: 'hotspot-viewer',
          name: 'Viewer',
          email: 'v@example.test',
          role: 'viewer',
          active: true,
          permissions: [],
        },
      },
    }),
  );
  await page.route('**/api/auth/preferences', (r) =>
    r.fulfill({ json: { favorites: [], recent: [] } }),
  );
  await page.route('**/api/analytics/events', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/analytics/public*', (r) =>
    r.fulfill({ json: { cameras: [], trend: [], regions: [] } }),
  );
  let requests = 0;
  await page.route('**/api/hotspots?*', (r) => {
    requests++;
    const day = new URL(r.request().url()).searchParams.get('day')!;
    const item = {
      id: day,
      time: Date.parse(day) + 3600000,
      lat: -6.9175,
      lng: 107.6191,
      satellite: 'NOAA-20',
      confidence: 'high',
      frp: null,
      place: 'Bandung',
      providers: ['sipongi'],
    };
    return r.fulfill({
      json: {
        items: [
          item,
          { ...item, id: day + '-duplicate' },
          { ...item, id: day + '-low', time: item.time + 60000, confidence: 'low' },
        ],
        sources: { sipongi: { status: 'ok' }, firms: { status: 'needs-key' } },
      },
    });
  });
  await page.goto('/');
  await page.locator('.tactical-nav-left button').nth(2).click();
  const panel = page.getByRole('complementary', { name: 'Analytics' });
  await panel.getByRole('tab', { name: 'Hotspots', exact: true }).click();
  await panel.getByLabel('From date').fill('2020-01-01');
  await panel.getByLabel('To date').fill('2020-01-03');
  await panel.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(panel.locator('.earthquake-summary > div').nth(0)).toContainText('6');
  await expect(panel.locator('.earthquake-summary > div').nth(1)).toContainText('3');
  await expect(panel.locator('.quake-stat-bar.region')).toContainText('Jawa Barat');
  await expect(panel.getByRole('alert')).toContainText('Coverage is incomplete');
  expect(requests).toBe(3);
  const chart = panel.getByRole('img', { name: 'Hotspot detections per UTC day' });
  await expect(chart).toBeInViewport({ ratio: 0.9 });
  const compact = (await panel.boundingBox())!;
  await panel.getByRole('button', { name: 'Expand analytics', exact: true }).click();
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeGreaterThan(compact.width + 100);
  await expect(chart).toBeInViewport({ ratio: 1 });
  await expect(panel.locator('.earthquake-summary > div').nth(0)).toContainText('6');
  await page.screenshot({ path: '.runtime/hotspot-analytics-expanded.png' });
  await panel.getByRole('button', { name: 'Collapse analytics', exact: true }).click();
  await panel.locator('.hotspot-analytics-filter-box summary').click();
  await panel.getByRole('combobox', { name: 'Confidence', exact: true }).selectOption('high');
  await expect(panel.locator('.earthquake-summary > div').nth(0)).toContainText('3');
  expect(requests).toBe(3);
  await panel.getByLabel('To date').fill('2020-03-03');
  await expect(panel.getByRole('button', { name: 'Show', exact: true })).toBeDisabled();
  await page.screenshot({ path: '.runtime/hotspot-analytics.png' });
});
