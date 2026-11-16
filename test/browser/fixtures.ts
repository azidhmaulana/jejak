import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

// Each independent browser scenario gets an independent rate-limit bucket.
// Only the isolated Playwright server trusts these loopback proxy headers.
export const test = base.extend<{ runtimeErrors: void }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    const capture = (error: Error) => errors.push(error.message);
    page.on('pageerror', capture);
    await use();
    page.off('pageerror', capture);
    expect(errors, 'Uncaught browser JavaScript errors').toEqual([]);
  }, { auto: true }],
  context: async ({ context }, use, info) => {
    const digest = createHash('sha256').update(info.testId).digest();
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.18.${digest[0]}.${digest[1]}` });
    await use(context);
  },
});
export { expect };
export type { Page, Route } from '@playwright/test';
