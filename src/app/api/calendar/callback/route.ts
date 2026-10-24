import { currentUserId } from '@/auth';
import { consumeOAuthState, finishCalendarConnection } from '@/features/calendar/oauth';
import { CalendarError } from '@/features/calendar/errors';
import { calendarRouteError, setupRedirect } from '@/features/calendar/http';

function returnToSelectedRequest(request: Request, requestId: string, state: 'write-granted' | 'write-declined') {
  const destination = new URL('/live', process.env.APP_BASE_URL?.trim() || request.url);
  destination.searchParams.set('request', requestId);
  destination.searchParams.set('calendar', state);
  return Response.redirect(destination, 303);
}

export async function GET(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) throw new CalendarError('SIGN_IN_REQUIRED', 401);
    const params = new URL(request.url).searchParams;
    const state = params.get('state') ?? '';
    if (params.has('error')) {
      const saved = await consumeOAuthState(userId, state);
      if (saved.purpose === 'write' && saved.requestId) return returnToSelectedRequest(request, saved.requestId, 'write-declined');
      return setupRedirect(request, 'declined');
    }
    const result = await finishCalendarConnection(userId, params.get('code') ?? '', state);
    if (result.requestId) return returnToSelectedRequest(request, result.requestId, result.writeGranted ? 'write-granted' : 'write-declined');
    return setupRedirect(request, 'connected');
  } catch (error) { return calendarRouteError(error); }
}
