import { cookies } from 'next/headers';
import { AVAILABILITY_COOKIE, getAvailabilityPicture } from '@/features/availability/service';
import { apiError } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ share: string; picture: string }> }) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    await consumeRateLimit(`venn-picture:${ip}`, 360);
    const { share, picture } = await context.params;
    const photo = await getAvailabilityPicture(share, picture, { guestKey: (await cookies()).get(AVAILABILITY_COOKIE)?.value });
    return new Response(new Uint8Array(photo), { headers: { 'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return apiError(error); }
}
