import { test, expect } from './fixtures';

test('non-JSON API failures clear expired sessions and expose a readable error', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/auth/session', r => r.fulfill({json:{user:null,setupRequired:false}}));
  await page.route('**/api/test-proxy-error', r => r.fulfill({status:401,contentType:'text/html',body:'<h1>Unauthorized</h1>'}));
  await page.goto('/');
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const path = '/src/features/auth/authStore.ts';
    const {api,useAuth} = await import(/* @vite-ignore */ path);
    useAuth.setState({user:{id:'expired',name:'Expired user',email:'expired@example.test',role:'viewer',active:true,permissions:[]}});
    let message = '';
    try { await api('/test-proxy-error'); } catch(error) { message = (error as Error).message; }
    return {message,user:useAuth.getState().user};
  });
  expect(result.user).toBeNull();
  expect(result.message).toBe('Invalid server response. Please try again.');
});

test.describe('fractional screen scaling', () => {
  test.use({deviceScaleFactor:1.25});
  test('popup pixel rounding settles without an observer loop', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const path = '/src/shared/snapPopupToPixels.ts';
      const {snapPopupToPixels} = await import(/* @vite-ignore */ path);
      const element = document.createElement('div');
      element.style.cssText = 'position:fixed;left:0;top:0;width:251px;height:101px;transform:translate(10.5px,20.5px)';
      document.body.append(element);
      let mutations = 0;
      const observer = new MutationObserver(() => mutations++);
      observer.observe(element,{attributes:true,attributeFilter:['style']});
      const stop = snapPopupToPixels(element);
      const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await frame(); await frame();
      element.style.transform = 'translate(31.333px,42.777px)';
      await frame(); await frame();
      const box = element.getBoundingClientRect();
      const x = box.x * devicePixelRatio, y = box.y * devicePixelRatio;
      const settled = mutations;
      await frame(); await frame();
      stop(); observer.disconnect(); element.remove();
      return {x,y,settled,mutations};
    });
    expect(Math.abs(result.x - Math.round(result.x))).toBeLessThan(0.001);
    expect(Math.abs(result.y - Math.round(result.y))).toBeLessThan(0.001);
    expect(result.mutations).toBe(result.settled);
    expect(result.mutations).toBeLessThan(6);
  });
});
