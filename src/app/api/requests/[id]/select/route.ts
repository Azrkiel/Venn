import { z } from 'zod';
import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { selectSlot } from '@/features/requests/service';

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => userRoute(request, async userId => {
  const input = await readJson(request, z.object({ slotId: z.string().min(1).max(100), slotVersion: z.number().int().positive() }).strict());
  return privateJson(await selectSlot(userId, (await context.params).id, input.slotId, input.slotVersion));
});
