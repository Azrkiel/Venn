import { currentUserId, loginConfigured } from '@/auth';
import { getCalendarStatus } from '@/features/calendar/client';
import { privateJson } from '@/lib/http';
import { calendarRouteError } from '@/features/calendar/http';

export async function GET() {
  try {
    if (!loginConfigured()) return privateJson({ configured: false, signedIn: false, calendar: { state: 'disconnected', calendars: [] } });
    const userId = await currentUserId();
    if (!userId) return privateJson({ configured: true, signedIn: false });
    return privateJson({ configured: true, signedIn: true, calendar: await getCalendarStatus(userId) });
  } catch (error) { return calendarRouteError(error); }
}
