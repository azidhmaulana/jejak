import { test, expect } from './fixtures';

test('guest startup defers heavy panels while session bootstrap remains active', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (req) => requested.push(req.url()));
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({ json: { user: null, setupRequired: false } }),
  );
  await page.goto('/');
  await expect(page.locator('#jejak-boot')).toHaveCount(0);
  expect(requested.some((url) => url.includes('/api/auth/session'))).toBe(true);
  for (const module of [
    'CmsPanel.tsx',
    'AccountPanel.tsx',
    'PublicAnalyticsPanel.tsx',
    'drawingController.ts',
    'CameraInspector.tsx',
    'RoutePanel.tsx',
  ]) {
    expect(
      requested.some((url) => url.includes(module)),
      module,
    ).toBe(false);
  }
  await page.evaluate(async () => {
    const { useAuth } = await import('/src/features/auth/authStore.ts' as string);
    useAuth.setState({ open: true });
  });
  await expect(page.locator('.account-panel')).toBeVisible();
  expect(requested.some((url) => url.includes('AccountPanel.tsx'))).toBe(true);
});
