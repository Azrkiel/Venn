import { expect, test } from '@playwright/test';
import { DateTime } from 'luxon';
import { getDb } from '../../src/lib/db';
import { createSecret } from '../../src/features/identity/secrets';
import { createAvailabilityPoll } from '../../src/features/availability/service';

test.skip(process.env.VENN_AUTH_E2E !== '1', 'Run with VENN_AUTH_E2E=1 for isolated, seeded identity sessions.');
test.use({ timezoneId: 'America/New_York' });
let ownerId: string;

test.beforeEach(async ({ context, baseURL }) => {
  ownerId = (await getDb().user.create({ data: { name: 'Venn E2E creator' } })).id;
  const sessionToken = createSecret();
  await getDb().session.create({ data: { userId: ownerId, sessionToken, expires: new Date(Date.now() + 3_600_000) } });
  await context.addCookies([{ name: 'authjs.session-token', value: sessionToken, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
});

test('signed-in voter privately cross-references calendar busy time without automatic votes', async ({ page, browser, baseURL }, testInfo) => {
  const poll = await createAvailabilityPoll(ownerId, { activity: 'Cross-reference your week', scale: 'week', timezone: 'America/New_York',
    startDate: '2030-01-15', endDate: '2030-01-21', closesAt: new Date(Date.now() + 86_400_000).toISOString() });
  const share = poll.path.split('/').at(-1)!;
  let known = true;
  await page.route('**/api/venns/*/calendar?**', route => route.fulfill({ json: { state: known ? 'known' : 'unknown',
    busy: known ? [{ start: '2030-01-15T17:00:00Z', end: '2030-01-15T18:00:00Z' }] : [], checkedAt: new Date().toISOString() } }));
  await page.goto(poll.path);
  await page.getByRole('button', { name: 'Show my calendar', exact: true }).click();
  const cell = page.getByRole('button', { name: 'Select 2030-01-15 12:00 PM -05:00', exact: true });
  await expect(cell).toHaveAccessibleDescription(/Your calendar: busy/);
  await page.getByTestId('week-calendar-scroll').screenshot({ path: testInfo.outputPath('private-calendar.png') });
  const before = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(before.respondentCount).toBe(0);
  expect(JSON.stringify(before)).not.toMatch(/"busy"|calendarId|userId/);
  await page.getByLabel('Your name', { exact: true }).fill('Calendar owner');
  await cell.press('Enter');
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/venns/${share}`)).json()).ownResponse.ranges).toEqual([
    { start: '2030-01-15T17:00:00Z', end: '2030-01-15T17:15:00Z' },
  ]);
  known = false;
  await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
  await expect(page.getByText('Couldn’t check your calendar. Busy times unknown.', { exact: true })).toBeVisible();
  await expect(cell).not.toHaveAccessibleDescription(/Your calendar: busy/);
  const otherContext = await browser.newContext({ baseURL });
  try {
    const guest = await otherContext.newPage(); await guest.goto(poll.path);
    await expect(guest.getByRole('link', { name: 'Sign up to sync your calendar', exact: true })).toBeVisible();
    const response = await guest.request.get(`/api/venns/${share}/calendar?start=2030-01-15T05%3A00%3A00Z&end=2030-01-22T05%3A00%3A00Z`);
    expect(response.status()).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('2030-01-15T17:00:00Z');
  } finally { await otherContext.close(); }
});
test.afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
test.afterAll(async () => { await getDb().$disconnect(); });

test('signed-in creator makes a Venn without a calendar, shares it and closes early', async ({ page, browser, baseURL }, testInfo) => {
  const tomorrow = DateTime.now().setZone('America/New_York').plus({ days: 1 }).toISODate()!;
  await page.goto('/venn');
  await page.getByLabel('Activity', { exact: true }).fill('Lunch with friends');
  await page.getByRole('radio', { name: /One day/ }).check();
  await page.getByLabel('First date', { exact: true }).fill(tomorrow);
  await page.getByLabel('Voting closes', { exact: true }).fill(`${tomorrow}T10:00`);
  await page.screenshot({ path: testInfo.outputPath('creator.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create Venn', exact: true }).click();
  const link = page.getByLabel('Your Venn link', { exact: true });
  await expect(link).toHaveValue(/\/r\/[A-Za-z0-9_-]{43}$/);
  const url = await link.inputValue();
  const guestContext = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(url);
    const unauthorized = await guest.request.post(`/api/venns/${new URL(url).pathname.split('/').at(-1)}/close`, { headers: { origin: baseURL! } });
    expect(unauthorized.status()).toBe(401);
    await guest.getByLabel('Your name', { exact: true }).fill('Sam');
    await guest.getByRole('button', { name: 'Save availability', exact: true }).click();
    await expect(guest.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Open your Venn' }).click();
    await expect(page.getByText('1 response', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close voting early', exact: true }).click();
    await expect(page.getByText('Voting closed', { exact: true })).toBeVisible();
    await expect(guest.getByText('Voting closed', { exact: true })).toBeVisible({ timeout: 12_000 });
    await expect(guest.getByRole('button', { name: 'Save availability', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await getDb().calendarGrant.count({ where: { userId: ownerId } })).toBe(0);
  } finally { await guestContext.close(); }
});
