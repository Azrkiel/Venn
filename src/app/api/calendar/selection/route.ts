import { selectCalendar } from '@/features/calendar/client';
import { CalendarError } from '@/features/calendar/errors';
import { calendarActor, calendarRouteError, readCalendarForm } from '@/features/calendar/http';
import { setupReturnPath } from '@/features/identity/return-path';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const form = await readCalendarForm(request);
    const calendarId = form.get('calendarId');
    const enabled = form.get('enabled');
    if (!calendarId || calendarId.length > 1024 || !['true', 'false'].includes(enabled ?? '')) throw new CalendarError('INVALID_CALENDAR_SELECTION', 422);
    await selectCalendar(userId, calendarId, enabled === 'true');
    return Response.redirect(new URL(setupReturnPath(form.get('returnTo'), 'updated'), process.env.APP_BASE_URL?.trim() || request.url), 303);
  } catch (error) { return calendarRouteError(error); }
}
