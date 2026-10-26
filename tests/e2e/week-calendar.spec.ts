import { expect, test, type Locator, type Page } from './fixtures/test';
import { getDb } from '../../src/lib/db';
import { createAvailabilityPoll } from '../../src/features/availability/service';
import { planningEndDate } from '../../src/features/availability/schema';

test.skip(!process.env.DATABASE_URL, 'Weekly calendar journeys need the local test database.');
test.use({ timezoneId: 'America/New_York' });
let ownerId: string;
test.beforeEach(async () => { ownerId = (await getDb().user.create({ data: { name: 'Weekly test owner' } })).id; });
test.afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
test.afterAll(async () => { await getDb().$disconnect(); });

async function makeWeek(scale: 'week' | 'fortnight' = 'week') {
  const result = await createAvailabilityPoll(ownerId, { activity: 'A week of possibilities', scale,
    startDate: '2030-01-15', endDate: planningEndDate('2030-01-15', scale), timezone: 'America/New_York',
    closesAt: new Date(Date.now() + 86_400_000).toISOString() });
  return { ...result, share: result.path.split('/').at(-1)! };
}

function quarter(page: Page, date: string, time: string) {
  return page.getByRole('button', { name: `Select ${date} ${time} -05:00`, exact: true });
}

async function paint(page: Page, first: Locator, last: Locator) {
  await first.scrollIntoViewIfNeeded(); await last.scrollIntoViewIfNeeded();
  await first.evaluate(element => {
    const frame = element.closest<HTMLElement>('[data-testid="week-calendar-scroll"]')!;
    frame.scrollTop = (element as HTMLElement).offsetTop - frame.clientHeight / 2;
  });
  const a = (await first.boundingBox())!, b = (await last.boundingBox())!;
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let i = 1; i <= 12; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12,
      }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await client.detach(); }
  } else {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
  }
}

async function save(page: Page, share: string) {
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/venns/${share}/availability`) && response.ok()),
    page.getByRole('button', { name: 'Save availability', exact: true }).click(),
  ]);
  return (await page.request.get(`/api/venns/${share}`)).json();
}

test('weekly calendar drags separate quarter-hour ranges on different days', async ({ page }, testInfo) => {
  const poll = await makeWeek();
  await page.goto(poll.path);
  await expect(page.getByRole('group', { name: 'Weekly availability calendar', exact: true })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Alex');
  await paint(page, quarter(page, '2030-01-15', '12:00 PM'), quarter(page, '2030-01-15', '12:45 PM'));
  await paint(page, quarter(page, '2030-01-17', '1:15 PM'), quarter(page, '2030-01-17', '1:30 PM'));
  await expect(quarter(page, '2030-01-17', '1:30 PM')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('week-calendar-scroll').screenshot({ path: testInfo.outputPath('weekly-calendar.png') });
  const saved = await save(page, poll.share);
  expect(saved.ownResponse.ranges).toEqual([
    { start: '2030-01-15T17:00:00Z', end: '2030-01-15T18:00:00Z' },
    { start: '2030-01-17T18:15:00Z', end: '2030-01-17T18:45:00Z' },
  ]);
  await page.reload();
  await expect(quarter(page, '2030-01-15', '12:00 PM')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'mobile') expect(await page.getByTestId('week-calendar-scroll').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('cross-day drag selects only the clock-time rectangle, never overnight hours', async ({ page }) => {
  const poll = await makeWeek(); await page.goto(poll.path);
  await expect(page.getByRole('group', { name: 'Weekly availability calendar', exact: true })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Jamie');
  await paint(page, quarter(page, '2030-01-15', '2:00 PM'), quarter(page, '2030-01-16', '2:30 PM'));
  const saved = await save(page, poll.share);
  expect(saved.ownResponse.ranges).toEqual([
    { start: '2030-01-15T19:00:00Z', end: '2030-01-15T19:45:00Z' },
    { start: '2030-01-16T19:00:00Z', end: '2030-01-16T19:45:00Z' },
  ]);
});

test('two-week navigation preserves choices, including saved and closed results', async ({ page }) => {
  const poll = await makeWeek('fortnight'); await page.goto(poll.path);
  await expect(page.getByRole('group', { name: 'Weekly availability calendar', exact: true })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Morgan');
  await quarter(page, '2030-01-15', '12:00 PM').press('Enter');
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await quarter(page, '2030-01-22', '12:00 PM').press('Space');
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(quarter(page, '2030-01-15', '12:00 PM')).toHaveAttribute('aria-pressed', 'true');
  const saved = await save(page, poll.share);
  expect(saved.ownResponse.ranges).toEqual([
    { start: '2030-01-15T17:00:00Z', end: '2030-01-15T17:15:00Z' },
    { start: '2030-01-22T17:00:00Z', end: '2030-01-22T17:15:00Z' },
  ]);
  await getDb().availabilityPoll.updateMany({ where: { ownerId }, data: { closedAt: new Date() } });
  await page.reload();
  await expect(quarter(page, '2030-01-15', '12:00 PM')).toBeDisabled();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(quarter(page, '2030-01-22', '12:00 PM')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('guests can optionally sign up to sync their calendar and return to the same Venn', async ({ page }) => {
  const poll = await makeWeek(); await page.goto(poll.path);
  const link = page.getByRole('link', { name: 'Sign up to sync your calendar', exact: true });
  await expect(link).toBeVisible();
  const target = new URL((await link.getAttribute('href'))!, 'http://127.0.0.1:3000');
  expect(target.pathname).toBe('/signup');
  const setup = new URL(target.searchParams.get('returnTo')!, 'http://127.0.0.1:3000');
  expect(setup.pathname).toBe('/setup');
  expect(setup.searchParams.get('returnTo')).toBe(poll.path);
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toBeEnabled();
});

test('unsaved choices survive a signup trip back to the same Venn', async ({ page }) => {
  const poll = await makeWeek(); await page.goto(poll.path);
  await page.getByLabel('Your name', { exact: true }).fill('Unsaved Alex');
  await quarter(page, '2030-01-15', '12:00 PM').press('Enter');
  await page.getByRole('link', { name: 'Sign up to sync your calendar', exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?/);
  await page.goto(poll.path);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Unsaved Alex');
  await expect(quarter(page, '2030-01-15', '12:00 PM')).toHaveAttribute('aria-pressed', 'true');
});
