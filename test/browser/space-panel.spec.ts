import { test, expect } from '@playwright/test';

test('space panel loads one player on demand, switches streams and unloads on close', async ({
  page,
}) => {
  let playerRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('osint-surveillance-bandung-v1', 'false');
  });
  await page.route('https://www.youtube-nocookie.com/embed/**', (route) => {
    playerRequests++;
    return route.fulfill({
      contentType: 'text/html',
      body: '<body style="background:#030b07;color:#8dbf98;font:12px sans-serif">YouTube player fixture</body>',
    });
  });
  await page.goto('/');
  expect(playerRequests).toBe(0);
  await page.getByRole('button', { name: 'Space', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Live from space' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('iframe')).toHaveCount(1);
  await expect(panel.locator('iframe')).toHaveAttribute('src', /fO9e9jnhYK8/);
  await panel.getByRole('button', { name: 'EARTH VIEW', exact: true }).click();
  await expect(panel.locator('iframe')).toHaveAttribute('src', /ROboUHfPUrU/);
  await panel.getByRole('button', { name: 'ISS CAMERA', exact: true }).click();
  await expect(panel.locator('iframe')).toHaveAttribute('src', /M3HKLzjvKPc/);
  await expect(panel.locator('iframe')).toHaveCount(1);
  await expect(panel.getByRole('link', { name: 'Open YouTube' })).toHaveAttribute(
    'href',
    /M3HKLzjvKPc/,
  );
  const before = playerRequests;
  await panel.getByRole('button', { name: 'Reload space stream' }).click();
  await expect.poll(() => playerRequests).toBe(before + 1);
  await panel.getByRole('button', { name: 'Expand space panel' }).click();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(640);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect
    .poll(async () => {
      const box = (await panel.boundingBox())!;
      return box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 700;
    })
    .toBe(true);
  await page.evaluate(async () => {
    const { setLanguage } = await import('/src/shared/i18n/runtime.js' as string);
    setLanguage('id');
  });
  const localized = page.getByRole('complementary', { name: 'Siaran antariksa' });
  await expect(localized.getByText('SIARAN ANTARIKSA', { exact: true })).toBeVisible();
  await expect(localized.getByRole('link', { name: 'Buka YouTube' })).toBeVisible();
  await page.screenshot({ path: '.runtime/space-panel-mobile.png' });
  await localized.getByRole('button', { name: 'Tutup panel antariksa' }).click();
  await expect(page.locator('#space-stream-panel iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Antariksa', exact: true }).click();
  await page.getByRole('button', { name: 'Muat ulang siaran antariksa' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#space-stream-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Antariksa', exact: true })).toBeFocused();
});
