import { test, expect } from '@playwright/test';

test('refresh shows radar splash before JavaScript and removes it after workspace paint', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/main.tsx*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#jejak-boot')).toBeVisible();
  await expect(page.locator('.boot-radar')).toBeVisible();
  await expect(page.locator('.command-header')).toHaveCount(0);
  await page.screenshot({ path: '.runtime/boot-preview.png' });
  release();
  await expect(page.locator('.command-header')).toBeVisible();
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.command-header')).toBeVisible();
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
});
