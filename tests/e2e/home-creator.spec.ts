import { expect, test } from '@playwright/test';
import { DateTime } from 'luxon';

test.use({ timezoneId: 'America/New_York' });

test('home opens group creation with readable essentials and no decorative instructions', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/venn$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find a time, together.');
  await expect(page.getByLabel('Activity', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Venn', exact: true })).toBeVisible();
  await expect(page.getByText(/THE BASICS|Pick times|Dates \+ times|Whole dates|Friends pick dates/)).toHaveCount(0);
  await expect(page.getByText('01', { exact: true })).toHaveCount(0);
  expect(await page.getByLabel('Activity', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(18);
  expect(await page.getByRole('radio', { name: 'One week', exact: true }).locator('..').evaluate(element => parseFloat(getComputedStyle(element.querySelector('strong')!).fontSize))).toBeGreaterThanOrEqual(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('group-home.png'), fullPage: true });
});

test('a guest can begin a group plan and retain it through signup', async ({ page }) => {
  const tomorrow = DateTime.now().setZone('America/New_York').plus({ days: 1 }).toISODate()!;
  await page.goto('/');
  await page.getByLabel('Activity', { exact: true }).fill('Beach weekend');
  await page.getByRole('radio', { name: 'A few months', exact: true }).check();
  await page.getByLabel('Number of months', { exact: true }).selectOption('3');
  await page.getByLabel('First date', { exact: true }).fill(tomorrow);
  await page.getByLabel('Voting closes', { exact: true }).fill(`${tomorrow}T10:00`);
  await page.getByRole('button', { name: 'Create Venn', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.goto('/venn');
  await expect(page.getByLabel('Activity', { exact: true })).toHaveValue('Beach weekend');
  await expect(page.getByRole('radio', { name: 'A few months', exact: true })).toBeChecked();
  await expect(page.getByLabel('Number of months', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('First date', { exact: true })).toHaveValue(tomorrow);
  await expect(page.getByLabel('Voting closes', { exact: true })).toHaveValue(`${tomorrow}T10:00`);
});

test('main pages use larger text and keep phone overflow inside controls', async ({ page }) => {
  for (const path of ['/venn', '/signup', '/setup', '/live', '/app']) {
    await page.goto(path);
    expect(await page.locator('body').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), path).toBeGreaterThanOrEqual(18);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    for (const input of await page.locator('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea').all()) {
      if (await input.isVisible()) expect(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), path).toBeGreaterThanOrEqual(16);
    }
  }
});
