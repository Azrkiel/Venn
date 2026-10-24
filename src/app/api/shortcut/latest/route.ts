import { authenticateDevice } from '@/features/identity/device-token';
import { latestOwnerResult } from '@/features/messaging/delivery';
import { apiError, privateJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const ownerId = await authenticateDevice(request);
    await consumeRateLimit(`shortcut-read:${ownerId}`, 30);
    return privateJson(await latestOwnerResult(ownerId));
  } catch (error) { return apiError(error); }
}
