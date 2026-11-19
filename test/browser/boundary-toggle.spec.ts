import { test, expect, type Page } from './fixtures';
const frames = Array.from({ length: 37 }, (_, i) => {
  const time = Date.UTC(2026, 10, 16, 1, i * 10);
  return { id: new Date(time).toISOString().replace(/\D/g, '').slice(0, 14), time };
});
async function state(page: Page) {
  return page.evaluate(async () =>
    (await import('/src/features/weather/himawariStore.ts' as string)).useHimawari.getState(),
  );
}
async function captureMap(page: Page) {
  await page.waitForFunction(() => {
    const container = document.querySelector('.maplibregl-map') as any;
    if (!container) return false;
    let fiber = container[Object.keys(container).find((key) => key.startsWith('__reactFiber'))!];
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.getSource && map.getStyle()?.layers?.length) {
          (window as any).satelliteMap = map;
          return true;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bms-language', 'en');
    if (localStorage.getItem('jejak-weather-clouds') === null)
      localStorage.setItem('jejak-weather-clouds', 'false');
  });
  await page.route('**/api/hotspots/sources', (r) => r.fulfill({ json: { sources: [] } }));
  await page.route('**/api/hotspots?*', (r) => r.fulfill({ json: { items: [], sources: {} } }));
  await page.route('**/api/earthquakes?*', (r) => r.fulfill({ json: { items: [], sources: {} } }));
  await page.route('**/api/weather/himawari/frames*', (r) =>
    r.fulfill({ json: { frames, stale: false } }),
  );
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, 256, 256);
      return c.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  await page.route('**/api/weather/himawari/tiles/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: png }),
  );
});

test('boundary toggle persists and boundary returns after a style replacement', async ({page}) => {
  test.setTimeout(60000);
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await captureMap(page);
  const exists=()=>page.evaluate(()=>Boolean((window as any).satelliteMap.getLayer('jejak-province-line')));
  await expect.poll(exists).toBe(true);
  await page.getByRole('button',{name:'Map layers',exact:true}).click();
  const toggle=page.getByRole('switch',{name:'Indonesia boundary',exact:true});
  await toggle.uncheck();
  await expect.poll(exists).toBe(false);
  expect(await page.evaluate(()=>localStorage.getItem('jejak-boundary-enabled'))).toBe('false');
  await toggle.check();
  await expect.poll(exists).toBe(true);
  await page.evaluate(()=> (window as any).satelliteMap.setStyle({version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#123'}}]}));
  await expect.poll(exists).toBe(true);
});

