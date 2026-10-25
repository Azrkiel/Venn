import { beginCalendarConnection } from '@/features/calendar/oauth';
import { calendarActor, calendarRouteError, readCalendarForm } from '@/features/calendar/http';
import { CalendarError } from '@/features/calendar/errors';
import { safeSharedReturnPath } from '@/features/identity/return-path';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const form = await readCalendarForm(request);
    const purpose = form.get('purpose');
    const requestId = purpose === 'write' ? form.get('requestId') ?? '' : undefined;
    if (purpose === 'write' && (!requestId || requestId.length > 200)) throw new CalendarError('INVALID_EVENT_ACTION', 422);
    const returnTo = purpose === 'write' ? undefined : safeSharedReturnPath(form.get('returnTo'));
    return Response.redirect(await beginCalendarConnection(userId, requestId, returnTo), 303);
  } catch (error) { return calendarRouteError(error); }
}
