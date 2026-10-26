import { expect, test } from '@playwright/test';
import { getDb } from '../../src/lib/db';
import { createSecret } from '../../src/features/identity/secrets';
import { saveProviderGrant } from '../../src/features/calendar/provider-store';

test.skip(process.env.VENN_AUTH_E2E !== '1', 'Uses isolated local identity sessions.');
const shared = `/r/${'s'.repeat(43)}`;
const setup = `/setup?returnTo=${encodeURIComponent(shared)}`;

test('sync offers Google, Microsoft and iCloud after requiring sign-in', async ({ page }) => {
  await page.goto(setup);
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Microsoft', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Google Calendar', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Connect Microsoft Outlook', exact: true })).toBeDisabled();
  await page.getByText('Connect Apple iCloud', { exact: true }).click();
  await expect(page.getByLabel('Apple Account email', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('App-specific password', { exact: true })).toBeDisabled();
  await page.goto(`/signup?returnTo=${encodeURIComponent(setup)}`);
  await expect(page.getByRole('button', { name: 'Continue with Microsoft', exact: true })).toBeVisible();
});

test.describe('signed-in calendar setup', () => {
  let userId: string;
  test.beforeEach(async ({ context, baseURL }) => {
    userId = (await getDb().user.create({ data: { name: 'Provider browser tester' } })).id;
    const token = createSecret();
    await getDb().session.create({ data: { userId, sessionToken: token, expires: new Date(Date.now() + 3_600_000) } });
    await context.addCookies([{ name: 'authjs.session-token', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
  });
  test.afterEach(async () => { if (userId) await getDb().user.delete({ where: { id: userId } }); });
  test.afterAll(async () => { await getDb().$disconnect(); });

  test('selects calendars per provider, preserves the Venn return and disconnects independently', async ({ page }, testInfo) => {
    await saveProviderGrant(userId, 'outlook', 'test-outlook', new Date(Date.now() + 3_600_000), [{ calendarId: 'same-id', name: 'Work schedule' }]);
    await saveProviderGrant(userId, 'apple', 'test-icloud', new Date(Date.now() + 3_600_000), [{ calendarId: 'same-id', name: 'Family plans' }]);
    await page.goto(setup);
    await page.getByRole('button', { name: 'Include Work schedule from Microsoft Outlook', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Exclude Work schedule from Microsoft Outlook', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Include Family plans from Apple iCloud', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(shared);
    await page.screenshot({ path: testInfo.outputPath('calendar-providers.png'), fullPage: true, caret: 'initial' });
    await page.getByRole('button', { name: 'Disconnect Microsoft Outlook', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Connect Microsoft Outlook', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect Apple iCloud', exact: true })).toBeVisible();
    expect(await getDb().providerCalendarGrant.count({ where: { userId } })).toBe(1);
    expect(await getDb().providerCalendar.count({ where: { grant: { userId, provider: 'outlook' } } })).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('uses Microsoft consent and recovers from an invalid iCloud app password', async ({ page }) => {
    let consent: URL | undefined;
    await page.route('**/api/calendar/connect', async route => {
      const response = await route.fetch({ maxRedirects: 0 });
      expect(response.status()).toBe(303);
      consent = new URL(response.headers().location);
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Microsoft consent intercepted by local test.</p>' });
    });
    await page.goto(setup);
    await page.getByRole('button', { name: 'Connect Microsoft Outlook', exact: true }).click();
    await expect(page.getByText('Microsoft consent intercepted by local test.')).toBeVisible();
    expect(consent?.origin).toBe('https://login.microsoftonline.com');
    expect(consent?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(consent?.searchParams.get('scope')).toContain('Calendars.ReadBasic');
    await page.goto(setup);
    await page.getByText('Connect Apple iCloud', { exact: true }).click();
    await page.getByLabel('Apple Account email', { exact: true }).fill('tester@example.com');
    await page.getByLabel('App-specific password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Connect iCloud calendars', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('app-specific password');
    expect(page.url()).not.toMatch(/tester|wrong-password/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(shared);
  });
});
