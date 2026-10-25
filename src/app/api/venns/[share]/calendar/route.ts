import { getCalendarReference } from '@/features/availability/calendar-reference';
import { privateJson } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { userRoute } from '@/lib/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (request: Request, context: { params: Promise<{ share: string }> }) => userRoute(request, async userId => {
  await consumeRateLimit(`venn-calendar:${userId}`, 20);
  const query = new URL(request.url).searchParams;
  const reference = await getCalendarReference(userId, (await context.params).share, { start: query.get('start'), end: query.get('end') });
  return privateJson(reference);
});
