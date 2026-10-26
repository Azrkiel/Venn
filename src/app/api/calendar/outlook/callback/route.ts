import { currentUserId } from '@/auth';
import { consumeOAuthState } from '@/features/calendar/oauth';
import { finishOutlookConnection } from '@/features/calendar/outlook';
import { CalendarError } from '@/features/calendar/errors';
import { calendarRouteError } from '@/features/calendar/http';
import { setupReturnPath } from '@/features/identity/return-path';

export async function GET(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) throw new CalendarError('SIGN_IN_REQUIRED', 401);
    const params = new URL(request.url).searchParams;
    const state = params.get('state') ?? '';
    let returnTo: string | undefined;
    if (params.has('error')) {
      const saved = await consumeOAuthState(userId, state);
      if (saved.purpose !== 'outlook') throw new CalendarError('INVALID_CALENDAR_STATE', 400);
      returnTo = saved.returnTo;
    } else returnTo = await finishOutlookConnection(userId, params.get('code') ?? '', state);
    return Response.redirect(new URL(setupReturnPath(returnTo, params.has('error') ? 'declined' : 'connected'), process.env.APP_BASE_URL?.trim() || request.url), 303);
  } catch (error) { return calendarRouteError(error); }
}
