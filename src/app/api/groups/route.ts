import { z } from 'zod';
import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { listGroups, createGroup } from '@/features/groups/service';
import { consumeRateLimit } from '@/lib/rate-limit';

export const GET = (request: Request) => userRoute(request, async userId => privateJson({ groups: await listGroups(userId) }));
export const POST = (request: Request) => userRoute(request, async userId => {
  const input = await readJson(request, z.object({ name: z.string().trim().min(1).max(60) }).strict());
  await consumeRateLimit(`group:${userId}`, 10);
  return privateJson(await createGroup(userId, input.name), 201);
});
