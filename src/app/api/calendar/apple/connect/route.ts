import { calendarActor, calendarRouteError, readCalendarForm } from '@/features/calendar/http';
import { connectApple } from '@/features/calendar/apple';
import { setupReturnPath } from '@/features/identity/return-path';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CalendarError } from '@/features/calendar/errors';
import { safeSharedReturnPath } from '@/features/identity/return-path';

export async function POST(request: Request) {
  let returnTo: string | undefined;
  try {
    const userId = await calendarActor(request);
    await consumeRateLimit(`apple-connect:${userId}`, 5, 600_000);
    const form = await readCalendarForm(request);
    returnTo = safeSharedReturnPath(form.get('returnTo'));
    await connectApple(userId, form.get('email')?.trim() ?? '', form.get('password')?.trim() ?? '');
    return Response.redirect(new URL(setupReturnPath(form.get('returnTo'), 'connected'), process.env.APP_BASE_URL?.trim() || request.url), 303);
  } catch (error) {
    if (error instanceof CalendarError && ['APPLE_APP_PASSWORD_REQUIRED', 'APPLE_CONNECTION_FAILED'].includes(error.code)) {
      return Response.redirect(new URL(setupReturnPath(returnTo, error.code === 'APPLE_APP_PASSWORD_REQUIRED' ? 'apple-password' : 'apple-failed'),
        process.env.APP_BASE_URL?.trim() || request.url), 303);
    }
    return calendarRouteError(error);
  }
}
