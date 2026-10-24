import { getPublicPoll } from '@/features/polls/service';
import { apiError, privateJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ share: string }> }) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    await consumeRateLimit(`public-poll-read:${ip}`, 180);
    return privateJson(await getPublicPoll((await context.params).share));
  } catch (error) { return apiError(error); }
}
