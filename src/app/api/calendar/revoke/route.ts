import { revokeCalendar } from '@/features/calendar/oauth';
import { calendarActor, calendarRouteError, readCalendarForm } from '@/features/calendar/http';
import { disconnectProvider } from '@/features/calendar/provider-store';
import { setupReturnPath } from '@/features/identity/return-path';
import { CalendarError } from '@/features/calendar/errors';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const form = await readCalendarForm(request);
    const provider = form.get('provider') ?? 'google';
    if (!['google', 'outlook', 'apple'].includes(provider)) throw new CalendarError('INVALID_CALENDAR_PROVIDER', 422);
    let status = 'disconnected';
    if (provider === 'google') { const result = await revokeCalendar(userId); status = result.providerRevoked ? 'revoked' : 'locally-revoked'; }
    else await disconnectProvider(userId, provider as 'outlook' | 'apple');
    return Response.redirect(new URL(setupReturnPath(form.get('returnTo'), status), process.env.APP_BASE_URL?.trim() || request.url), 303);
  } catch (error) { return calendarRouteError(error); }
}
