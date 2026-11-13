import { test, expect } from './fixtures';

test('guest feature buttons stay visible and offer login below the trigger', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { user: null, setupRequired: false } }));
  await page.route('**/api/analytics/events', (r) => r.fulfill({ json: { ok: true } }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (const selector of [
    '.tactical-nav-left button:has(svg):nth-child(3)',
    '.tactical-nav-right button:has(svg.lucide-layers)',
    '.tactical-nav-right button:has(svg.lucide-map-pinned)',
    'button[aria-label="CCTV route"]',
  ]) {
    const button = page.locator(selector);
    await expect(button).toBeVisible();
    await button.click();
    const prompt = page.getByRole('dialog', { name: 'Login required' });
    await expect(prompt).toBeVisible();
    await expect(page.locator('.objects-panel, .province-panel, .route-panel, .public-analytics')).toHaveCount(0);
    const anchor = await button.boundingBox(), box = await prompt.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(anchor!.y + anchor!.height);
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(button).toBeFocused();
  }
  await page.getByRole('button', { name: 'CCTV route', exact: true }).click();
  await page.getByRole('dialog', { name: 'Login required' }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.account-backdrop')).toBeVisible();
  await expect(page.locator('.login-required-popover')).toHaveCount(0);
});
