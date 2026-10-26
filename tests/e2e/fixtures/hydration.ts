import type { Page } from '@playwright/test';

/** Input typed or clicked before React hydrates is dropped; `next dev` under parallel load hydrates late. */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[autocomplete="given-name"]');
    return !!input && Object.keys(input).some(key => key.startsWith('__reactProps$'));
  });
}
