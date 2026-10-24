import { userRoute } from '@/lib/route';
import { privateJson } from '@/lib/http';
import { shareRequest } from '@/features/requests/service';
import { consumeRateLimit } from '@/lib/rate-limit';

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => userRoute(request, async userId => {
  await consumeRateLimit(`share:${userId}`, 10);
  return privateJson(await shareRequest(userId, (await context.params).id), 201);
});
