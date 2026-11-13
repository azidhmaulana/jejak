import { test, expect } from './fixtures';

test('footer layers toggle actual state and coordinates follow the pointer', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Map layers', exact: true }).click();
  const layers = page.getByRole('region', { name: 'Map layers' });
  const cctv = layers.getByRole('switch', { name: 'CCTV', exact: true });
  await expect(cctv).toBeChecked(); await cctv.uncheck(); await expect(cctv).not.toBeChecked();
  await page.getByRole('button', { name: 'Camera catalog', exact: true }).click();
  await expect(page.locator('#surveillance-hover-settings').getByRole('switch', { name: /CCTV CAMERAS/ })).not.toBeChecked();
  await page.mouse.move(600, 350);
  const coordinates = page.locator('.status-coordinates');
  await expect(coordinates).toHaveText(/-?\d+\.\d+, -?\d+\.\d+/);
  const before = await coordinates.textContent();
  await page.mouse.move(800, 450, { steps: 5 });
  await expect(coordinates).not.toHaveText(before!);
  await expect(page.locator('.tactical-sync')).toHaveCount(0);
  await expect(page.locator('.workspace-status')).not.toContainText('ENTITIES');
});
