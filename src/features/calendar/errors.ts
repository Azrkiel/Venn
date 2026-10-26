export class CalendarError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}

export function calendarErrorResponse(error: unknown): Response {
  const known = error instanceof CalendarError;
  return Response.json({ error: {
    code: known ? error.code : 'CALENDAR_UNAVAILABLE',
    message: known && error.code === 'CALENDAR_RECONNECT_REQUIRED'
      ? 'Reconnect your calendar to check your availability.'
      : known && error.code === 'APPLE_APP_PASSWORD_REQUIRED' ? 'Enter your Apple Account email and an app-specific password.'
      : known && error.code === 'APPLE_CONNECTION_FAILED' ? 'iCloud could not connect. Check your email and app-specific password, then try again.'
      : 'Calendar setup or a retry is needed. Your calendar has not been assumed free.',
  }, requestId: randomUUID() }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
import { randomUUID } from 'node:crypto';

