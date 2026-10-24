import { selectCalendar } from '@/features/calendar/client';
import { CalendarError } from '@/features/calendar/errors';
import { calendarActor, calendarRouteError, readCalendarForm, setupRedirect } from '@/features/calendar/http';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const form = await readCalendarForm(request);
    const calendarId = form.get('calendarId');
    const enabled = form.get('enabled');
    if (!calendarId || calendarId.length > 1024 || !['true', 'false'].includes(enabled ?? '')) throw new CalendarError('INVALID_CALENDAR_SELECTION', 422);
    await selectCalendar(userId, calendarId, enabled === 'true');
    return setupRedirect(request, 'updated');
  } catch (error) { return calendarRouteError(error); }
}
