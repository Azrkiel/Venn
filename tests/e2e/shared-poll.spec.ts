import { expect, test, type Browser, type Page } from '@playwright/test';
import { cleanupPoll, closeDb, seedPoll, type SeededPoll } from './fixtures/seed';

test.skip(!process.env.DATABASE_URL, 'DATABASE_URL is not set; shared poll tests need Postgres.');
test.describe.configure({ mode: 'serial' });

let seed: SeededPoll;
test.beforeAll(async () => { seed = await seedPoll(); });
test.afterAll(async () => { await cleanupPoll(seed); await closeDb(); });

const pollUrl = (token: string) => `/r/${token}`;
const option = (page: Page, n: number) => page.locator('article', { hasText: `OPTION ${n}` });
const guestCounts = (page: Page, n: number) => option(page, n).getByText(/Guests \(self-reported\)/);

async function newGuest(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

test('guest sees only options, no private data', async ({ page }) => {
  await page.goto(pollUrl(seed.tokens.valid));
  await expect(page.getByRole('heading', { name: 'Which times work for you?' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(seed.optionCount);
  const html = await page.content();
  expect(html).not.toContain(seed.ownerEmail);
  expect(html).not.toContain(seed.ownerName);
  expect(html).not.toContain(seed.userId);
  expect(html).not.toContain('e2e-venn.invalid');
});

test('two guests vote, counts reflect both, changing a vote does not double count', async ({ browser, baseURL }) => {
  const a = await newGuest(browser, baseURL);
  const b = await newGuest(browser, baseURL);
  try {
    await a.page.goto(pollUrl(seed.tokens.valid));
    await a.page.getByPlaceholder('What should we call you?').fill('Alice');
    await option(a.page, 1).getByRole('button', { name: 'works' }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(guestCounts(a.page, 1)).toContainText('1 works · 0 can');
    await expect(a.page.getByText('1 guest browser has responded')).toBeVisible();

    await b.page.goto(pollUrl(seed.tokens.valid));
    await b.page.getByPlaceholder('What should we call you?').fill('Bob');
    await option(b.page, 1).getByRole('button', { name: 'works' }).click();
    await expect(b.page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(guestCounts(b.page, 1)).toContainText('2 works · 0 can');
    await expect(b.page.getByText('2 guest browsers have responded')).toBeVisible();

    // Bob changes to can't: moves between buckets, total stays 2.
    await option(b.page, 1).getByRole('button', { name: "can't" }).click();
    await expect(guestCounts(b.page, 1)).toContainText('1 works · 1 can');
    // Re-submitting the same choice is idempotent.
    await option(b.page, 1).getByRole('button', { name: "can't" }).click();
    await expect(guestCounts(b.page, 1)).toContainText('1 works · 1 can');

    // A fresh load by the other guest reflects the change.
    await a.page.reload();
    await expect(guestCounts(a.page, 1)).toContainText('1 works · 1 can');
    await expect(a.page.getByText('2 guest browsers have responded')).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

for (const key of ['expired', 'revoked', 'unknown'] as const) {
  test(`${key} token shows unavailable`, async ({ page }) => {
    await page.goto(pollUrl(seed.tokens[key]));
    await expect(page.getByRole('heading', { name: /This plan isn.t available/ })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(0);
  });
}
