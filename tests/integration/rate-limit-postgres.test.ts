import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { digestSecret } from '@/features/identity/secrets';
import { consumeRateLimit } from '@/lib/rate-limit';

describe.skipIf(process.env.VENN_DATABASE_TESTS !== '1')('rate limiting with real Postgres', () => {
  const keys: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await getDb().rateLimitBucket.deleteMany({ where: { key: { in: keys.splice(0) } } });
  });
  afterAll(async () => { await getDb().$disconnect(); });

  it('counts every simultaneous first request and permits exactly the configured maximum', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const identity = `rate-limit-test-${randomUUID()}`;
    const key = digestSecret(`${identity}:${Math.floor(now / 60_000)}`);
    keys.push(key);
    const outcomes = await Promise.allSettled(Array.from({ length: 24 }, () => consumeRateLimit(identity, 7)));
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(7);
    const denied = outcomes.filter(outcome => outcome.status === 'rejected');
    expect(denied).toHaveLength(17);
    for (const outcome of denied) if (outcome.status === 'rejected') {
      expect(outcome.reason).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    }
    expect(await getDb().rateLimitBucket.findUnique({ where: { key } })).toMatchObject({ count: 24 });
  });
});
