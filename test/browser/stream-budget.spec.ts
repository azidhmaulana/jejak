import { test, expect } from './fixtures';

test('stream budget prioritizes monitor and suspends hidden or offscreen previews', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { useSurveillance } = await import(
      '/src/features/surveillance/osintSurveillanceStore.ts' as string
    );
    const { useWorkspace } = await import('/src/features/osint/workspaceStore.ts' as string);
    useSurveillance.setState({ previews: false, cameras: false });
    useWorkspace.setState({ camerasOpen: false, selectedId: null });
    const {
      default: { createElement, useRef },
    } = await import('/node_modules/.vite/deps/react.js' as string);
    const {
      default: { createRoot },
    } = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const { useStreamActivity } = await import(
      '/src/features/surveillance/useStreamActivity.ts' as string
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:200px;left:0;z-index:99999';
    document.body.append(host);
    function Stream({ id, compact }: { id: string; compact: boolean }) {
      const ref = useRef(null);
      const active = useStreamActivity(ref, id, compact);
      return createElement(
        'div',
        { ref, 'data-budget-id': id, 'data-active': active, style: { width: 50, height: 30 } },
        id,
      );
    }
    const root = createRoot(host);
    (window as any).renderBudget = (main: boolean) =>
      root.render(
        createElement(
          'div',
          null,
          ...['a', 'b', 'c', 'd'].map((id) =>
            createElement(Stream, { key: id, id, compact: true }),
          ),
          main ? createElement(Stream, { key: 'main', id: 'main', compact: false }) : null,
        ),
      );
    (window as any).renderBudget(false);
  });
  const active = page.locator('[data-budget-id][data-active="true"]');
  await expect(active).toHaveCount(1);
  await page.evaluate(() => (window as any).renderBudget(true));
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-budget-id', 'main');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(active).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    (window as any).renderBudget(false);
  });
  await expect(active).toHaveCount(1);
  await page.setViewportSize({ width: 1200, height: 844 });
  await expect(active).toHaveCount(3);
  await page
    .locator('[data-budget-id="a"]')
    .evaluate((el) => ((el as HTMLElement).style.transform = 'translateY(2000px)'));
  await expect(page.locator('[data-budget-id="a"]')).toHaveAttribute('data-active', 'false');
  await expect(active).toHaveCount(3);
});
