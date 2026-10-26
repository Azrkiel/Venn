import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/venns/[share]/availability/route';

const { save, cookieSet } = vi.hoisted(() => ({ save: vi.fn(), cookieSet: vi.fn() }));
vi.mock('@/features/availability/service', () => ({ AVAILABILITY_COOKIE: 'venn-availability-guest', saveAvailability: save }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'g'.repeat(43) }), set: cookieSet }) }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/auth', () => ({ currentUserId: async () => undefined }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/availability/notices', () => ({ processAvailabilityNotices: vi.fn() }));

describe('availability picture request bounds', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('APP_BASE_URL', 'https://venn.test'); save.mockResolvedValue({ respondentCount: 1 }); });
  const context = () => ({ params: Promise.resolve({ share: 's'.repeat(43) }) });
  const request = (body: string) => new Request('https://venn.test/api/venns/share/availability', { method: 'PUT',
    headers: { Origin: 'https://venn.test', 'Content-Type': 'application/json' }, body });
  it('accepts a bounded thumbnail together with the full supported availability range count', async () => {
    const photo = await sharp(randomBytes(80 * 80 * 3), { raw: { width: 80, height: 80, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
    const input = { name: 'Picture guest', picture: { kind: 'photo', dataUrl: `data:image/jpeg;base64,${photo.toString('base64')}` },
      ranges: Array.from({ length: 768 }, () => ({ start: '2030-01-15T12:00:00.000+00:00', end: '2030-01-15T12:15:00.000+00:00' })) };
    const body = JSON.stringify(input);
    expect(body.length).toBeGreaterThan(65_536); expect(body.length).toBeLessThan(131_072);
    const response = await PUT(request(body), context());
    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledWith('s'.repeat(43), input, { guestKey: 'g'.repeat(43), userId: undefined });
  });
  it('rejects a body above the combined picture/range limit before saving', async () => {
    const response = await PUT(request(' '.repeat(131_073)), context());
    expect(response.status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });
});
