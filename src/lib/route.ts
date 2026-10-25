import { currentUserId, loginConfigured } from '@/auth';
import { CalendarError } from '@/features/calendar/errors';
import { IntentParseError } from '@/features/scheduling/intent';
import { WindowError } from '@/features/scheduling/windows';
import { apiError, HttpError, requireSameOrigin } from './http';

export async function requireUser(): Promise<string> {
  if (!loginConfigured()) throw new HttpError(503, 'SETUP_REQUIRED', 'Connect Venn’s services on the setup page first.');
  const id = await currentUserId();
  if (!id) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in with Google first.');
  return id;
}

export async function userRoute(request: Request, action: (userId: string) => Promise<Response>): Promise<Response> {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) requireSameOrigin(request);
    return await action(await requireUser());
  } catch (error) {
    if (error instanceof CalendarError) return apiError(new HttpError(error.status, error.code, 'Check your Calendar connection and selected calendars, then try again.'));
    if (error instanceof IntentParseError) return apiError(new HttpError(error.code === 'MODEL_NOT_CONFIGURED' ? 503 : error.code === 'MODEL_BUSY' ? 429 : 422, error.code, error.message));
    if (error instanceof WindowError) return apiError(new HttpError(422, error.code, error.message));
    return apiError(error);
  }
}
