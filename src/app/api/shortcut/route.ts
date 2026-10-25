import { authenticateDevice } from '@/features/identity/device-token';
import { requestSchema } from '@/features/requests/schema';
import { createLiveRequest } from '@/features/requests/service';
import { IntentParseError } from '@/features/scheduling/intent';
import { WindowError } from '@/features/scheduling/windows';
import { apiError, HttpError, privateJson, readJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CalendarError } from '@/features/calendar/errors';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const ownerId = await authenticateDevice(request);
    await consumeRateLimit(`parse:${ownerId}`, 5);
    const input = await readJson(request, requestSchema);
    return privateJson(await createLiveRequest(ownerId, input), 201);
  } catch (error) {
    if (error instanceof IntentParseError || error instanceof WindowError) {
      return apiError(new HttpError(error instanceof IntentParseError && error.code === 'MODEL_NOT_CONFIGURED' ? 503 : error instanceof IntentParseError && error.code === 'MODEL_BUSY' ? 429 : 422, error.code, error.message));
    }
    if (error instanceof CalendarError) return apiError(new HttpError(error.status, error.code, 'Reconnect Calendar or check its selected calendars. Availability has not been assumed free.'));
    return apiError(error);
  }
}
