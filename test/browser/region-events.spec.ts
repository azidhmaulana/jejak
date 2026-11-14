import { test, expect } from './fixtures';

test('region filters loaded earthquakes and hotspots and clears their selected popups', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bms-language', 'en'); localStorage.setItem('jejak-hotspots-enabled', 'false'); });
  await page.route('**/api/auth/session', r => r.fulfill({ json: { setupRequired: false, user: { id: 'region-viewer', name: 'Viewer', email: 'v@example.test', role: 'viewer', active: true, permissions: [] } } }));
  await page.route('**/api/auth/preferences', r => r.fulfill({ json: { favorites: [], recent: [] } }));
  await page.route('**/api/analytics/events', r => r.fulfill({ json: { ok: true } }));
  const points = [
    { id: 'bandung', lat: -6.9175, lng: 107.6191 },
    { id: 'aceh', lat: 5.55, lng: 95.32 },
    { id: 'ocean', lat: -10, lng: 105 },
  ];
  const quakes = points.map(p => ({ ...p, time: Date.now(), magnitude: 5, depth: 10, place: p.id, source: 'USGS', url: '', felt: '', potential: '', shakemap: '' }));
  await page.route('**/api/earthquakes*', r => r.fulfill({ json: { items: quakes, latest: quakes[0], status: {} } }));
  await page.goto('/');
  await page.evaluate(async ({ points, quakes }) => {
    const path = '/src/features/hotspots/hotspotStore.ts';
    const { useHotspots } = await import(/* @vite-ignore */ path);
    useHotspots.setState({ items: points.map(p => ({ ...p, time: Date.now(), satellite: 'NOAA-20', confidence: 'high', providers: ['sipongi'], place: p.id, frp: null })), providers: [{ id: 'sipongi', active: true }], loaded: true });
    const quakePath = '/src/features/earthquakes/earthquakeStore.ts';
    const { useEarthquakes } = await import(/* @vite-ignore */ quakePath);
    useEarthquakes.setState({ live: quakes, selected: quakes[0] });
  }, { points, quakes });
  await page.getByRole('button', { name: 'Regions', exact: true }).first().click();
  const panel = page.getByRole('complementary', { name: 'Regions', exact: true });
  const metrics = panel.locator('.public-analytics-metrics');
  await expect(metrics.locator('div').filter({ hasText: 'Earthquakes' }).first()).toContainText('3');
  await expect(metrics.locator('div').filter({ hasText: 'Hotspots' }).first()).toContainText('3');
  await expect(panel.locator('option[value="Jawa Barat"]')).toContainText('Earthquakes 1 | Hotspots 1');
  await expect(panel.locator('option[value=""]')).toContainText('Earthquakes 3 | Hotspots 3');
  const markerIds = () => page.evaluate(async () => {
    const container = document.querySelector('.maplibregl-map') as any;
    if (!container) return [];
    let fiber = container[Object.keys(container).find(key => key.startsWith('__reactFiber'))!];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        const source = map?.getSource?.('jejak-earthquakes');
        if (source) return (await source.getData()).features.map((feature: any) => feature.properties.id).sort();
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return [];
  });
  await expect.poll(markerIds).toEqual(['aceh', 'bandung', 'ocean']);
  await panel.getByLabel('Province', { exact: true }).selectOption('Jawa Barat');
  await expect.poll(markerIds).toEqual(['bandung']);
  await expect(metrics.locator('div').filter({ hasText: 'Earthquakes' }).first()).toContainText('1');
  await expect(metrics.locator('div').filter({ hasText: 'Hotspots' }).first()).toContainText('1');
  const result = await page.evaluate(async () => {
    const qPath = '/src/features/earthquakes/earthquakeStore.ts', hPath = '/src/features/hotspots/hotspotStore.ts';
    const q = await import(/* @vite-ignore */ qPath), h = await import(/* @vite-ignore */ hPath);
    return { quakes: q.visibleEarthquakes(q.useEarthquakes.getState()).map((i: any) => i.id), hotspots: h.visibleHotspots({ ...h.useHotspots.getState(), enabled: true }).map((i: any) => i.id), selected: q.useEarthquakes.getState().selected };
  });
  expect(result).toEqual({ quakes: ['bandung'], hotspots: ['bandung'], selected: null });
  await panel.getByRole('button', { name: 'Reset to all provinces' }).click();
  await expect.poll(markerIds).toEqual(['aceh', 'bandung', 'ocean']);
  await expect(metrics.locator('div').filter({ hasText: 'Earthquakes' }).first()).toContainText('3');
  await expect(metrics.locator('div').filter({ hasText: 'Hotspots' }).first()).toContainText('3');
  await expect(panel).toContainText('Earthquakes: Last 48 hours');
  await expect(panel).toContainText('Hotspots: Last 24 hours');
  for (const status of ['online', 'offline']) {
    await panel.getByRole('button', { name: `View ${status} cameras`, exact: true }).click();
    const statusList = panel.getByRole('region', { name: `${status === 'online' ? 'Online' : 'Offline'} camera list`, exact: true });
    await expect(statusList).toBeVisible();
    const details = await statusList.locator('.province-event-row').allTextContents();
    for (const detail of details) expect(detail).toContain(`| ${status}`);
    await expect(panel.getByRole('button', { name: `View ${status} cameras`, exact: true })).toHaveAttribute('aria-expanded', 'true');
  }
  await panel.getByRole('button', { name: 'View cameras', exact: true }).click();
  const cameraList = panel.getByRole('region', { name: 'Camera list' });
  await expect(cameraList.locator('.province-event-row').first()).toBeVisible();
  const cameraDockOpen = await page.evaluate(async () => {
    const path = '/src/features/osint/workspaceStore.ts';
    return (await import(/* @vite-ignore */ path)).useWorkspace.getState().camerasOpen;
  });
  expect(cameraDockOpen).toBe(false);
  await expect.poll(() => panel.locator('.public-analytics-body').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await expect(cameraList.locator('footer')).toBeInViewport();
  const body = panel.locator('.public-analytics-body');
  await expect(body).toHaveCSS('background-image', /linear-gradient/);
  for (const height of [844, 740]) {
    await page.setViewportSize({ width: 390, height });
    await expect.poll(() => body.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await expect(cameraList.locator('footer')).toBeInViewport({ ratio: 1 });
    await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: '.runtime/region-mobile-grid.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: '.runtime/region-inline-cameras.png' });
  await panel.getByRole('button', { name: 'View earthquakes', exact: true }).click();
  await expect(panel.getByRole('region', { name: 'Earthquake list' })).toContainText('bandung');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'View hotspots', exact: true }).click();
  await expect(panel.getByRole('region', { name: 'Hotspot list' })).toContainText('bandung');
  await expect(panel.getByRole('region', { name: 'Earthquake list' })).toHaveCount(0);
  await panel.getByLabel('Province', { exact: true }).selectOption('Jawa Barat');
  await expect(panel.getByRole('region', { name: 'Hotspot list' }).locator('.province-event-row')).toHaveCount(1);
  await expect(panel.getByRole('region', { name: 'Hotspot list' })).not.toContainText('aceh');
  const row = panel.getByRole('region', { name: 'Hotspot list' }).locator('.province-event-row').first();
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(async () => {
    const path = '/src/features/hotspots/hotspotStore.ts';
    const { useHotspots } = await import(/* @vite-ignore */ path);
    const item = useHotspots.getState().items[0];
    useHotspots.setState({ items: Array.from({ length: 23 }, (_, i) => ({ ...item, id: `page-${i}`, place: `Event ${i}`, time: Date.now() - i * 1000 })) });
  });
  const eventList = panel.getByRole('region', { name: 'Hotspot list' });
  await expect(eventList.locator('.province-event-row')).toHaveCount(10);
  await page.screenshot({ path: '.runtime/region-redesign.png' });
  await eventList.locator('.province-event-rows').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await eventList.getByRole('button', { name: 'Next events' }).click();
  await expect(eventList.locator('.province-event-row').first()).toContainText('Event 10');
  await expect.poll(() => eventList.locator('.province-event-rows').evaluate(el => el.scrollTop)).toBe(0);
  await eventList.getByRole('button', { name: 'Next events' }).click();
  await expect(eventList.locator('.province-event-row')).toHaveCount(3);
  await expect(eventList.getByRole('button', { name: 'Next events' })).toBeDisabled();
  await page.evaluate(async () => {
    const path = '/src/features/hotspots/hotspotStore.ts';
    const { useHotspots } = await import(/* @vite-ignore */ path);
    useHotspots.setState({ items: useHotspots.getState().items.slice(0, 1) });
  });
  await expect(eventList.locator('.province-event-row')).toHaveCount(1);
  await expect(eventList.locator('.province-event-row')).toContainText('Event 0');

  await page.evaluate(async () => {
    const path = '/src/features/hotspots/hotspotStore.ts';
    const { useHotspots } = await import(/* @vite-ignore */ path);
    const item = useHotspots.getState().items[0];
    useHotspots.setState({ items: ['unknown', 'low', 'high', 'medium'].map((confidence, i) => ({ ...item, id: `sort-${i}`, place: confidence, confidence, time: Date.now() - i * 1000 })) });
  });
  const titles = eventList.locator('.province-event-row strong');
  await eventList.getByLabel('Sort by confidence').selectOption('high');
  await expect(titles).toHaveText(['high', 'medium', 'low', 'unknown']);
  await eventList.getByLabel('Sort by confidence').selectOption('low');
  await expect(titles).toHaveText(['low', 'medium', 'high', 'unknown']);
  await eventList.getByLabel('Sort by confidence').selectOption('latest');
  await expect(titles).toHaveText(['unknown', 'low', 'high', 'medium']);
  await page.setViewportSize({ width: 390, height: 740 });
  await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(eventList.getByLabel('Sort by confidence')).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.getByRole('button', { name: 'View earthquakes', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/features/earthquakes/earthquakeStore.ts';
    const { useEarthquakes } = await import(/* @vite-ignore */ path);
    const item = useEarthquakes.getState().live[0];
    useEarthquakes.setState({ live: [3, 7, 5].map((magnitude, i) => ({ ...item, id: `m-${i}`, magnitude })) });
  });
  const quakeList = panel.getByRole('region', { name: 'Earthquake list' });
  await quakeList.getByLabel('Sort by magnitude').selectOption('high');
  await expect(quakeList.locator('.province-event-row strong')).toHaveText(['M7.0 - bandung', 'M5.0 - bandung', 'M3.0 - bandung']);
  await quakeList.getByLabel('Sort by magnitude').selectOption('low');
  await expect(quakeList.locator('.province-event-row strong')).toHaveText(['M3.0 - bandung', 'M5.0 - bandung', 'M7.0 - bandung']);
  await panel.getByRole('button', { name: 'View hotspots', exact: true }).click();

  await page.evaluate(async () => {
    const path = '/src/features/hotspots/hotspotStore.ts';
    const { useHotspots } = await import(/* @vite-ignore */ path);
    const item = { ...useHotspots.getState().items[0], time: Date.parse('2020-01-01T12:00:00Z') };
    useHotspots.setState({ mode: 'history', items: [item], days: ['2020-01-01'], frame: 0, enabled: false, loaded: false });
  });
  await eventList.locator('.province-event-row').click();
  await expect(eventList.locator('.province-event-row')).toHaveAttribute('aria-pressed', 'true');
  const mode = await page.evaluate(async () => {
    const path = '/src/features/hotspots/hotspotStore.ts';
    return (await import(/* @vite-ignore */ path)).useHotspots.getState().mode;
  });
  expect(mode).toBe('history');

});
