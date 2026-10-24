import { revokeCalendar } from '@/features/calendar/oauth';
import { calendarActor, calendarRouteError, setupRedirect } from '@/features/calendar/http';

export async function POST(request: Request) {
  try {
    const userId = await calendarActor(request);
    const result = await revokeCalendar(userId);
    return setupRedirect(request, result.providerRevoked ? 'revoked' : 'locally-revoked');
  } catch (error) { return calendarRouteError(error); }
}
