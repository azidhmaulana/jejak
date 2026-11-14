import { test, expect } from './fixtures';

test('earthquake analytics loads complete years and excludes duplicate and BMKG records', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { setupRequired: false, user: { id: 'quake-viewer', name: 'Viewer', email: 'v@example.test', role: 'viewer', active: true, permissions: [] } } }));
  await page.route('**/api/analytics/public*', route => route.fulfill({ json: { cameras: [], trend: [], regions: [] } }));
  await page.route('**/api/auth/preferences', route => route.fulfill({ json: { favorites: [], recent: [] } }));
  await page.route('**/api/analytics/events', route => route.fulfill({ json: { ok: true } }));
  const item = { id: 'usgs-a', time: Date.parse('2004-12-26'), magnitude: 9.1, lat: 3.2, lng: 95.9, depth: 30, source: 'USGS', place: 'Sumatra, Indonesia', url: 'https://earthquake.usgs.gov', felt: '', potential: '', shakemap: '' };
  await page.route('**/api/earthquakes*', route => {
    const params = new URL(route.request().url()).searchParams;
    const history = params.has('start'), second = params.get('page') === '1';
    return route.fulfill({ json: { items: history ? (second ? [item, { ...item, id: 'usgs-b', magnitude: 5.2 }, { ...item, id: 'usgs-foreign', magnitude: 9.5, place: 'Mindanao, Philippines' }] : [item, { ...item, id: 'bmkg-a', source: 'BMKG' }]) : [], latest: null, total: 3, scanned: second ? 2 : 1, hasMore: history && !second, historyUnavailable: false, status: {} } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.tactical-nav-left button').nth(2).click();
  const panel = page.getByRole('complementary', { name: 'Analytics' });
  await panel.getByRole('tab', { name: 'Earthquakes' }).click();
  await panel.getByLabel('From year').selectOption('2004');
  await panel.getByLabel('To year').selectOption('2004');
  await panel.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(panel.locator('.earthquake-summary > div').first()).toContainText('2');
  await expect(panel.locator('.earthquake-summary')).toContainText('M9.1');
  const ranking = panel.getByRole('region', { name: 'Top 5 largest earthquakes' });
  await expect(ranking.locator('li')).toHaveCount(2);
  await expect(ranking).not.toContainText('Philippines');
  await expect(ranking.locator('li').first()).toContainText('M9.1');
  await expect(ranking.locator('li').last()).toContainText('M5.2');
  await expect(ranking.getByRole('link').first()).toHaveAttribute('href', item.url);
  await panel.getByRole('tab', { name: 'CCTV' }).click();
  await expect(panel.getByLabel('Analytics period')).toBeVisible();
});
