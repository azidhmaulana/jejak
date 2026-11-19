import { test, expect } from './fixtures';

test('layer switches restore both on and off preferences before panels open', async ({ page }) => {
  await page.route('**/api/hotspots/sources', r => r.fulfill({ json: { sources: [] } }));
  let requests = 0;
  await page.route('**/api/hotspots?*', r => { requests++; return r.fulfill({ json: { items: [], sources: {} } }); });
  await page.goto('/');
  const stores = [
    ['/src/features/hotspots/hotspotStore.ts', 'useHotspots', 'enabled'],
    ['/src/features/earthquakes/earthquakeStore.ts', 'useEarthquakes', 'enabled'],
    ['/src/features/osint/workspaceStore.ts', 'useWorkspace', 'roads'],
    ['/src/features/regions/regionStore.ts', 'useRegion', 'showBoundary'],
    ...['clouds', 'wind', 'rain', 'particles', 'windTime', 'rainTime'].map(field =>
      ['/src/features/weather/osintWeatherStore.ts', 'useOsintWeather', field]),
    ...['cameras', 'previews', 'news', 'showOffline'].map(field =>
      ['/src/features/surveillance/osintSurveillanceStore.ts', 'useSurveillance', field]),
  ];
  for (const enabled of [false, true]) {
    await page.evaluate(async ({ stores, enabled }) => {
      for (const [path, name, field] of stores) {
        const module = await import(/* @vite-ignore */ path);
        module[name].setState({ [field]: enabled });
      }
    }, { stores, enabled });
    await page.reload();
    const restored = await page.evaluate(async stores => {
      return Promise.all(stores.map(async ([path, name, field]) => {
        const module = await import(/* @vite-ignore */ path);
        return module[name].getState()[field];
      }));
    }, stores);
    expect(restored).toEqual(stores.map(([, name, field]) => enabled && !(name === 'useOsintWeather' && ['wind', 'rain'].includes(field))));
    await expect(page.locator('.hotspot-panel')).toHaveCount(0);
    if (!enabled) {
      const before = requests;
      await page.waitForTimeout(500);
      expect(requests).toBe(before);
    }
  }
});
