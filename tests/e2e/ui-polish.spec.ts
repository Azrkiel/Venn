import { expect, test, type Locator } from './fixtures/test';
import { getDb } from '../../src/lib/db';
import { createAvailabilityPoll } from '../../src/features/availability/service';
import { planningEndDate, type AvailabilityScale } from '../../src/features/availability/schema';

test.skip(!process.env.DATABASE_URL, 'UI polish journeys need the local test Postgres database.');
test.use({ timezoneId: 'America/New_York' });

let ownerId: string;
test.beforeEach(async () => { ownerId = (await getDb().user.create({ data: { name: 'Polish test owner' } })).id; });
test.afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
test.afterAll(async () => { await getDb().$disconnect(); });

async function makePoll(scale: AvailabilityScale) {
  return createAvailabilityPoll(ownerId, { activity: 'Tacos on the roof', scale, timezone: 'America/New_York',
    startDate: '2030-01-15', endDate: planningEndDate('2030-01-15', scale), closesAt: new Date(Date.now() + 86_400_000).toISOString() });
}

const animationCount = (locator: Locator) => locator.evaluate(element => element.getAnimations().length);

async function press(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await locator.page().mouse.down();
}

test('first screen leads with the activity and keeps privacy detail on demand', async ({ page }) => {
  const poll = await makePoll('day');
  await page.goto(poll.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tacos on the roof.');
  await expect(page.getByText('Your people, one plan', { exact: false })).toHaveCount(0);
  const privacy = page.getByText(/Your calendar, event details and contact information stay private/);
  await expect(privacy).toBeHidden();
  await page.getByText('Who sees what', { exact: true }).click();
  await expect(privacy).toBeVisible();
});

test('saving shows a pending state, then a confirmed Saved state', async ({ page }) => {
  const poll = await makePoll('day');
  await page.goto(poll.path);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/availability', async route => { await held; await route.continue(); });
  await page.getByLabel('Your name', { exact: true }).fill('Rae');
  const save = page.getByRole('button', { name: 'Save availability', exact: true });
  await save.click();
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await expect(save).toContainText('Saving…');
  await expect(save).toBeDisabled();
  release();
  await expect(save).toContainText('Saved');
  await expect(save).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
});

test('a failed save says so and keeps the edits', async ({ page }) => {
  const poll = await makePoll('day');
  await page.goto(poll.path);
  await page.route('**/availability', route => route.fulfill({ status: 500, json: { error: { message: 'Something went wrong. Try again.' } } }));
  await page.getByLabel('Your name', { exact: true }).fill('Rae');
  await page.getByRole('button', { name: 'Select 2030-01-15 12:00 PM -05:00', exact: true }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByText('Something went wrong. Try again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).not.toContainText('Saved');
  await expect(page.getByRole('button', { name: 'Select 2030-01-15 12:00 PM -05:00', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Rae');
});

test('controls compress on press and settle on release', async ({ page }) => {
  const poll = await makePoll('day');
  await page.goto(poll.path);
  const control = page.getByText('Or enter a time window', { exact: true });
  await press(control);
  expect(await animationCount(control)).toBeGreaterThan(0);
  await page.mouse.up();
  await expect.poll(() => animationCount(control)).toBe(0);
});

test('reduced motion keeps controls still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const poll = await makePoll('day');
  await page.goto(poll.path);
  const control = page.getByText('Or enter a time window', { exact: true });
  await press(control);
  expect(await animationCount(control)).toBe(0);
  await page.mouse.up();
  expect(await animationCount(control)).toBe(0);
  await control.click();
  expect(await animationCount(control)).toBe(0);
  const privacy = page.getByText('Who sees what', { exact: true });
  await privacy.click();
  expect(await animationCount(privacy)).toBe(0);
});

test('reduced motion keeps the pending save indicator still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const poll = await makePoll('day');
  await page.goto(poll.path);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/availability', async route => { await held; await route.continue(); });
  try {
    await page.getByLabel('Your name', { exact: true }).fill('Rae');
    const save = page.getByRole('button', { name: 'Save availability', exact: true });
    await save.click();
    await expect(save).toHaveAttribute('aria-busy', 'true');
    expect(await animationCount(save.locator('svg'))).toBe(0);
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toContainText('Saved');
});

test('reduced motion pans mobile calendar days without intermediate scroll positions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const poll = await makePoll('week');
  await page.goto(poll.path);
  const frame = page.getByTestId('week-calendar-scroll');
  // Capture the first painted position after the real day-arrow action.
  await page.getByRole('button', { name: 'Scroll days later', exact: true }).evaluate(button => {
    button.addEventListener('click', () => {
      requestAnimationFrame(() => {
        const frame = document.querySelector<HTMLElement>('[data-testid="week-calendar-scroll"]')!;
        frame.dataset.firstPanPosition = String(frame.scrollLeft);
      });
    }, { once: true });
  });
  await page.getByRole('button', { name: 'Scroll days later', exact: true }).click();
  await expect(frame).toHaveAttribute('data-first-pan-position', '100');
});

test('calendar cells change colour without moving while dragged', async ({ page }) => {
  const poll = await makePoll('week');
  await page.goto(poll.path);
  const cell = page.getByRole('button', { name: 'Select 2030-01-15 12:00 PM -05:00', exact: true });
  await cell.evaluate(element => {
    const frame = element.closest<HTMLElement>('[data-testid="week-calendar-scroll"]')!;
    frame.scrollTop = (element as HTMLElement).offsetTop - frame.clientHeight / 2;
  });
  await cell.scrollIntoViewIfNeeded();
  const before = await cell.boundingBox();
  await press(cell);
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  expect(await animationCount(cell)).toBe(0);
  expect(await cell.boundingBox()).toEqual(before);
  await page.mouse.up();
});
