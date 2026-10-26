import { expect, test } from './fixtures/test';
import sharp from 'sharp';
import { getDb } from '../../src/lib/db';
import { createAvailabilityPoll } from '../../src/features/availability/service';
import { waitForHydration } from './fixtures/hydration';

test.skip(!process.env.DATABASE_URL, 'Picture journeys require isolated test Postgres.');
let ownerId: string;
test.beforeEach(async () => { ownerId = (await getDb().user.create({ data: { name: 'Picture test owner' } })).id; });
test.afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
test.afterAll(async () => { await getDb().$disconnect(); });

async function makePoll() {
  return createAvailabilityPoll(ownerId, { activity: 'Goofy lunch club', scale: 'day', timezone: 'UTC',
    startDate: '2030-05-10', endDate: '2030-05-10', closesAt: new Date(Date.now() + 86_400_000).toISOString() });
}

test('a goofy face saves with a name, restores, changes and removes without another respondent', async ({ page }, testInfo) => {
  const poll = await makePoll();
  const api = `/api/venns/${poll.path.split('/').at(-1)}`;
  await page.goto(poll.path);
  await waitForHydration(page);
  await page.getByLabel('Your name', { exact: true }).fill('Bex');
  await page.getByRole('button', { name: 'Pick a face', exact: true }).click();
  await page.getByRole('button', { name: 'Tongue out', exact: true }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  expect((await (await page.request.get(api)).json()).ownResponse.picture).toEqual({ kind: 'avatar', id: 'tongue' });
  await page.reload();
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Pick a face', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tongue out', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('goofy-picker.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Wink', exact: true }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(api)).json()).ownResponse.picture?.id).toBe('wink');
  await page.getByRole('button', { name: 'Remove picture', exact: true }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(api)).json()).ownResponse.picture ?? null).toBeNull();
  expect((await (await page.request.get(api)).json()).respondentCount).toBe(1);
});

test('photo selection restores its draft and saved pictures remain gated to respondents', async ({ page, browser, baseURL }) => {
  const poll = await makePoll();
  const api = `/api/venns/${poll.path.split('/').at(-1)}`;
  const buffer = await sharp({ create: { width: 300, height: 220, channels: 3, background: '#b6e9d5' } }).png().toBuffer();
  await page.goto(poll.path);
  await waitForHydration(page);
  await page.getByLabel('Your name', { exact: true }).fill('Mint');
  await page.getByLabel('Choose a profile photo', { exact: true }).setInputFiles({ name: 'goofy.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('button', { name: 'Remove picture', exact: true })).toBeVisible();
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Mint');
  await expect(page.getByRole('button', { name: 'Remove picture', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  const own = await (await page.request.get(api)).json();
  expect(own.ownResponse.picture.kind).toBe('photo');
  const photoPath = `${api}/pictures/${own.ownResponse.picture.key}`;
  expect((await page.request.get(photoPath)).status()).toBe(200);
  const guestContext = await browser.newContext({ baseURL });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(poll.path);
    await waitForHydration(guest);
    expect((await guest.request.get(photoPath)).status()).toBe(404);
    const anonymous = await (await guest.request.get(`${api}?names=1`)).json();
    expect(anonymous.respondents).toBeUndefined();
    expect(JSON.stringify(anonymous)).not.toContain(own.ownResponse.picture.key);
    await guest.getByLabel('Your name', { exact: true }).fill('Peach');
    await guest.getByRole('button', { name: 'Save availability', exact: true }).click();
    await expect(guest.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
    await expect(guest.getByRole('list', { name: 'Respondents', exact: true })).toHaveCount(0);
    await guest.getByRole('checkbox', { name: 'See who has answered', exact: true }).check();
    const respondents = guest.getByRole('list', { name: 'Respondents', exact: true });
    await expect(respondents).toContainText('Mint');
    const photo = respondents.locator('img');
    await expect(photo).toHaveCount(1);
    await expect.poll(() => photo.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(192);
    const photoResponse = await guest.request.get(photoPath);
    expect(photoResponse.headers()['cache-control']).toContain('private');
    expect(photoResponse.headers()['cache-control']).toContain('no-store');
  } finally { await guestContext.close(); }
  await page.getByRole('button', { name: 'Remove picture', exact: true }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect.poll(async () => (await page.request.get(photoPath)).status()).toBe(404);
});
