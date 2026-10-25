import { getDb, isPrismaError } from './db';
import { digestSecret } from '@/features/identity/secrets';
import { HttpError } from './http';

export async function consumeRateLimit(identity: string, maximum = 20, windowMs = 60_000): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = digestSecret(`${identity}:${bucket}`);
  const increment = () => getDb().rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((bucket + 1) * windowMs) },
    update: { count: { increment: 1 } },
  });
  // Concurrent first requests can race on insert; the loser must still increment and be counted.
  const result = await increment().catch(error => {
    if (!isPrismaError(error, 'P2002')) throw error;
    return increment();
  });
  if (result.count > maximum) throw new HttpError(429, 'RATE_LIMITED', 'A few too many requests. Try again shortly.');
}
