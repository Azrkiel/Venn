import { after } from 'next/server';
import { cookies } from 'next/headers';
import { currentUserId } from '@/auth';
import { availabilityInputSchema } from '@/features/availability/schema';
import { AVAILABILITY_COOKIE, saveAvailability } from '@/features/availability/service';
import { processAvailabilityNotices } from '@/features/availability/notices';
import { createSecret, digestSecret } from '@/features/identity/secrets';
import { apiError, appOrigin, privateJson, readJson, requireSameOrigin } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ share: string }> }) {
  try {
    requireSameOrigin(request);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    await consumeRateLimit(`venn-response:${ip}`, 30);
    const input = await readJson(request, availabilityInputSchema, 65_536);
    const cookieStore = await cookies();
    const previous = cookieStore.get(AVAILABILITY_COOKIE)?.value;
    const browserKey = request.headers.get('x-venn-guest-key');
    const guestKey = previous && /^[A-Za-z0-9_-]{43}$/.test(previous) ? previous
      : browserKey && /^[A-Za-z0-9_-]{43}$/.test(browserKey) ? browserKey : createSecret();
    const { share } = await context.params;
    // This callback may run after a rejected closed write, so a deadline gets processed on that path too.
    after(() => processAvailabilityNotices(new Date(), undefined, digestSecret(share)).then(() => undefined));
    const result = await saveAvailability(share, input, { guestKey, userId: await currentUserId() ?? undefined });
    cookieStore.set(AVAILABILITY_COOKIE, guestKey, { httpOnly: true, sameSite: 'lax',
      secure: new URL(appOrigin(request)).protocol === 'https:', path: '/', maxAge: 400 * 86_400 });
    return privateJson(result);
  } catch (error) { return apiError(error); }
}
