import { z } from 'zod';
import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { getOwnerRequest, cancelRequest } from '@/features/requests/service';

type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => userRoute(request, async userId => privateJson(await getOwnerRequest(userId, (await context.params).id)));
export const PATCH = (request: Request, context: Context) => userRoute(request, async userId => {
  await readJson(request, z.object({ action: z.literal('cancel') }).strict());
  return privateJson(await cancelRequest(userId, (await context.params).id));
});
