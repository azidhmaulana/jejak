import { test, expect } from './fixtures';
test('current cyclone panel, selection and marker toggle', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-cyclones', 'false');
  });
  await page.route('**/api/weather/cyclones', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'sh0427',
            name: 'TEST CYCLONE',
            designation: '04P',
            lat: -8,
            lng: 110,
            time: Date.now(),
            windKnots: 55,
            gustKnots: 70,
            direction: 245,
            speedKnots: 4,
            source: 'https://www.metoc.navy.mil/jtwc/products/sh0427web.txt',
          },
        ],
        feedTime: Date.now(),
      },
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tropical cyclones', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Tropical cyclones', exact: true });
  const toggle = panel.getByRole('switch', { name: 'Cyclone markers' });
  await toggle.check();
  await expect(page.locator('.cyclone-marker')).toHaveCount(1);
  await page.locator('.cyclone-marker').click();
  await expect(panel).toContainText('55 kt');
  await expect(panel).toContainText('70 kt');
  await expect(panel.getByRole('link', { name: 'JTWC' })).toHaveAttribute(
    'href',
    'https://www.metoc.navy.mil/jtwc/products/sh0427web.txt',
  );
  await toggle.uncheck();
  await expect(page.locator('.cyclone-marker')).toHaveCount(0);
});
