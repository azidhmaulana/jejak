import { test, expect } from './fixtures';
test('province selection filters counts and persists until cleared', async ({ page }) => {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { setupRequired: false, user: {
    id: 'region-viewer', name: 'Viewer', email: 'viewer@example.test', role: 'viewer', active: true, permissions: ['routes.use'],
  } } }));
  await page.route('**/api/auth/preferences', (r) => r.fulfill({ json: { favorites: [], recent: [] } }));
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/analytics/events', (r) => r.fulfill({ json: { ok: true } }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const trigger = page.getByRole('button', { name: 'Regions', exact: true });
  await trigger.click();
  const panel = page.getByRole('complementary', { name: 'Regions', exact: true });
  const select = panel.getByLabel('Province', { exact: true });
  await expect(select.locator('option')).toHaveCount(39);
  const all = Number(
    (await panel.locator('.public-analytics-metrics b').first().innerText()).replace(/,/g, ''),
  );
  await select.selectOption('Jawa Barat');
  const jabar = Number(
    (await panel.locator('.public-analytics-metrics b').first().innerText()).replace(/,/g, ''),
  );
  expect(jabar).toBeGreaterThan(0);
  expect(jabar).toBeLessThan(all);
  await panel.getByLabel('Show province boundary').uncheck();
  await panel.getByRole('button', { name: 'Close regions' }).click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await trigger.click();
  await expect(select).toHaveValue('Jawa Barat');
  await panel.getByRole('button', { name: 'Reset to all provinces' }).click();
  await expect(select).toHaveValue('');
  await expect(panel.locator('.public-analytics-metrics b').first()).toHaveText(
    all.toLocaleString('en-US'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(844 * 0.6 + 1);
  expect(box!.x).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: '.runtime/regions-mobile.png' });
});
