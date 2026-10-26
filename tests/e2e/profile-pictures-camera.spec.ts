import { expect, test, type Page } from './fixtures/test';
import { getDb } from '../../src/lib/db';
import { createAvailabilityPoll } from '../../src/features/availability/service';
import { waitForHydration } from './fixtures/hydration';
import { digestSecret } from '../../src/features/identity/secrets';

test.skip(!process.env.DATABASE_URL, 'Picture journeys require an isolated test database.');
let ownerId: string;
let path: string;

test.beforeEach(async () => {
  ownerId = (await getDb().user.create({ data: { name: 'Synthetic camera test owner' } })).id;
  path = (await createAvailabilityPoll(ownerId, { activity: 'Make a face with friends', scale: 'day', timezone: 'UTC',
    startDate: '2030-05-01', endDate: '2030-05-01', closesAt: new Date(Date.now() + 86_400_000).toISOString() })).path;
});
test.afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
test.afterAll(async () => { await getDb().$disconnect(); });

declare global {
  interface Window { __profileCamera: { started: number; stopped: number; release?: () => void } }
}

async function syntheticCamera(page: Page, mode: 'ready' | 'deferred' | 'denied' = 'ready') {
  await page.addInitScript(({ mode }) => {
    const state = { started: 0, stopped: 0 } as Window['__profileCamera'];
    window.__profileCamera = state;
    const stream = () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext('2d')!;
      const paint = () => { context.fillStyle = '#cdbfff'; context.fillRect(0, 0, 320, 240);
        context.fillStyle = '#ffcfb7'; context.beginPath(); context.arc(160, 120, 80, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#292331'; context.fillRect(125, 95, 12, 12); context.fillRect(185, 95, 12, 12);
        context.fillStyle = '#ec6f98'; context.fillRect(150, 150, 22, 35); };
      paint();
      const result = canvas.captureStream(8);
      const timer = setInterval(paint, 100);
      result.getTracks().forEach(track => {
        const original = track.stop.bind(track);
        track.stop = () => { state.stopped++; clearInterval(timer); original(); };
      });
      return result;
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => {
        state.started++;
        if (mode === 'denied') return Promise.reject(new DOMException('Synthetic denial', 'NotAllowedError'));
        if (mode === 'deferred') return new Promise<MediaStream>(resolve => { state.release = () => resolve(stream()); });
        return Promise.resolve(stream());
      },
    } });
  }, { mode });
}

test('selfie capture is opt-in, supports retaking, stops tracks and survives saving', async ({ page }, testInfo) => {
  await syntheticCamera(page);
  await page.goto(path);
  await waitForHydration(page);
  expect(await page.evaluate(() => window.__profileCamera.started)).toBe(0);
  await page.getByLabel('Your name', { exact: true }).fill('Selfie Sam');
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  const booth = page.getByRole('dialog', { name: 'Make a face.' });
  await expect(booth).toBeVisible();
  await expect(booth.getByRole('button', { name: 'Snap', exact: true })).toBeEnabled();
  await booth.screenshot({ path: testInfo.outputPath('selfie-booth.png') });
  expect(await booth.locator('video').evaluate(element => getComputedStyle(element).transform)).toContain('-1');
  await booth.getByRole('button', { name: 'Snap', exact: true }).click();
  await expect(booth.getByAltText('Selfie preview')).toBeVisible();
  await booth.screenshot({ path: testInfo.outputPath('selfie-review.png') });
  expect(await page.evaluate(() => window.__profileCamera.stopped)).toBe(1);
  await booth.getByRole('button', { name: 'Retake', exact: true }).click();
  await expect(booth.getByRole('button', { name: 'Snap', exact: true })).toBeEnabled();
  await booth.getByRole('button', { name: 'Snap', exact: true }).click();
  expect(await page.evaluate(() => window.__profileCamera.stopped)).toBe(2);
  await booth.getByRole('button', { name: 'Use photo', exact: true }).click();
  await expect(booth).not.toBeVisible();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
  await page.reload();
  await waitForHydration(page);
  const photo = page.getByRole('img', { name: "Selfie Sam's profile picture", exact: true });
  await expect(photo.locator('img')).toHaveAttribute('src', /\/api\/venns\/[^/]+\/pictures\//);
  await expect.poll(() => photo.locator('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(192);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('selfie-saved.png'), fullPage: true });
});

test('closing while camera permission is pending stops a late stream without reopening', async ({ page }) => {
  await syntheticCamera(page, 'deferred');
  await page.goto(path);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  await page.getByRole('button', { name: 'Close selfie booth', exact: true }).click();
  await page.evaluate(() => window.__profileCamera.release!());
  await expect.poll(() => page.evaluate(() => window.__profileCamera.stopped)).toBe(1);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toBeEnabled();
});

test('Escape and hiding the page each close the booth and release its camera', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto(path);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Snap', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.__profileCamera.stopped)).toBe(1);
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Snap', exact: true })).toBeEnabled();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.__profileCamera.stopped)).toBe(2);
});

test('denied camera keeps the chosen avatar and offers a photo fallback', async ({ page }) => {
  await syntheticCamera(page, 'denied');
  await page.goto(path);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Pick a face', exact: true }).click();
  await page.getByRole('button', { name: 'Tongue out', exact: true }).click();
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  await expect(page.getByText('Camera access is off. Choose a photo or pick a face instead.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose a photo in the selfie booth', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Close selfie booth', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tongue out', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('photo upload crops to a thumbnail and invalid uploads keep the last picture', async ({ page }) => {
  await page.goto(path);
  await waitForHydration(page);
  await page.getByLabel('Your name', { exact: true }).fill('Photo Pat');
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
    const context = canvas.getContext('2d')!; context.fillStyle = '#ffb894'; context.fillRect(0, 0, 400, 200); return canvas.toDataURL('image/png'); });
  const input = page.getByLabel('Choose a profile photo', { exact: true });
  await input.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  const preview = page.getByRole('img', { name: "Photo Pat's profile picture", exact: true }).locator('img');
  await expect(preview).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  const accepted = await preview.getAttribute('src');
  await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
  await expect(page.getByText('This photo could not be opened. Try another JPEG, PNG, or WebP.', { exact: true })).toBeVisible();
  await expect(preview).toHaveAttribute('src', accepted!);
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Make your own Venn', exact: true })).toBeVisible();
});

test('an unavailable camera can use the file fallback inside the booth', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  await page.goto(path);
  await waitForHydration(page);
  await page.getByLabel('Your name', { exact: true }).fill('Fallback Fran');
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  await expect(page.getByText('This browser cannot open a camera. Choose a photo or pick a face instead.', { exact: true })).toBeVisible();
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    canvas.getContext('2d')!.fillRect(0, 0, 64, 64); return canvas.toDataURL('image/png'); });
  await page.getByLabel('Choose a photo in the selfie booth', { exact: true }).setInputFiles({ name: 'fallback.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('img', { name: "Fallback Fran's profile picture", exact: true }).locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
});

test('a poll closing while the booth is open releases the camera', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto(path);
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Take a selfie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Snap', exact: true })).toBeEnabled();
  await getDb().availabilityPoll.updateMany({ where: { tokenDigest: digestSecret(path.split('/').at(-1)!) }, data: { closedAt: new Date() } });
  await expect(page.getByText('Voting closed', { exact: true }).first()).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.__profileCamera.stopped)).toBe(1);
});
