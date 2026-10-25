import { availabilityPollSchema } from '@/features/availability/schema';
import { createAvailabilityPoll } from '@/features/availability/service';
import { privateJson, readJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { userRoute } from '@/lib/route';

export const runtime = 'nodejs';

export const POST = (request: Request) => userRoute(request, async ownerId => {
  await consumeRateLimit(`venn-create:${ownerId}`, 10);
  return privateJson(await createAvailabilityPoll(ownerId, await readJson(request, availabilityPollSchema)), 201);
});
