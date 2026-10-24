import { z } from 'zod';
import { userRoute } from '@/lib/route';
import { privateJson, readJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { deviceLabelSchema, issueDeviceToken, listDeviceTokens, revokeDeviceToken } from '@/features/identity/device-token';

export const runtime = 'nodejs';
export const GET = (request: Request) => userRoute(request, async ownerId => privateJson({ devices: await listDeviceTokens(ownerId) }));
export const POST = (request: Request) => userRoute(request, async ownerId => {
  const input = await readJson(request, deviceLabelSchema);
  await consumeRateLimit(`issue-device:${ownerId}`, 5);
  return privateJson(await issueDeviceToken(ownerId, input.label), 201);
});
export const DELETE = (request: Request) => userRoute(request, async ownerId => {
  const { id } = await readJson(request, z.object({ id: z.string().min(1).max(100) }).strict());
  return privateJson(await revokeDeviceToken(ownerId, id));
});
