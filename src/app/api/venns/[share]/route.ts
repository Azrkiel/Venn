import { after } from 'next/server';
import { cookies } from 'next/headers';
import { currentUserId } from '@/auth';
import { AVAILABILITY_COOKIE, getAvailabilityPoll } from '@/features/availability/service';
import { processAvailabilityNotices } from '@/features/availability/notices';
import { digestSecret } from '@/features/identity/secrets';
import { apiError, privateJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ share: string }> }) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    await consumeRateLimit(`venn-read:${ip}`, 180);
    const { share } = await context.params;
    const result = await getAvailabilityPoll(share, { guestKey: (await cookies()).get(AVAILABILITY_COOKIE)?.value,
      userId: await currentUserId() ?? undefined }, { names: new URL(request.url).searchParams.get('names') === '1' });
    if (result.closed) after(() => processAvailabilityNotices(new Date(), undefined, digestSecret(share)).then(() => undefined));
    return privateJson(result);
  } catch (error) { return apiError(error); }
}
