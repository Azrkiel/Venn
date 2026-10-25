import { after } from 'next/server';
import { cookies } from 'next/headers';
import { AVAILABILITY_COOKIE, closeAvailabilityPoll } from '@/features/availability/service';
import { processAvailabilityNotices } from '@/features/availability/notices';
import { digestSecret } from '@/features/identity/secrets';
import { privateJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { userRoute } from '@/lib/route';

export const runtime = 'nodejs';

export const POST = (request: Request, context: { params: Promise<{ share: string }> }) => userRoute(request, async ownerId => {
  await consumeRateLimit(`venn-close:${ownerId}`, 20);
  const { share } = await context.params;
  const result = await closeAvailabilityPoll(ownerId, share, { guestKey: (await cookies()).get(AVAILABILITY_COOKIE)?.value });
  after(() => processAvailabilityNotices(new Date(), undefined, digestSecret(share)).then(() => undefined));
  return privateJson(result);
});
