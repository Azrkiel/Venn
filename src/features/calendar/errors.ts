export class CalendarError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}

export function calendarErrorResponse(error: unknown): Response {
  const known = error instanceof CalendarError;
  return Response.json({ error: {
    code: known ? error.code : 'CALENDAR_UNAVAILABLE',
    message: known && error.code === 'CALENDAR_RECONNECT_REQUIRED'
      ? 'Reconnect Google Calendar to check your availability.'
      : 'Calendar setup or a retry is needed. Your calendar has not been assumed free.',
  }, requestId: randomUUID() }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
import { randomUUID } from 'node:crypto';

