import { DateTime } from 'luxon';
import { userRoute } from '@/lib/route';
import { HttpError } from '@/lib/http';
import { getOwnerRequest } from '@/features/requests/service';
import { getUserAvailability } from '@/features/calendar/client';
import { renderOwnerCard } from '@/features/cards/render';

export const runtime = 'nodejs';
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => userRoute(request, async userId => {
  const result = await getOwnerRequest(userId, (await context.params).id);
  if (!['ready', 'selected', 'added'].includes(result.state)) throw new HttpError(409, 'STALE_OPTIONS', 'Check availability again before opening the card.');
  const day = DateTime.fromISO(result.localDate, { zone: result.timezone });
  const availability = await getUserAvailability(userId, { start: day.set({ hour: 9 }).toMillis(), end: day.set({ hour: 21 }).toMillis() });
  return renderOwnerCard(result, availability.state === 'known' ? availability.busy : null);
});
