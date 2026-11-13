import { test, expect } from './fixtures';

test('sources paginate and filter, show three-line logs and notify after CMS closes', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bms-language', 'en'));
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({
      json: {
        setupRequired: false,
        user: {
          id: 'check-owner',
          name: 'Owner',
          email: 'owner@example.test',
          role: 'superadmin',
          active: true,
          permissions: ['users.manage', 'roles.manage'],
        },
      },
    }),
  );
  for (const [endpoint, data] of Object.entries({
    preferences: { favorites: [], recent: [] },
    users: { users: [] },
    roles: { roles: [], permissions: [] },
  }))
    await page.route(`**/api/auth/${endpoint}`, (r) => r.fulfill({ json: data }));
  const sources = Array.from({ length: 18 }, (_, i) => ({
    name: `Provider ${String(i + 1).padStart(2, '0')}`,
    province: 'Jawa Barat',
    city: 'Kota Bandung',
    active: true,
    cameraCount: 2,
    feedCount: 2,
    linkOnlyCount: 0,
    origins: ['https://example.test'],
    retrievedAt: '2026-11-07',
  }));
  await page.route('**/api/cctv-sources', (r) =>
    r.fulfill({ json: { sourceCount: 18, cameraCount: 36, feedCount: 36, sources } }),
  );
  let job: any = null;
  await page.route('**/api/cctv-sources/check', async (r) => {
    if (r.request().method() === 'POST')
      job = {
        id: 'job-1',
        status: 'running',
        total: 36,
        done: 2,
        online: 1,
        updated: 1,
        failed: 0,
        skipped: 0,
        logs: [
          { at: Date.now(), name: 'Camera 1', status: 'online' },
          { at: Date.now(), name: 'Camera 2', status: 'updated' },
        ],
      };
    await r.fulfill({ json: { job } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'CMS', exact: true }).click();
  await page.getByRole('button', { name: 'CCTV Source', exact: true }).click();
  const panel = page.locator('.cms-camera-sources');
  await expect(panel.locator('tbody tr')).toHaveCount(8);
  await panel.getByRole('button', { name: 'Next page' }).click();
  await expect(panel.getByText('Provider 09', { exact: true })).toBeVisible();
  await panel.getByLabel('Search CCTV sources').fill('Provider 18');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await panel.getByLabel('Search CCTV sources').fill('');
  await panel.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Checking...' })).toBeDisabled();
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '2');
  const terminal = panel.getByRole('log');
  await expect(terminal).toContainText('URL updated');
  expect((await terminal.boundingBox())!.height).toBe(66);
  await terminal.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/camera-source-checks.png', fullPage: true });
  await page.getByRole('button', { name: 'Close CMS' }).click();
  job = { ...job, status: 'completed', done: 36, online: 35 };
  await expect(page.locator('.toast-stack')).toContainText('Stream check finished', {
    timeout: 20000,
  });
});
