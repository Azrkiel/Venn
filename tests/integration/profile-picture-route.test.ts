import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/lib/http';
import { GET } from '@/app/api/venns/[share]/pictures/[picture]/route';

const { picture, cookie, limit } = vi.hoisted(() => ({ picture: vi.fn(), cookie: vi.fn(), limit: vi.fn() }));
vi.mock('@/features/availability/service', () => ({ AVAILABILITY_COOKIE: 'venn-availability-guest', getAvailabilityPicture: picture }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: limit }));

describe('private picture HTTP response', () => {
  beforeEach(() => { vi.clearAllMocks(); cookie.mockReturnValue({ value: 'a'.repeat(43) }); limit.mockResolvedValue(undefined); });
  const request = () => new Request(`https://venn.test/api/venns/${'s'.repeat(43)}/pictures/${'p'.repeat(43)}`);
  const context = () => ({ params: Promise.resolve({ share: 's'.repeat(43), picture: 'p'.repeat(43) }) });
  it('serves JPEG bytes privately using the respondent cookie, never a query-selected identity', async () => {
    picture.mockResolvedValue(new Uint8Array([255, 216, 255, 217]));
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([255, 216, 255, 217]));
    expect(picture).toHaveBeenCalledWith('s'.repeat(43), 'p'.repeat(43), { guestKey: 'a'.repeat(43) });
  });
  it('returns a safe non-cacheable rejection when a picture is unavailable', async () => {
    picture.mockRejectedValue(new HttpError(404, 'PICTURE_NOT_FOUND', 'This picture is not available.'));
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'PICTURE_NOT_FOUND' } });
  });
});
