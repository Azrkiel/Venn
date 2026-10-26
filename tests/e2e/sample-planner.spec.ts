import { expect, test, type Page } from './fixtures/test';

async function findOverlap(page: Page) {
  await page.goto('/app');
  await page.getByRole('button', { name: /Find our overlap/ }).click();
  await expect(page.getByRole('heading', { name: 'Here’s your overlap.' })).toBeVisible();
}

const slotTimes = async (page: Page) => page.locator('.slot-list .slot-time').allTextContents();

test.describe('sample planner', () => {
  test('/app keeps the optional sample planner available', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Sample calendars')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What’s the plan?' })).toBeVisible();
  });

  test('overlap -> conflict changes slots -> empty state -> pick -> draft -> back', async ({ page }) => {
    await findOverlap(page);
    const baseline = await slotTimes(page);
    expect(baseline.length).toBeGreaterThan(0);

    await page.getByText('Try a different situation').click();
    const toggle = page.getByTestId('demo-conflict-toggle');
    await toggle.check({ force: true });
    await expect(toggle).toBeChecked();
    await expect.poll(() => slotTimes(page)).not.toEqual(baseline);
    expect((await slotTimes(page)).length).toBeGreaterThan(0);
    await toggle.uncheck({ force: true });
    await expect.poll(() => slotTimes(page)).toEqual(baseline);

    const fills = page.locator('label.conflict-control', { hasText: 'Your day fills up' }).locator('input');
    await fills.check({ force: true });
    await expect(page.getByRole('heading', { name: 'No window fits this time.' })).toBeVisible();
    await fills.uncheck({ force: true });
    await expect(page.getByRole('heading', { name: 'Here’s your overlap.' })).toBeVisible();

    await page.locator('.slot-option').first().click();
    await expect(page.getByRole('heading', { name: 'Sounds like a plan.' })).toBeVisible();
    const draft = page.getByRole('textbox', { name: 'Your editable reply' });
    await expect(draft).not.toHaveValue('');
    await draft.fill('edited reply text');
    await expect(draft).toHaveValue('edited reply text');

    await page.getByRole('button', { name: 'Not this time' }).click();
    await expect(page.getByRole('heading', { name: 'What’s the plan?' })).toBeVisible();
  });

  test('/live and /setup show the unconfigured states', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByRole('heading', { name: 'Your live planner needs a connection' })).toBeVisible();
    await page.goto('/setup');
    await expect(page.getByRole('heading', { name: 'Live connections need server setup' })).toBeVisible();
  });

  test('no horizontal overflow on any sample stage', async ({ page }) => {
    const overflow = () => page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
    await page.goto('/app');
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /Find our overlap/ }).click();
    await expect(page.getByRole('heading', { name: 'Here’s your overlap.' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('.slot-option').first().click();
    await expect(page.getByRole('heading', { name: 'Sounds like a plan.' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const path of ['/live', '/setup']) {
      await page.goto(path);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
  });
});
