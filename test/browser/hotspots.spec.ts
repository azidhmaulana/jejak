import { test, expect } from './fixtures';

const sources = [
  {
    id: 'firms',
    name: 'NASA FIRMS',
    kind: 'points',
    active: true,
    configured: false,
    hasKey: false,
    keyRequired: true,
    endpoint: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/',
    url: 'https://firms.modaps.eosdis.nasa.gov/',
  },
  {
    id: 'sipongi',
    name: 'SIPONGI',
    kind: 'points',
    active: true,
    configured: true,
    hasKey: false,
    keyRequired: false,
    endpoint: 'https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot',
    url: 'https://sipongi.gakkum.kehutanan.go.id/peta',
  },
  {
    id: 'bmkg',
    name: 'BMKG',
    kind: 'image',
    active: true,
    configured: true,
    hasKey: false,
    keyRequired: false,
    endpoint: 'https://inderaja.bmkg.go.id/IMAGE/HOTSPOT/Hotspot_Indonesia.png',
    url: 'https://www.bmkg.go.id/cuaca/satelit/polar-hotspot',
  },
];
test('fresh workspace fits Indonesia and starts hotspots without opening a panel', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bms-language', 'en');  });
  await page.route('**/api/hotspots/sources', r => r.fulfill({ json: { sources } }));
  let requests = 0;
  await page.route('**/api/hotspots?*', r => { requests++; return r.fulfill({ json: { items: [{ id: 'auto-hotspot', time: Date.now() - 60000, lat: -6.9175, lng: 107.6191, confidence: 'high', satellite: 'NOAA-20', providers: ['sipongi'], place: 'Auto hotspot', frp: null }], sources: { sipongi: { status: 'ok' } } } }); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect(page.locator('.status-coordinates')).toContainText('117.7500');
  await expect(page.locator('.hotspot-panel')).toHaveCount(0);
  await page.waitForFunction(() => {
    const container = document.querySelector('.maplibregl-map') as any;
    if (!container) return false;
    let fiber = container[Object.keys(container).find(key => key.startsWith('__reactFiber'))!];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.getLayer?.('jejak-hotspot-markers')) return map.queryRenderedFeatures({ layers: ['jejak-hotspot-markers'] }).some((f: any) => f.properties.id === 'auto-hotspot');
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });

  await page.getByRole('button', { name: 'Hotspots', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Hotspots', exact: true }).getByRole('switch')).toBeChecked();
});
test('hotspot history slider changes marker dates without extra requests and follows sidebar layout', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    localStorage.setItem('jejak-hotspots-enabled', 'false');
  });
  await page.route('**/api/hotspots/sources', (r) => r.fulfill({ json: { sources } }));
  await page.route('**/api/hotspots/image/bmkg', (r) =>
    r.fulfill({ status: 502, json: { error: 'Unavailable' } }),
  );
  let requests = 0;
  await page.route('**/api/hotspots?*', (r) => {
    const date = new URL(r.request().url()).searchParams.get('day')!;
    if (date.startsWith('2020-')) requests++;
    return r.fulfill({
      json: {
        items: [
          {
            id: date,
            time: Date.parse(`${date}T05:00:00Z`),
            lat: -6.9175,
            lng: 107.6191,
            confidence: 'high',
            satellite: 'NOAA-20',
            providers: ['sipongi'],
            place: `Bandung ${date}`,
            frp: null,
          },
        ],
        sources: { firms: { status: 'needs-key' }, sipongi: { status: 'ok' } },
      },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const button = page.getByRole('button', { name: 'Hotspots', exact: true });
  await button.hover();
  await expect(page.locator('.hotspot-panel')).toHaveCount(0);
  await button.click();
  const panel = page.getByRole('complementary', { name: 'Hotspots', exact: true });
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await panel.getByLabel('From (UTC)').fill('2020-01-01');
  await panel.getByLabel('To (UTC)').fill('2020-01-03');
  await panel.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(panel.locator('.hotspot-progress')).toContainText('100%');
  await expect(panel.locator('.hotspot-results')).toContainText('2020-01-03');
  expect(requests).toBe(3);
  const slider = panel.getByRole('slider', { name: 'Hotspot history date' });
  await slider.focus();
  await slider.press('Home');
  await expect(panel.locator('.hotspot-results')).toContainText('2020-01-01');
  await expect(panel.locator('.hotspot-results button')).toHaveCount(1);
  await slider.press('End');
  await panel.getByLabel('Accumulate through this date').check();
  await expect(panel.locator('.hotspot-results button')).toHaveCount(3);
  expect(requests).toBe(3);
  await panel.locator('.hotspot-results button').first().click();
  await expect(page.getByRole('dialog', { name: 'Hotspot details' })).toContainText('NOAA-20');
  await page.getByRole('button', { name: 'Close hotspot details' }).click();
  await panel.getByText('BMKG hotspot image — latest', { exact: true }).click();
  await expect(panel).toContainText('BMKG image is currently unavailable');
  const b = await button.boundingBox(),
    p = await panel.boundingBox();
  expect(Math.abs(b!.y - p!.y)).toBeLessThan(2);
  expect(p!.height).toBeLessThanOrEqual(540);
  await panel.getByText('BMKG hotspot image — latest', { exact: true }).click();
  expect(p!.width).toBe(350);
  const row = await panel.locator('.hotspot-results button').first().boundingBox();
  expect(row!.width).toBeGreaterThan(300);
  await panel.locator('.public-analytics-body').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: '.runtime/hotspots-panel.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await panel.boundingBox();
  expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
  await panel.getByRole('button', { name: 'Close hotspots' }).click();
  await button.hover();
  await expect(panel).toHaveCount(0);
});

test('CMS edits hotspot credentials without displaying stored keys', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  const user = {
    id: 'hotspot-owner',
    name: 'Owner',
    role: 'superadmin',
    active: true,
    email: 'owner@example.test',
    permissions: ['users.manage', 'roles.manage'],
  };
  await page.route('**/api/cctv-sources/check', (r) => r.fulfill({ json: { job: null } }));
  await page.route('**/api/analytics/events', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({ json: { setupRequired: false, user } }),
  );
  await page.route('**/api/auth/preferences', (r) =>
    r.fulfill({ json: { favorites: [], recent: [] } }),
  );
  await page.route('**/api/auth/users', (r) => r.fulfill({ json: { users: [] } }));
  await page.route('**/api/auth/roles', (r) => r.fulfill({ json: { roles: [], permissions: [] } }));
  await page.route('**/api/hotspots/sources', (r) => r.fulfill({ json: { sources } }));
  await page.route('**/api/hotspot-sources', (r) => r.fulfill({ json: { sources } }));
  let saved: unknown;
  await page.route('**/api/hotspot-sources/firms', (r) => {
    saved = r.request().postDataJSON();
    return r.fulfill({ json: { source: { ...sources[0], configured: true, hasKey: true } } });
  });
  await page.route('**/api/hotspot-sources/firms/check', (r) =>
    r.fulfill({ json: { status: 'ok', count: 12 } }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'CMS', exact: true }).click();
  const cms = page.getByRole('dialog', { name: 'JEJAK CMS' });
  await cms.getByRole('button', { name: 'Hotspot Sources', exact: true }).click();
  const editor = cms.locator('.hotspot-source-editor').first();
  await editor.getByLabel('NASA FIRMS MAP_KEY', { exact: true }).fill('ab'.repeat(16));
  await expect(editor.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByLabel('NASA FIRMS MAP_KEY', { exact: true })).toHaveValue('');
  expect(saved).toEqual({ active: true, apiKey: 'ab'.repeat(16) });
  await editor.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(editor).toContainText('12 detections yesterday (UTC)');
  await page.screenshot({ path: '.runtime/hotspots-cms.png' });
});
