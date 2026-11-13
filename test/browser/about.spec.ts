import { test, expect } from './fixtures';

test('ticker version opens About and Escape restores focus', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const version = page.getByRole('button', { name: 'About JEJAK', exact: true });
  await version.click();
  await expect(page.getByRole('dialog', { name: 'About JEJAK' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('v1.0.0');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'About JEJAK' })).toHaveCount(0);
  await expect(version).toBeFocused();
});
