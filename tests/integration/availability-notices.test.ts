import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processAvailabilityNotices } from '@/features/availability/notices';
import { HttpError } from '@/lib/http';

const { db, send } = vi.hoisted(() => ({ db: { availabilityPoll: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() } }, send: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => db }));
vi.mock('@/features/messaging/delivery', () => ({ sendPairedText: send }));

const now = new Date('2030-05-01T00:00:00Z');
const saved = () => ({ id: 'poll', ownerId: 'owner', activity: 'Beach', timezone: 'UTC', scale: 'month' as const,
  startDate: '2030-06-01', endDate: '2030-06-30', closesAt: now, closedAt: null, expiresAt: new Date('2030-06-01'),
  responses: [{ name: 'Sam', ranges: [{ start: '2030-06-10', end: '2030-06-12' }] }, { name: 'Alex', ranges: [] }] });

describe('availability closure notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.availabilityPoll.findMany.mockResolvedValue([{ id: 'poll' }]);
    db.availabilityPoll.findUnique.mockResolvedValue(saved());
    let claimed = false;
    db.availabilityPoll.updateMany.mockImplementation(async ({ data }) => {
      if (data.noticeState === 'sending') { if (claimed) return { count: 0 }; claimed = true; }
      return { count: 1 };
    });
    send.mockResolvedValue(undefined);
  });
  it('atomically claims once under concurrent consumers and reports respondents rather than invented invitees', async () => {
    await Promise.all([processAvailabilityNotices(now), processAvailabilityNotices(now)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('owner', expect.stringContaining('1 of 2 respondents'));
    expect(send.mock.calls[0][1]).not.toMatch(/Sam|Alex|everyone|all invitees/);
    expect(db.availabilityPoll.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'poll', noticeState: 'pending' }), data: { noticeState: 'sending', revision: { increment: 1 } },
    }));
    expect(db.availabilityPoll.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { noticeState: 'sent' } }));
  });
  it('marks ambiguous delivery terminally uncertain instead of retrying a possible duplicate', async () => {
    send.mockRejectedValue(new Error('private provider payload'));
    await processAvailabilityNotices(now);
    expect(db.availabilityPoll.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { noticeState: 'uncertain' } }));
  });
  it('records an unpaired organizer without making that a public poll failure', async () => {
    send.mockRejectedValue(new HttpError(409, 'PHONE_NOT_PAIRED', 'Pair phone'));
    await expect(processAvailabilityNotices(now)).resolves.toEqual({ processed: 1 });
    expect(db.availabilityPoll.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { noticeState: 'unpaired' } }));
  });
  it('does not claim revoked or expired polls and limits each maintenance batch', async () => {
    await processAvailabilityNotices(now);
    expect(db.availabilityPoll.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ revokedAt: null, expiresAt: { gt: now }, noticeState: 'pending' }), take: 20,
    }));
  });
  it('includes both dates when a timed overlap crosses midnight', async () => {
    db.availabilityPoll.findUnique.mockResolvedValue({ ...saved(), scale: 'week', endDate: '2030-06-07',
      responses: [{ name: 'Sam', ranges: [{ start: '2030-06-03T23:00:00Z', end: '2030-06-04T01:00:00Z' }] }] });
    await processAvailabilityNotices(now);
    expect(send.mock.calls[0][1]).toContain('Jun 4');
  });
});
