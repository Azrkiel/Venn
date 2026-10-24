import { userRoute } from '@/lib/route';
import { privateJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { beginPhoneLink, phoneLinkState, unlinkPhone } from '@/features/identity/phone-link';

export const runtime = 'nodejs';
export const GET = (request: Request) => userRoute(request, async ownerId => privateJson(await phoneLinkState(ownerId)));
export const POST = (request: Request) => userRoute(request, async ownerId => {
  await consumeRateLimit(`pair-phone:${ownerId}`, 5);
  return privateJson(await beginPhoneLink(ownerId), 201);
});
export const DELETE = (request: Request) => userRoute(request, async ownerId => privateJson(await unlinkPhone(ownerId)));
