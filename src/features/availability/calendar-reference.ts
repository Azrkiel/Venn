import { z } from 'zod';
import { getCalendarStatus, getUserAvailability } from '@/features/calendar/client';
import { HttpError } from '@/lib/http';
import { getAvailabilityPoll } from './service';
import { windowBounds } from './schema';

export type CalendarReference = {
  state: 'disconnected' | 'reconnect' | 'no_calendars' | 'known' | 'unknown';
  busy: { start: string; end: string }[];
  checkedAt: string;
};

const referenceInput = z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).strict();
// Six local-calendar weeks can gain an hour (or two in some zones) when clocks fall back.
const MAX_WINDOW_MS = 42 * 86_400_000 + 2 * 3_600_000;

/** Private reference for the current viewer only; never part of a shared overlap response. */
export async function getCalendarReference(userId: string, share: string, input: unknown): Promise<CalendarReference> {
  if (!userId) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to see your own calendar while choosing availability.');
  const parsed = referenceInput.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_CALENDAR_WINDOW', 'Choose a valid calendar view of up to six weeks.');
  const from = Date.parse(parsed.data.start), to = Date.parse(parsed.data.end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > MAX_WINDOW_MS) {
    throw new HttpError(422, 'INVALID_CALENDAR_WINDOW', 'Choose a valid calendar view of up to six weeks.');
  }
  // Verifies the link is readable (including revocation/retention), without looking up any owner's grant.
  const poll = await getAvailabilityPoll(share);
  const bounds = windowBounds(poll);
  const window = { start: Math.max(from, bounds.start.toMillis()), end: Math.min(to, bounds.end.toMillis()) };
  if (window.start >= window.end) throw new HttpError(422, 'INVALID_CALENDAR_WINDOW', 'Choose dates within this Venn.');
  const result = (state: CalendarReference['state'], busy: CalendarReference['busy'] = []): CalendarReference =>
    ({ state, busy, checkedAt: new Date().toISOString() });
  try {
    const status = await getCalendarStatus(userId);
    if (status.state === 'disconnected' || status.state === 'reconnect') return result(status.state);
    if (status.state !== 'connected') return result('unknown');
    if (!status.calendars.some(calendar => calendar.enabled)) return result('no_calendars');
    const availability = await getUserAvailability(userId, window);
    if (availability.state !== 'known') return result('unknown');
    if (availability.busy.some(range => !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start >= range.end)) {
      return result('unknown');
    }
    const clipped = availability.busy.map(range => ({ start: Math.max(range.start, window.start), end: Math.min(range.end, window.end) }))
      .filter(range => range.start < range.end).sort((a, b) => a.start - b.start);
    const merged: typeof clipped = [];
    for (const range of clipped) {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    return result('known', merged.map(range => ({ start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() })));
  } catch {
    // Provider/database failures never turn the reference into a claim that the viewer is free.
    return result('unknown');
  }
}
