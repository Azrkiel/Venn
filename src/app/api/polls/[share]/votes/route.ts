import { cookies } from 'next/headers';
import { currentUserId } from '@/auth';
import { createSecret } from '@/features/identity/secrets';
import { castVote, voteInputSchema } from '@/features/polls/service';
import { apiError, privateJson, readJson, requireSameOrigin } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ share: string }> }) {
  try {
    requireSameOrigin(request);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    await consumeRateLimit(`public-poll-vote:${ip}`, 30);
    const input = await readJson(request, voteInputSchema);
    const cookieStore = await cookies();
    const previous = cookieStore.get('venn-poll-guest')?.value;
    const guestKey = previous && /^[A-Za-z0-9_-]{43}$/.test(previous) ? previous : createSecret();
    const userId = await currentUserId() ?? undefined;
    const result = await castVote((await context.params).share, input, { userId, guestKey, guestName: input.guestName });
    if (guestKey !== previous) {
      cookieStore.set('venn-poll-guest', guestKey, { httpOnly: true, sameSite: 'lax',
        secure: new URL(process.env.APP_BASE_URL ?? request.url).protocol === 'https:',
        path: '/api/polls', maxAge: 48 * 60 * 60 });
    }
    return privateJson(result);
  } catch (error) { return apiError(error); }
}
