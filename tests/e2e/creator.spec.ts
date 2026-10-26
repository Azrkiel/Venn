import { expect, test } from './fixtures/test';
import { DateTime } from 'luxon';
import { getDb } from '../../src/lib/db';
import { createSecret } from '../../src/features/identity/secrets';
import { createAvailabilityPoll } from '../../src/features/availability/service';
import { CREATE_VENN_DRAFT_KEY } from '../../src/app/venn/create-venn-draft';

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

test('a plan started before sign-in resumes and creates once after sign-in', async ({ page, context }) => {
  const identityCookies = await context.cookies();
  await context.clearCookies();
  const tomorrow = DateTime.now().setZone('America/New_York').plus({ days: 1 }).toISODate()!;
  await page.goto('/');
  await page.getByLabel('Activity', { exact: true }).fill('Weekend with friends');
  await page.getByLabel('First date', { exact: true }).fill(tomorrow);
  await page.getByLabel('Voting closes', { exact: true }).fill(`${tomorrow}T10:00`);
  await page.getByRole('button', { name: 'Create Venn', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(await getDb().availabilityPoll.count({ where: { ownerId } })).toBe(0);
  await context.addCookies(identityCookies);
  await page.goto('/venn');
  await expect(page.getByLabel('Activity', { exact: true })).toHaveValue('Weekend with friends');
  await expect(page.getByLabel('First date', { exact: true })).toHaveValue(tomorrow);
  await expect(page.getByLabel('Voting closes', { exact: true })).toHaveValue(`${tomorrow}T10:00`);
  await page.getByRole('button', { name: 'Create Venn', exact: true }).click();
  await expect(page.getByLabel('Your Venn link', { exact: true })).toHaveValue(/\/r\/[A-Za-z0-9_-]{43}$/);
  const polls = await getDb().availabilityPoll.findMany({ where: { ownerId } });
  expect(polls).toHaveLength(1);
  expect(polls[0]).toMatchObject({ activity: 'Weekend with friends', startDate: tomorrow, timezone: 'America/New_York' });
  expect(await page.evaluate(key => sessionStorage.getItem(key), CREATE_VENN_DRAFT_KEY)).toBeNull();
});

test('reduced motion keeps the pending calendar indicator still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const poll = await createAvailabilityPoll(ownerId, { activity: 'Quiet calendar check', scale: 'week', timezone: 'America/New_York',
    startDate: '2030-01-15', endDate: '2030-01-21', closesAt: new Date(Date.now() + 86_400_000).toISOString() });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/venns/*/calendar?**', async route => {
    await held;
    await route.fulfill({ json: { state: 'known', busy: [], checkedAt: new Date().toISOString() } });
  });
  await page.goto(poll.path);
  try {
    await page.getByRole('button', { name: 'Show my calendar', exact: true }).click();
    const refresh = page.getByRole('button', { name: 'Refresh calendar', exact: true });
    await expect(refresh).toBeDisabled();
    expect(await refresh.locator('svg').evaluate(element => element.getAnimations().length)).toBe(0);
  } finally { release(); }
  await expect(page.getByText('No busy times in this view.', { exact: true })).toBeVisible();
});

test('signed-in creator makes a Venn without a calendar, shares it and closes early', async ({ page, browser, baseURL }, testInfo) => {
  const tomorrow = DateTime.now().setZone('America/New_York').plus({ days: 1 }).toISODate()!;
  await page.goto('/');
  await page.getByLabel('Activity', { exact: true }).fill('Lunch with friends');
  await page.getByRole('radio', { name: /One day/ }).check();
  await page.getByLabel('First date', { exact: true }).fill(tomorrow);
  await page.getByLabel('Voting closes', { exact: true }).fill(`${tomorrow}T10:00`);
  await page.screenshot({ path: testInfo.outputPath('creator.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create Venn', exact: true }).click();
  const link = page.getByLabel('Your Venn link', { exact: true });
  await expect(link).toHaveValue(/\/r\/[A-Za-z0-9_-]{43}$/);
  const url = await link.inputValue();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copy = page.getByRole('button', { name: 'Copy for the group', exact: true });
  await copy.click();
  await expect(copy).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`Lunch with friends — when works for you? ${url}`);
  await expect(copy).toHaveText('Copy for the group');
  // A rejected clipboard write must never show a success acknowledgement.
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true,
      value: () => Promise.reject(new DOMException('Clipboard blocked', 'NotAllowedError')) });
  });
  await copy.click();
  await expect(page.getByRole('status')).toHaveText('Select the link above to copy it.');
  await expect(copy).toHaveText('Copy for the group');
  await page.screenshot({ path: testInfo.outputPath('creator-share.png'), fullPage: true });
  const guestContext = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(url);
    const unauthorized = await guest.request.post(`/api/venns/${new URL(url).pathname.split('/').at(-1)}/close`, { headers: { origin: baseURL! } });
    expect(unauthorized.status()).toBe(401);
    await guest.getByLabel('Your name', { exact: true }).fill('Sam');
    const saved = guest.waitForResponse(response => response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith('/availability'));
    await guest.getByRole('button', { name: 'Save availability', exact: true }).click();
    const response = await saved;
    expect(response.status(), await response.text()).toBe(200);
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
