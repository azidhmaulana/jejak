import { test, expect } from './fixtures';

test('wind particles draw transparent trails and clean up when disabled', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-weather-wind', 'false');
    localStorage.setItem('jejak-weather-clouds', 'false');
    localStorage.setItem('jejak-weather-particles', 'true');
  });
  await page.route('**/api/weather/wind?*', (route) => {
    return route.fulfill({
      json: {
        nx: 360,
        ny: 181,
        lon0: 0,
        lat0: 90,
        dx: 1,
        dy: 1,
        validTime: Date.now(),
        referenceTime: Date.now() - 21600000,
        u: Array(65160).fill(8),
        v: Array(65160).fill(0),
      },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Wind', exact: true }).click();
  await page.getByRole('button', { name: 'Settings Wind', exact: true }).click();
  const wind = page.getByRole('switch', { name: 'Wind layer', exact: true });
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((url) => url.includes('/deps/maplibre-gl.js'))!;
    const { Map } = await import(url);
    const add = Map.prototype.addLayer;
    Map.prototype.addLayer = function (layer: { id: string }, ...args: unknown[]) {
      if (layer.id === 'jejak-wind-flow') (window as any).__windMap = this;
      return add.call(this, layer, ...args);
    };
  });
  await wind.check();
  await expect(page.getByRole('complementary', { name: 'Wind speed legend' })).toBeVisible();
  await expect(page.locator('.wind-legend')).toContainText('mph');
  const legendBox = await page.locator('.wind-legend').boundingBox();
  const basemapBox = await page.locator('.tactical-basemap').boundingBox();
  expect(legendBox!.width).toBe(260);
  expect(legendBox!.height).toBe(16);
  expect(Math.abs(legendBox!.x - basemapBox!.x)).toBeLessThanOrEqual(1);
  expect(basemapBox!.y - legendBox!.y - legendBox!.height).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Close wind', exact: true }).click();
  await page.locator('.wind-legend').screenshot({ path: '.runtime/wind-legend-compact.png' });
  await page.getByRole('button', { name: 'Settings Wind', exact: true }).click();
  expect(
    await page.evaluate(async () => {
      const { windColor } = await import('/src/features/weather/windColors.ts' as string);
      return [windColor(0), windColor(8), windColor(50)];
    }),
  ).toEqual(['#21166b', '#248c91', '#780a70']);
  await expect(
    page.locator('.osint-wind-canvas:not(.osint-wind-speed):not(.osint-wind-boundary)'),
  ).toHaveCount(1);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const canvas = document.querySelector(
            '.osint-wind-canvas:not(.osint-wind-speed):not(.osint-wind-boundary)',
          ) as HTMLCanvasElement;
          const pixels = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
          return count;
        }),
      { timeout: 15000 },
    )
    .toBeGreaterThan(500);
  await page.getByRole('slider', { name: 'Wind opacity', exact: true }).fill('35');
  await expect
    .poll(() => page.evaluate(() => (window as any).__windMap?.getLayer('jejak-wind-flow')?.type))
    .toBe('raster');
  expect(
    await page.evaluate(() => {
      const layers = (window as any).__windMap.getStyle().layers;
      const windIndex = layers.findIndex((l: any) => l.id === 'jejak-wind-flow');
      return layers
        .filter((l: any) => /jejak-(cameras|earthquake|hotspot|province)/.test(l.id))
        .every((l: any) => layers.indexOf(l) > windIndex);
    }),
  ).toBe(true);
  await page.evaluate(async () => {
    const { useOsintWeather } = await import(
      '/src/features/weather/osintWeatherStore.ts' as string
    );
    useOsintWeather.setState({ windOpacity: 0.8 });
  });
  const reprojection = await page.evaluate(() => {
    const map = (window as any).__windMap;
    const canvas = document.querySelector(
      '.osint-wind-canvas:not(.osint-wind-speed)',
    ) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const ratio = canvas.width / map.getCanvas().clientWidth;
    const check = (zoom: boolean) => {
      const point = map.unproject([600, 300]);
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(596, 296, 8, 8);
      ctx.restore();
      if (zoom) map.jumpTo({ zoom: map.getZoom() - 0.3 });
      else
        map.jumpTo({
          center: map.unproject([
            map.getCanvas().clientWidth / 2 + 80,
            map.getCanvas().clientHeight / 2,
          ]),
        });
      const target = map.project(point);
      const pixel = ctx.getImageData(
        Math.round(target.x * ratio),
        Math.round(target.y * ratio),
        1,
        1,
      ).data;
      const old = ctx.getImageData(Math.round(600 * ratio), Math.round(300 * ratio), 1, 1).data;
      return zoom
        ? !(pixel[0] > 200 && pixel[1] < 30 && pixel[3] > 200)
        : pixel[0] > 200 && pixel[3] > 200 && old[3] === 0;
    };
    return [check(false), check(true)];
  });
  expect(reprojection).toEqual([true, true]);
  await page.mouse.move(850, 400);
  await page.mouse.down();
  await page.mouse.move(950, 420, { steps: 12 });
  expect(await page.evaluate(() => !!(window as any).__windMap.getSource('jejak-wind-flow'))).toBe(
    true,
  );
  await page.mouse.up();
  await page.screenshot({ path: '.runtime/wind-flow.png' });
  await expect(page.locator('.osint-wind-speed')).toHaveCount(1);
  await wind.uncheck();
  await expect(page.locator('.osint-wind-speed')).toHaveCount(0);
  await expect(
    page.locator('.osint-wind-canvas:not(.osint-wind-speed):not(.osint-wind-boundary)'),
  ).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Wind speed legend' })).toHaveCount(0);
});
