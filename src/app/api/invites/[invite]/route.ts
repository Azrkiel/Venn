import { userRoute } from '@/lib/route';
import { privateJson } from '@/lib/http';
import { redeemInvite } from '@/features/groups/service';
import { consumeRateLimit } from '@/lib/rate-limit';

export const POST = (request: Request, context: { params: Promise<{ invite: string }> }) => userRoute(request, async userId => {
  await consumeRateLimit(`join:${userId}`, 20);
  return privateJson(await redeemInvite(userId, (await context.params).invite));
});
