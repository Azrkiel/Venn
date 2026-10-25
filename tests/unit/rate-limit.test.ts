import { afterEach, describe, expect, it, vi } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock('@/lib/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/db')>(),
  getDb: () => ({ rateLimitBucket: { upsert } }),
}));
import { consumeRateLimit } from '@/lib/rate-limit';

afterEach(() => vi.resetAllMocks());

describe('rate limit contention', () => {
  it('retries an initial unique collision and still denies a request above the limit', async () => {
    upsert.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ count: 3 });
    await expect(consumeRateLimit('concurrent-first-request', 2)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toEqual(upsert.mock.calls[1][0]);
  });

  it('allows a colliding request only when its retried count is within the limit', async () => {
    upsert.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ count: 2 });
    await expect(consumeRateLimit('concurrent-allowed-request', 2)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('does not loop forever on repeated collisions or retry unrelated database errors', async () => {
    const collision = { code: 'P2002' };
    upsert.mockRejectedValue(collision);
    await expect(consumeRateLimit('repeated-collision')).rejects.toBe(collision);
    expect(upsert).toHaveBeenCalledTimes(2);
    upsert.mockReset();
    const unavailable = new Error('database unavailable');
    upsert.mockRejectedValue(unavailable);
    await expect(consumeRateLimit('unavailable')).rejects.toBe(unavailable);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
