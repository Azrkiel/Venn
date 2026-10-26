import { beginCalendarConnection } from '@/features/calendar/oauth';
import { calendarActor, calendarRouteError, readCalendarForm } from '@/features/calendar/http';
import { CalendarError } from '@/features/calendar/errors';
import { safeSharedReturnPath } from '@/features/identity/return-path';
import { beginOutlookConnection } from '@/features/calendar/outlook';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const form = await readCalendarForm(request);
    const purpose = form.get('purpose');
    const provider = form.get('provider') ?? 'google';
    if (!['google', 'outlook'].includes(provider) || provider !== 'google' && purpose === 'write') throw new CalendarError('INVALID_CALENDAR_PROVIDER', 422);
    const requestId = purpose === 'write' ? form.get('requestId') ?? '' : undefined;
    if (purpose === 'write' && (!requestId || requestId.length > 200)) throw new CalendarError('INVALID_EVENT_ACTION', 422);
    const returnTo = purpose === 'write' ? undefined : safeSharedReturnPath(form.get('returnTo'));
    return Response.redirect(provider === 'outlook' ? await beginOutlookConnection(userId, returnTo) : await beginCalendarConnection(userId, requestId, returnTo), 303);
  } catch (error) { return calendarRouteError(error); }
}
