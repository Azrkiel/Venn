import { expect, test, type Locator, type Page } from '@playwright/test';
import { getDb } from '../../src/lib/db';
import { createAvailabilityPoll } from '../../src/features/availability/service';
import { planningEndDate, type AvailabilityScale } from '../../src/features/availability/schema';

test.skip(!process.env.DATABASE_URL, 'Availability journeys need the local test Postgres database.');
test.use({ timezoneId: 'America/New_York' });

let ownerId: string;
test.beforeEach(async () => {
  const owner = await getDb().user.create({ data: { name: 'Private Calendar Owner', email: `availability-${crypto.randomUUID()}@e2e-venn.invalid` } });
  ownerId = owner.id;
});
test.afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
test.afterAll(async () => { await getDb().$disconnect(); });

async function makePoll(scale: AvailabilityScale = 'day') {
  return createAvailabilityPoll(ownerId, {
    activity: scale === 'day' ? 'Lunch with the crew' : 'Beach with the crew',
    timezone: 'America/New_York', scale, startDate: '2030-01-15', endDate: planningEndDate('2030-01-15', scale),
    closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
}

async function addTime(page: Page, name: string, from: string, until: string) {
  await page.getByLabel('Your name', { exact: true }).fill(name);
  const manualEntry = page.getByText('Or enter a time window', { exact: true });
  if (!(await manualEntry.evaluate(element => element.parentElement!.hasAttribute('open')))) await manualEntry.click();
  await page.getByLabel('Available from', { exact: true }).fill(from);
  await page.getByLabel('Available until', { exact: true }).fill(until);
  await page.getByRole('button', { name: 'Add this time', exact: true }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
}

async function dragAcross(page: Page, first: Locator, last: Locator) {
  await first.scrollIntoViewIfNeeded();
  await last.scrollIntoViewIfNeeded();
  const a = await first.boundingBox(), b = await last.boundingBox();
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  const start = { x: a!.x + a!.width / 2, y: a!.y + a!.height / 2 };
  const end = { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let step = 1; step <= 12; step++) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
          x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12,
        }] });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await touch.detach(); }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
  }
}

test('day guests answer, see live overlap, restore edits and get signup invitation', async ({ page, browser, baseURL }) => {
  const poll = await makePoll();
  const share = poll.path.split('/').at(-1)!;
  await page.goto(poll.path);
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toHaveCount(0);
  const before = await page.request.get(`/api/venns/${share}?names=1`);
  const beforeJson = await before.json();
  expect(beforeJson.names ?? []).toEqual([]);
  expect(JSON.stringify(beforeJson)).not.toMatch(/Private Calendar Owner|e2e-venn.invalid|ownerId|tokenDigest|voterKey/);

  await addTime(page, 'Alice', '12:00', '14:00');
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toHaveAttribute('href', '/signup');
  await page.reload();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Alice');

  const second = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
  try {
    const friend = await second.newPage();
    await friend.goto(poll.path);
    await addTime(friend, 'Bob', '13:00', '15:00');
    const response = await page.request.get(`/api/venns/${share}?names=1`);
    const value = await response.json();
    expect(value.respondentCount).toBe(2);
    expect(value.names).toEqual(expect.arrayContaining(['Alice', 'Bob']));
    expect(value.buckets.find((bucket: { start: string }) => Date.parse(bucket.start) === Date.parse('2030-01-15T18:00:00Z'))?.count).toBe(2);
    await expect(page.getByText(/2 (people|responses|respondents)/).first()).toBeVisible({ timeout: 12_000 });
    await expect.poll(async () => {
      const res = await page.request.get(`/api/venns/${share}`);
      return (await res.json()).respondentCount;
    }).toBe(2);
  } finally { await second.close(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('month date selection supports dragging and editing a single response', async ({ page }) => {
  const poll = await makePoll('month');
  const share = poll.path.split('/').at(-1)!;
  await page.goto(poll.path);
  await page.getByLabel('Your name', { exact: true }).fill('Casey');
  const first = page.getByRole('button', { name: 'Select 2030-01-16', exact: true });
  const last = page.getByRole('button', { name: 'Select 2030-01-18', exact: true });
  await dragAcross(page, first, last);
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  const saved = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(saved.ownResponse.ranges).toContainEqual({ start: '2030-01-16', end: '2030-01-19' });
  await first.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/venns/${share}/availability`) && response.request().method() === 'PUT' && response.ok()),
    page.getByRole('button', { name: 'Save availability', exact: true }).click(),
  ]);
  const edited = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(edited.respondentCount).toBe(1);
  expect(edited.ownResponse.ranges).toContainEqual({ start: '2030-01-17', end: '2030-01-19' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('day availability paints a timed range with touch or mouse', async ({ page }, testInfo) => {
  const poll = await makePoll();
  const share = poll.path.split('/').at(-1)!;
  await page.goto(poll.path);
  await page.getByLabel('Your name', { exact: true }).fill('Ellis');
  const first = page.getByRole('button', { name: 'Select 2030-01-15 12:00 PM -05:00', exact: true });
  const last = page.getByRole('button', { name: 'Select 2030-01-15 12:45 PM -05:00', exact: true });
  await dragAcross(page, first, last);
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Daily availability calendar', exact: true }).screenshot({ path: testInfo.outputPath('day-calendar.png') });
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  const saved = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(saved.ownResponse.ranges).toContainEqual({ start: '2030-01-15T17:00:00Z', end: '2030-01-15T18:00:00Z' });
});

test('two-week Venn collects dates and times and closes without losing readable results', async ({ page, baseURL }) => {
  const poll = await makePoll('fortnight');
  const share = poll.path.split('/').at(-1)!;
  await page.goto(poll.path);
  await page.getByText('Or enter a time window', { exact: true }).click();
  await page.getByLabel('Date', { exact: true }).selectOption('2030-01-20');
  await addTime(page, 'Dee', '11:00', '12:00');
  const saved = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(saved.ownResponse.ranges).toContainEqual({ start: '2030-01-20T16:00:00Z', end: '2030-01-20T17:00:00Z' });
  const unauthorized = await page.request.post(`/api/venns/${share}/close`, { headers: { origin: baseURL! } });
  expect(unauthorized.status()).toBe(503);
  expect((await unauthorized.json()).error.code).toBe('SETUP_REQUIRED');
  await getDb().availabilityPoll.updateMany({ where: { ownerId }, data: { closedAt: new Date() } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toBeDisabled();
  await expect(page.getByText(/voting (has )?closed|this venn is closed/i).first()).toBeVisible();
  const closed = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(closed.closed).toBe(true);
  expect(closed.respondentCount).toBe(1);
  const refused = await page.request.put(`/api/venns/${share}/availability`, {
    headers: { origin: baseURL! }, data: { name: 'Dee', ranges: [] },
  });
  expect(refused.status()).toBe(410);
});

test('signup and creator entry are reachable without requiring a calendar', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(page.getByText(/calendar.*(optional|required)|no calendar/i).first()).toBeVisible();
  await page.goto('/venn');
  await expect(page.getByLabel('Activity', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Venn', exact: true })).toBeVisible();
});

test('simultaneous first answers in two tabs keep one editable browser identity', async ({ page, context }) => {
  const poll = await makePoll('month');
  const share = poll.path.split('/').at(-1)!;
  const otherTab = await context.newPage();
  await Promise.all([page.goto(poll.path), otherTab.goto(poll.path)]);
  await page.getByLabel('Your name', { exact: true }).fill('Taylor');
  await otherTab.getByLabel('Your name', { exact: true }).fill('Taylor updated');
  await context.route('**/api/venns/*/availability', async route => {
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.continue();
  });
  await Promise.all([
    page.getByRole('button', { name: 'Save availability', exact: true }).click(),
    otherTab.getByRole('button', { name: 'Save availability', exact: true }).click(),
  ]);
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  await expect(otherTab.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  const result = await (await page.request.get(`/api/venns/${share}`)).json();
  expect(result.respondentCount).toBe(1);
  expect(result.ownResponse).not.toBeNull();
  await page.reload();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue(result.ownResponse.name);
  await otherTab.close();
});

test('share preview uses the app origin and renders a Messages image', async ({ page, baseURL }, testInfo) => {
  const poll = await makePoll('month');
  await page.goto(poll.path);
  const url = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(new URL(url!).origin).toBe(baseURL);
  const image = await page.request.get(url!);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
  const body = await image.body();
  expect([...body.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await testInfo.attach('Messages preview', { body, contentType: 'image/png' });
});

test('monthly planning keeps the full final month selectable', async ({ page }) => {
  const poll = await makePoll('month'); const share = poll.path.split('/').at(-1)!;
  expect(poll.poll.endDate).toBe('2030-02-28');
  await page.goto(poll.path);
  await page.getByLabel('Your name', { exact: true }).fill('Month-end guest');
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await page.getByRole('button', { name: 'Select 2030-02-28', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/venns/${share}`)).json()).ownResponse.ranges).toEqual([{ start: '2030-02-28', end: '2030-03-01' }]);
});
