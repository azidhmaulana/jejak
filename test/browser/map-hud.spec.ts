import { test, expect } from './fixtures';

test('map actions locate, measure and reset', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -6.2, longitude: 106.8 });
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'My location', exact: true }).click();
  await expect(page.locator('.status-coordinates')).toContainText('106.8000', { timeout: 15000 });
  await page.getByRole('button', { name: 'Measure distance', exact: true }).click();
  const measure = page.getByRole('region', { name: 'Distance measurement' });
  await expect(measure).toBeVisible();
  await page.mouse.click(500, 350); await page.mouse.click(700, 400);
  await expect(measure.locator('output')).toContainText('2 points');
  await measure.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(measure.locator('output')).toContainText('1 points');
  await measure.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(measure).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset to Indonesia', exact: true }).click();
});
