import { createHash } from 'node:crypto';
import { test as base } from '@playwright/test';

export * from '@playwright/test';

/** Saves are rate-limited per client IP; one address per test keeps the suite under the production limit. */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, testInfo) => {
    const [a, b, c] = createHash('sha256').update(`${testInfo.project.name}:${testInfo.testId}:${testInfo.retry}`).digest();
    await provide({ ...extraHTTPHeaders, 'x-forwarded-for': `10.${a}.${b}.${c}` });
  },
});
