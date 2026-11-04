import { test, expect, type Page } from '@playwright/test';

async function captureMap(page: Page) {
  await page.waitForFunction(() => {
    const container = document.querySelector('.maplibregl-map') as any;
    if (!container) return false;
    let fiber = container[Object.keys(container).find((key) => key.startsWith('__reactFiber'))!];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
        if (value?.getSource && value.getSource('jejak-cameras')) {
          (window as any).auditMap = value;
          return true;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
}

test('camera dots have no clusters or icons, select and survive filters/style changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('osint-surveillance-bandung-v1', 'false');
    localStorage.setItem(
      'osint-surveillance-switches-v1',
      JSON.stringify({ cameras: true, previews: false, showOffline: true, news: false }),
    );
    localStorage.setItem(
      'osint-surveillance-config-v1',
      JSON.stringify(
        [0, 1, 2].map((i) => ({
          id: `cluster-test-${i}`,
          name: `Cluster Camera ${i}`,
          kind: 'camera',
          latitude: -6.9175,
          longitude: 107.6191 + i * 0.004,
          url: 'https://camera.test/',
          previewUrl: 'https://camera.test/image.svg',
        })),
      ),
    );
  });
  await page.route('https://camera.test/image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
    }),
  );
  await page.goto('/');
  await captureMap(page);
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    useSurveillance.setState({
      health: Object.fromEntries(
        ['online', 'offline', 'unknown'].map((status, i) => [
          `cluster-test-${i}`,
          { status, checkedAt: Date.now(), reason: 'test' },
        ]),
      ),
    });
    (window as any).auditMap.jumpTo({ center: [107.6231, -6.9175], zoom: 10 });
  });
  const style = await page.evaluate(() => (window as any).auditMap.getStyle());
  expect(style.sources['jejak-cameras'].cluster).toBeFalsy();
  expect(style.layers.find((layer: any) => layer.id === 'jejak-cameras-points').type).toBe(
    'circle',
  );
  expect(style.layers.some((layer: any) => layer.id === 'jejak-cameras-clusters')).toBe(false);
  await page.evaluate(() =>
    (window as any).auditMap.jumpTo({ center: [107.6231, -6.9175], zoom: 15 }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).auditMap.queryRenderedFeatures({ layers: ['jejak-cameras-points'] })
            .length,
      ),
    )
    .toBe(3);
  const offlinePoint = await page.evaluate(() => {
    const p = (window as any).auditMap.project([107.6231, -6.9175]);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(offlinePoint.x, offlinePoint.y);
  await expect(page.locator('.camera-map-tooltip')).toContainText('Offline');
  await page.mouse.click(offlinePoint.x, offlinePoint.y);
  await expect(page.locator('.camera-inspector')).toBeVisible();
  await expect(page.locator('.monitor-title h2')).toHaveText('Cluster Camera 1');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).auditMap.queryRenderedFeatures({ layers: ['jejak-cameras-selected'] })[0]
            ?.properties.status,
      ),
    )
    .toBe('offline');
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    useSurveillance.setState({ showOffline: false });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).auditMap.queryRenderedFeatures({ layers: ['jejak-cameras-points'] })
            .length,
      ),
    )
    .toBe(2);
  await page.evaluate(() =>
    (window as any).auditMap.setStyle({ version: 8, sources: {}, layers: [] }),
  );
  await expect
    .poll(() => page.evaluate(() => !!(window as any).auditMap.getLayer('jejak-cameras-points')))
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).auditMap.queryRenderedFeatures({ layers: ['jejak-cameras-points'] })
            .length,
      ),
    )
    .toBe(2);
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    useSurveillance.setState({ cameras: false });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).auditMap.queryRenderedFeatures({ layers: ['jejak-cameras-points'] })
            .length,
      ),
    )
    .toBe(0);
  expect(errors).toEqual([]);
});

test('refined navbar remains centered and toolbar tooltips support keyboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/');
  for (const width of [1920, 1440, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const brand = await page.locator('.tactical-brand').boundingBox();
    expect(Math.abs(brand!.x + brand!.width / 2 - width / 2)).toBeLessThan(1);
    if (width > 1200) {
      const capsule = await page.locator('.navbar-capsule').boundingBox();
      expect(
        Math.abs(brand!.y + brand!.height / 2 - capsule!.y - capsule!.height / 2),
      ).toBeLessThan(1);
    }
    await expect(page.locator('.tactical-brand small')).toBeHidden();
    await expect(page.locator('.workspace-ticker')).toBeVisible();
    await expect(page.locator('.workspace-status')).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const button = page.locator('.tactical-rail button').first();
  await button.focus();
  await expect(button.locator('[role="tooltip"]')).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.width).toBe(36);
  expect(box!.height).toBe(36);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByLabel('More navigation').click();
  await expect(page.locator('.navbar-more button').first()).toBeVisible();
});
