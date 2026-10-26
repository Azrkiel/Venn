import { selectCalendar } from '@/features/calendar/client';
import { CalendarError } from '@/features/calendar/errors';
import { calendarActor, calendarRouteError, readCalendarForm } from '@/features/calendar/http';
import { setupReturnPath } from '@/features/identity/return-path';
import { selectProviderCalendar } from '@/features/calendar/provider-store';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const form = await readCalendarForm(request);
    const calendarId = form.get('calendarId');
    const enabled = form.get('enabled');
    const provider = form.get('provider') ?? 'google';
    if (!['google', 'outlook', 'apple'].includes(provider)) throw new CalendarError('INVALID_CALENDAR_PROVIDER', 422);
    if (!calendarId || calendarId.length > 1024 || !['true', 'false'].includes(enabled ?? '')) throw new CalendarError('INVALID_CALENDAR_SELECTION', 422);
    if (provider === 'outlook' || provider === 'apple') await selectProviderCalendar(userId, provider, calendarId, enabled === 'true');
    else await selectCalendar(userId, calendarId, enabled === 'true');
    return Response.redirect(new URL(setupReturnPath(form.get('returnTo'), 'updated'), process.env.APP_BASE_URL?.trim() || request.url), 303);
  } catch (error) { return calendarRouteError(error); }
}
