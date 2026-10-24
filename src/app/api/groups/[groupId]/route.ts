import { z } from 'zod';
import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { createInvite, leaveOrDeleteGroup } from '@/features/groups/service';
import { consumeRateLimit } from '@/lib/rate-limit';

type Context = { params: Promise<{ groupId: string }> };
export const POST = (request: Request, context: Context) => userRoute(request, async userId => {
  await readJson(request, z.object({ action: z.literal('invite') }).strict());
  await consumeRateLimit(`invite:${userId}`, 10);
  const invite = await createInvite(userId, (await context.params).groupId);
  return privateJson({ path: `/join/${invite.token}`, expiresAt: invite.expiresAt }, 201);
});
export const DELETE = (request: Request, context: Context) => userRoute(request, async userId => {
  const input = await readJson(request, z.object({ action: z.enum(['leave', 'delete']) }).strict());
  await leaveOrDeleteGroup(userId, (await context.params).groupId, input.action === 'delete');
  return privateJson({ ok: true });
});
