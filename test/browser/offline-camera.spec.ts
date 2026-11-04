import { test, expect } from '@playwright/test';
test('known offline camera stays idle until explicit manual retry', async ({ page }) => {
  let requests = 0;
  await page.route('https://offline-camera.test/live.m3u8', (route) => {
    requests++;
    return route.fulfill({ status: 404, body: 'offline' });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    const { useWorkspace } = await import('/src/features/osint/workspaceStore.ts' as string);
    useSurveillance.setState({
      bandung: false,
      previews: false,
      sources: [
        {
          id: 'offline-test',
          name: 'Offline Test',
          kind: 'camera',
          url: 'https://offline-camera.test',
          streamUrl: 'https://offline-camera.test/live.m3u8',
          latitude: -6.9175,
          longitude: 107.6191,
        },
      ],
      health: { 'offline-test': { status: 'offline', checkedAt: Date.now(), reason: 'test' } },
    });
    useWorkspace.setState({ selectedId: 'offline-test', selectionAttempt: 0 });
  });
  const monitor = page.locator('.camera-inspector');
  await expect(monitor.locator('.osint-placeholder-retry')).toBeVisible();
  expect(requests).toBe(0);
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    useSurveillance.setState({
      health: { 'offline-test': { status: 'unknown', checkedAt: Date.now(), reason: 'stale' } },
    });
    window.dispatchEvent(new Event('online'));
  });
  await expect(monitor.locator('.osint-stream-placeholder')).toHaveAttribute(
    'data-offline',
    'true',
  );
  expect(requests).toBe(0);
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/features/osint/workspaceStore.ts' as string);
    useWorkspace.getState().selectCamera('offline-test');
  });
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect(monitor.locator('.osint-stream-placeholder')).toHaveAttribute('data-offline', 'true', { timeout: 20000 });
  const afterFailure = requests;
  await page.waitForTimeout(1200);
  expect(requests).toBe(afterFailure);
  // Selecting the same camera again must issue exactly one new selection action.
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/features/osint/workspaceStore.ts' as string);
    useWorkspace.getState().selectCamera('offline-test');
  });
  await expect.poll(() => requests).toBeGreaterThan(afterFailure);

});

