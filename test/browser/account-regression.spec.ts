import { test, expect, type Route } from '@playwright/test';

test('logout supports cancel, close, Escape, failure recovery and ignores a stale session response', async ({
  page,
}) => {
  const user = {
    id: 'mock-viewer',
    name: 'Regression Viewer',
    email: 'viewer@example.test',
    role: 'viewer',
    active: true,
    permissions: ['routes.use', 'routes.save'],
  };
  let signedIn = true;
  let failLogout = true;
  let holdSession = false;
  let held: Route | undefined;
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/auth/session', async (route) => {
    if (holdSession) {
      held = route;
      return;
    }
    await route.fulfill({ json: { user: signedIn ? user : null, setupRequired: false } });
  });
  await page.route('**/api/auth/preferences', (route) =>
    route.fulfill({ json: { favorites: [], recent: [] } }),
  );
  await page.route('**/api/auth/logout', async (route) => {
    if (failLogout) return route.fulfill({ status: 503, json: { error: 'Try again.' } });
    signedIn = false;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  const account = page.getByRole('button', { name: 'Account', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Sign out of JEJAK?' });
  const openLogout = async () => {
    await account.click();
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(dialog).toBeVisible();
  };
  for (const action of ['Cancel', 'Close confirmation', 'Escape']) {
    await openLogout();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(account).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openLogout();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Yes, sign out' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Try again.');
  await expect(account).toContainText(user.name);
  holdSession = true;
  await page.evaluate(async () => {
    const modulePath = '/src/features/auth/authStore.ts';
    const { useAuth } = await import(modulePath);
    (window as unknown as { pendingRefresh: Promise<void> }).pendingRefresh = useAuth
      .getState()
      .refresh();
  });
  await expect.poll(() => Boolean(held)).toBe(true);
  failLogout = false;
  await dialog.getByRole('button', { name: 'Yes, sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await held!.fulfill({ json: { user, setupRequired: false } });
  await page.evaluate(
    () => (window as unknown as { pendingRefresh: Promise<void> }).pendingRefresh,
  );
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
