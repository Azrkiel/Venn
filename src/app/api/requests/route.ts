import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { createLiveRequest } from '@/features/requests/service';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestSchema } from '@/features/requests/schema';

export const POST = (request: Request) => userRoute(request, async userId => {
  const input = await readJson(request, requestSchema);
  await consumeRateLimit(`parse:${userId}`, 5);
  return privateJson(await createLiveRequest(userId, input), 201);
});
