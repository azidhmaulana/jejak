import { test, expect } from './fixtures';
test.use({ hasTouch: true });
test.beforeEach(async ({page}) => {
 await page.route('**/api/hotspots/sources', r => r.fulfill({json:{sources:[]}}));
 await page.route('**/api/hotspots?*', r => r.fulfill({json:{items:[],sources:{}}}));
 await page.route('**/api/earthquakes*', r => r.fulfill({json:{items:[],latest:null,status:{}}}));
});

test('mobile hotspot details do not overlap settings or navigation', async ({ page }) => {
  test.setTimeout(60000);
  const item = {id:'mobile-test',lat:-6.9,lng:107.6,time:Date.now(),satellite:'NOAA-20',confidence:'high',frp:12,place:'Bandung',providers:['sipongi']};
  await page.route('**/api/hotspots/sources', r => r.fulfill({json:{sources:[{id:'sipongi',active:true,configured:true,name:'SIPONGI',kind:'points'}]}}));
  await page.route('**/api/hotspots?*', r => r.fulfill({json:{items:[item],sources:{}}}));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/');
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hotspots', exact: true }).click();
  await page.locator('.hotspot-results button').first().click();
  const popup = page.getByRole('dialog', { name: 'Hotspot details' });
  await expect(popup).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Hotspots', exact: true })).toHaveCount(0);
  const box = await popup.boundingBox();
  const nav = await page.locator('.mobile-bottom-nav').boundingBox();
  expect(box!.y).toBeGreaterThan(160);
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'.runtime/mobile-hotspot-detail.png'});
  await page.setViewportSize({width:1440,height:901});
  await expect(popup).toHaveCount(1);
  await expect.poll(() => popup.evaluate(element => {
    const box = element.getBoundingClientRect();
    const ratio = devicePixelRatio;
    return Math.abs(box.x * ratio - Math.round(box.x * ratio)) < 0.01 &&
      Math.abs(box.y * ratio - Math.round(box.y * ratio)) < 0.01;
  })).toBe(true);
  await expect(popup.locator('.quake-popup-place')).toHaveCSS('text-shadow','none');
  await expect(popup.locator('.quake-popup-place')).toHaveCSS('font-weight','400');
  await page.screenshot({path:'.runtime/desktop-hotspot-detail.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button', { name: 'Hotspots', exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Hotspots', exact: true })).toBeVisible();
});
test('mobile and tablet navigation and panels fit the viewport', async ({ page }) => {
 test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.goto('/');
  await expect(page.locator('.tactical-brand')).toBeVisible();
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
  for (const [width, height] of [
    [390, 844],
    [320, 640],
    [768, 1024],
    [1024, 768],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `.runtime/mobile-${width}.png` });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (width <= 700)
      await page
        .locator('.mobile-bottom-nav')
        .getByRole('button', { name: 'Regions', exact: true })
        .click();
    else {
      await page.locator('.navbar-more summary').click();
      await page
        .locator('.navbar-more')
        .getByRole('button', { name: 'Regions', exact: true })
        .click();
    }
    const panel = page.getByRole('complementary', { name: 'Regions', exact: true });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await panel.getByRole('button', { name: 'View hotspots', exact: true }).click();
    if (height < 650)
      await panel
        .getByRole('region', { name: 'Hotspot list' })
        .locator('footer')
        .scrollIntoViewIfNeeded();
    await expect(
      panel.getByRole('region', { name: 'Hotspot list' }).locator('footer'),
    ).toBeInViewport();
    await page.screenshot({ path: `.runtime/mobile-region-${width}.png` });
    await panel.getByRole('button', { name: 'Close regions' }).click();
    await page.getByRole('button', { name: 'Hotspots', exact: true }).click();
    const hotspot = page.getByRole('complementary', { name: 'Hotspots', exact: true });
    await expect(hotspot).toBeVisible();
    const hb = await hotspot.boundingBox();
    expect(hb!.height).toBeGreaterThan(100);
    expect(hb!.x + hb!.width).toBeLessThanOrEqual(width);
    expect(hb!.y + hb!.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `.runtime/mobile-hotspot-${width}.png` });
    await hotspot.locator('.analytics-close').click();
    await page.getByRole('button', { name: 'Camera catalog', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Surveillance settings' })).toBeInViewport();
    await page.getByRole('button', { name: 'Close camera surveillance' }).click();
  }
});

test('mobile camera tray, search, login and signed-in panels remain usable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.tactical-brand')).toBeVisible();
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Search cameras', exact: true }).click();
  await expect(page.locator('.navbar-camera-search')).toBeInViewport();
  await page.getByRole('button', { name: 'Close camera search', exact: true }).click();
  await page
    .locator('.mobile-bottom-nav')
    .getByRole('button', { name: 'CCTV', exact: true })
    .click();
  await expect(page.locator('.camera-dock')).toBeInViewport();
  await page.screenshot({ path: '.runtime/mobile-cameras.png' });
  await page.locator('.camera-card').first().click();
  const monitor = page.locator('.camera-inspector');
  await expect(monitor).toBeVisible();
  await expect(monitor.locator('[data-panel-expand]')).toBeHidden();
  await expect.poll(() => monitor.locator('.monitor-feed').evaluate(feed => {
    const frame = feed.getBoundingClientRect();
    const video = feed.querySelector('video, img')?.getBoundingClientRect();
    return Boolean(video && Math.abs(video.x - frame.x) < 1 &&
      Math.abs(video.width - frame.width) < 1 && Math.abs(video.y - frame.y) < 1 &&
      Math.abs(video.height - frame.height) < 1);
  })).toBe(true);
  await expect.poll(async () => {
    const bounds = await monitor.boundingBox();
    return Math.abs(bounds!.x + bounds!.width / 2 - 195);
  }).toBeLessThan(1);
  await expect.poll(async () => {
    const player = await monitor.boundingBox();
    const dock = await page.locator('.camera-dock').boundingBox();
    return player!.y + player!.height <= dock!.y + 1;
  }).toBe(true);
  await page.screenshot({path:'.runtime/mobile-monitor.png'});
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
  await page
    .locator('.mobile-bottom-nav')
    .getByRole('button', { name: 'CCTV', exact: true })
    .click();
  await page.locator('.mobile-bottom-nav').getByRole('button', {name:'Analytics',exact:true}).click();
  const gate = page.getByRole('dialog',{name:'Login required'});
  await expect(gate).toBeInViewport();
  await gate.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.account-panel')).toBeVisible();
  await page.screenshot({ path: '.runtime/mobile-login.png' });
  await page.route('**/api/analytics/public*', (r) =>
    r.fulfill({ json: { cameras: [], trend: [], regions: [] } }),
  );
  await page.route('**/api/auth/preferences', (r) =>
    r.fulfill({ json: { favorites: [], recent: [] } }),
  );
  await page.route('**/api/analytics/events', (r) => r.fulfill({ json: { ok: true } }));
  await page.evaluate(async () => {
    const path = '/src/features/auth/authStore.ts';
    const { useAuth } = await import(/* @vite-ignore */ path);
    useAuth.setState({
      open: false,
      user: {
        id: 'mobile-viewer',
        name: 'Mobile Viewer',
        role: 'viewer',
        email: 'v@example.test',
        active: true,
        permissions: ['routes.use'],
      },
    });
  });
  await page.getByRole('button', {name:'Account', exact:true}).click();
  await expect(page.locator('.account-dropdown')).toBeVisible();
  expect(await page.locator('.account-dropdown').evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + 25));
  })).toBe(true);
  await page.screenshot({path:'.runtime/mobile-account-menu.png'});
  await page.getByRole('button', {name:'Account', exact:true}).click();
  await page.getByRole('button', {name:'More navigation', exact:true}).click();
  const menu = page.locator('.mobile-menu-sheet');
  await expect(menu).toBeInViewport();
  await expect.poll(async () => (await menu.boundingBox())!.x).toBe(0);
  expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(250);
  await page.screenshot({path:'.runtime/mobile-menu-drawer.png'});
  await page.getByRole('button', {name:'Close menu', exact:true}).click();
  for (const [panel, selector] of [
    ['analytics', '.public-analytics'],
    ['objects', '.objects-panel'],
    ['space', '.space-stream-panel'],
    ['route', '.route-panel'],
  ]) {
    await page.evaluate(async (panel) => {
      const path = '/src/features/osint/workspaceStore.ts';
      const { useWorkspace } = await import(/* @vite-ignore */ path);
      useWorkspace.setState({ panel: panel === 'route' ? null : panel });
      if (panel === 'route') {
        const routePath = '/src/features/routes/routeStore.ts';
        (await import(/* @vite-ignore */ routePath)).useRoute.setState({ open: true });
      }
    }, panel);
    await expect(page.locator(selector)).toBeVisible();
    for (const button of await page.locator('[data-panel-expand]').all()) {
      await expect(button).toBeHidden();
    }
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: `.runtime/mobile-${panel}.png` });
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async () => {
    const path = '/src/features/routes/routeStore.ts';
    const {useRoute} = await import(/* @vite-ignore */ path);
    useRoute.setState({result:{start:[107,-6],end:[108,-7],tolerance:50,mode:'car',
      geometry:{type:'LineString',coordinates:[[107,-6],[108,-7]]},distance:1000,duration:60,provider:'test',cameras:[]}});
  });
  await page.getByRole('button',{name:'Not expand',exact:true}).click();
  await expect(page.locator('.route-results-shell')).toHaveAttribute('aria-hidden','true');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.route-results-shell')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('.route-panel [data-panel-expand]')).toBeHidden();
});
