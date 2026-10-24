import { currentUserId, loginConfigured } from '@/auth';
import { HttpError, apiError, requireSameOrigin } from '@/lib/http';
import { CalendarError, calendarErrorResponse } from './errors';

export async function calendarActor(request: Request): Promise<string> {
  requireSameOrigin(request);
  if (!loginConfigured()) throw new CalendarError('AUTH_NOT_CONFIGURED');
  const userId = await currentUserId();
  if (!userId) throw new CalendarError('SIGN_IN_REQUIRED', 401);
  return userId;
}

export async function readCalendarForm(request: Request): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    throw new HttpError(415, 'FORM_REQUIRED', 'Open Venn setup and try again.');
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', 'This setup request is too large.'); }
    chunks.push(next.value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function calendarRouteError(error: unknown) {
  return error instanceof CalendarError ? calendarErrorResponse(error) : apiError(error);
}

export function setupRedirect(request: Request, state: string, requestId?: string) {
  const destination = new URL('/setup', process.env.APP_BASE_URL?.trim() || request.url);
  destination.searchParams.set('calendar', state);
  if (requestId) destination.searchParams.set('request', requestId);
  return Response.redirect(destination, 303);
}
