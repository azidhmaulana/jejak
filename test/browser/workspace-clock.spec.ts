import { test, expect } from './fixtures';

test.use({ timezoneId: 'Asia/Jakarta' });
test('footer clock uses device time and persists format and zone choices', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const clock = page.locator('.workspace-clock');
  await expect(clock.getByRole('button', { name: 'Time zone', exact: true })).toHaveText('UTC+7');
  await clock.getByRole('button', { name: 'Time zone', exact: true }).click();
  await page.locator('#clock-zone').getByRole('button', { name: 'UTC+8', exact: true }).click();
  await expect(clock.getByRole('button', { name: 'Time zone', exact: true })).toHaveText('UTC+8');
  await clock.getByRole('button', { name: 'Date format', exact: true }).click();
  await page.locator('#clock-date button').last().click();
  await expect(clock.getByRole('button', { name: 'Date format', exact: true })).toHaveText(/\d{4}-\d{2}-\d{2}/);
  await clock.getByRole('button', { name: 'Time format', exact: true }).click();
  await page.locator('#clock-time button').last().click();
  await expect(clock.getByRole('button', { name: 'Time format', exact: true })).toHaveText(/\d{2}:\d{2} [ap]m/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(clock.getByRole('button', { name: 'Time zone', exact: true })).toHaveText('UTC+8');
  await clock.getByRole('button', { name: 'Time zone', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#clock-zone')).not.toBeVisible();
});
