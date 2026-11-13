import { test, expect } from './fixtures';

test('sidebar needs an initial click, switches on hover, and exit disables hover', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const camera = page.getByRole('button', { name: 'Camera catalog', exact: true });
  const earthquake = page.getByRole('button', { name: 'Earthquakes', exact: true });
  const settings = page.locator('#surveillance-hover-settings');
  const quakes = page.getByRole('complementary', { name: 'Earthquakes' });
  await camera.hover(); await expect(settings).toHaveCount(0);
  await camera.click(); await expect(settings).toBeVisible();
  await earthquake.hover(); await expect(quakes).toBeVisible(); await expect(settings).toHaveCount(0);
  await camera.hover(); await expect(settings).toBeVisible(); await expect(quakes).toHaveCount(0);
  await page.getByRole('button', { name: 'Close camera surveillance', exact: true }).click();
  await earthquake.hover(); await expect(quakes).toHaveCount(0);
  await earthquake.click(); await expect(quakes).toBeVisible();
  await quakes.getByRole('button', { name: 'Close earthquakes', exact: true }).click();
  await camera.hover(); await expect(settings).toHaveCount(0);
});
