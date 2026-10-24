import { describe, expect, it, vi } from 'vitest';
import { performBooking, type BookingContext } from '@/features/requests/booking';

const hour = (n: number) => n * 3_600_000;
const context: BookingContext = { ownerId: 'owner', requestId: 'request', eventId: 'v12345', calendarId: 'primary',
  slotId: 'slot', start: hour(12), end: hour(13), timezone: 'America/New_York', summary: 'Lunch',
  requiredUserIds: ['owner', 'sam'], reconcileFirst: false };
const deps = () => ({ lookup: vi.fn(async () => null as { id: string; calendarId: string } | null),
  availability: vi.fn(async (userId: string) => ({ memberId: userId, state: 'known' as 'known' | 'unknown', busy: [] as { start: number; end: number }[] })),
  insert: vi.fn(async () => ({ id: context.eventId, calendarId: 'primary' })) });

describe('explicit calendar booking', () => {
  it('does not insert when a required calendar is unknown', async () => {
    const services = deps(); services.availability.mockResolvedValue({ memberId: 'sam', state: 'unknown', busy: [] });
    await expect(performBooking(context, services)).rejects.toMatchObject({ code: 'AVAILABILITY_UNKNOWN' });
    expect(services.insert).not.toHaveBeenCalled();
  });
  it('rechecks new conflicts before inserting', async () => {
    const services = deps(); services.availability.mockResolvedValue({ memberId: 'sam', state: 'known', busy: [{ start: hour(12), end: hour(13) }] });
    await expect(performBooking(context, services)).rejects.toMatchObject({ code: 'NEW_CONFLICT' });
    expect(services.insert).not.toHaveBeenCalled();
  });
  it('permits the exact buffer gap', async () => {
    const services = deps(); services.availability.mockResolvedValue({ memberId: 'sam', state: 'known', busy: [{ start: hour(11), end: hour(11.75) }] });
    await expect(performBooking(context, services)).resolves.toMatchObject({ id: context.eventId });
    expect(services.insert).toHaveBeenCalledOnce();
  });
  it('reconciles an uncertain existing event before checking its own busy block', async () => {
    const services = deps(); services.lookup.mockResolvedValue({ id: context.eventId, calendarId: 'primary' });
    await expect(performBooking({ ...context, reconcileFirst: true }, services)).resolves.toMatchObject({ id: context.eventId });
    expect(services.availability).not.toHaveBeenCalled();
    expect(services.insert).not.toHaveBeenCalled();
  });
  it('checks availability again before inserting when a retry finds no event', async () => {
    const services = deps();
    await performBooking({ ...context, reconcileFirst: true }, services);
    expect(services.lookup).toHaveBeenCalledOnce();
    expect(services.availability).toHaveBeenCalledTimes(2);
    expect(services.insert).toHaveBeenCalledOnce();
  });
});
