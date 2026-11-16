import { test, expect } from './fixtures';
test('brand and footer accent align with viewport center', async ({ page }) => {
  await page.goto('/');
  for (const width of [1920, 1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const brand = page.locator('.tactical-brand');
    await expect(brand).toBeVisible();
    const box = await brand.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(1);
    if (width > 1200) {
      const accent = await page.locator('.tactical-status-accent i').boundingBox();
      expect(Math.abs(accent!.x + accent!.width / 2 - width / 2)).toBeLessThan(1);
    }
  }
});
