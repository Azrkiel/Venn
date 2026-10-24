import { z } from 'zod';
import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { addSelectedEvent } from '@/features/requests/add';

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => userRoute(request, async userId => {
  const input = await readJson(request, z.object({ slotId: z.string().min(1).max(100), slotVersion: z.number().int().positive() }).strict());
  await consumeRateLimit(`add:${userId}`, 10);
  return privateJson(await addSelectedEvent(userId, (await context.params).id, input));
});
