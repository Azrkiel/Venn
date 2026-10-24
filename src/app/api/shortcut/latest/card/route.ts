import { authenticateDevice } from '@/features/identity/device-token';
import { latestOwnerResult } from '@/features/messaging/delivery';
import { renderOwnerCard } from '@/features/cards/render';
import { apiError } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const ownerId = await authenticateDevice(request);
    await consumeRateLimit(`shortcut-card:${ownerId}`, 15);
    return await renderOwnerCard(await latestOwnerResult(ownerId));
  } catch (error) { return apiError(error); }
}
