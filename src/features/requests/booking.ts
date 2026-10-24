import type { Availability, Busy } from '@/features/scheduling/types';
import { HttpError } from '@/lib/http';

export type BookingContext = {
  ownerId: string; requestId: string; eventId: string; calendarId: string; slotId: string;
  start: number; end: number; timezone: string; summary: string; requiredUserIds: string[];
  reconcileFirst: boolean;
};
type Receipt = { id: string; calendarId: string; htmlLink?: string };
type BookingServices = {
  lookup: () => Promise<Receipt | null>;
  availability: (userId: string, window: Busy) => Promise<Availability>;
  insert: () => Promise<Receipt>;
};

export async function performBooking(context: BookingContext, services: BookingServices): Promise<Receipt> {
  if (context.reconcileFirst) {
    const existing = await services.lookup();
    if (existing) return existing;
  }
  const buffer = 15 * 60_000;
  const availability = await Promise.all([...new Set(context.requiredUserIds)].map(userId =>
    services.availability(userId, { start: context.start - buffer, end: context.end + buffer })));
  if (availability.some(member => member.state !== 'known')) {
    throw new HttpError(409, 'AVAILABILITY_UNKNOWN', 'A required calendar could not be checked. Reconnect and try again.');
  }
  if (availability.some(member => member.busy.some(busy =>
    context.start < busy.end + buffer && context.end > busy.start - buffer))) {
    throw new HttpError(409, 'NEW_CONFLICT', 'A calendar changed. Check for a new shared time before adding.');
  }
  return services.insert();
}
