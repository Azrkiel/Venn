import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processCompletionNotices } from '@/features/polls/notices';
import { HttpError } from '@/lib/http';

const { db, send } = vi.hoisted(() => ({ db: { completionNotice: {
  findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(),
} }, send: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => db }));
vi.mock('@/features/messaging/delivery', () => ({ sendPairedText: send }));

const now = new Date('2030-05-01T00:00:00Z');
const future = new Date('2030-05-03T00:00:00Z');
const saved = () => ({ id: 'notice', requestId: 'request', slotVersion: 1, state: 'sending', request: {
  id: 'request', ownerId: 'owner', requesterMemberId: 'friend' as string | null, activity: 'lunch', localDate: '2030-05-02',
  timezone: 'America/New_York', state: 'ready', slotVersion: 1, expiresAt: future,
  shares: [{ expiresAt: future, revokedAt: null as Date | null }],
  participants: [{ participantId: 'organizer', userId: 'owner', displayName: 'Private Owner' },
    { participantId: 'friend', userId: 'friend-user', displayName: 'Private Friend' }],
  slots: [{ id: 'slot', ordinal: 1, start: new Date('2030-05-02T16:00:00Z'), end: new Date('2030-05-02T17:00:00Z'),
    freeIds: ['organizer', 'friend'], busyIds: [], unknownIds: [] }],
  votes: ['owner', 'friend-user'].map(id => ({ slotId: 'slot', voterKey: `member:${id}`, isGuest: false, choice: 'works' })),
} });

describe('legacy option-poll completion notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.completionNotice.findMany.mockResolvedValue([{ id: 'notice' }]);
    db.completionNotice.findUnique.mockResolvedValue(saved());
    let claimed = false;
    db.completionNotice.updateMany.mockImplementation(async ({ data }) => {
      if (data.state === 'sending') { if (claimed) return { count: 0 }; claimed = true; }
      return { count: 1 };
    });
    send.mockResolvedValue(undefined);
  });

  it('claims once across concurrent consumers and sends only the organizer a non-booking summary', async () => {
    const results = await Promise.all([processCompletionNotices(now), processCompletionNotices(now)]);
    expect(results.reduce((sum, result) => sum + result.processed, 0)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('owner', expect.stringContaining('2 of 2 members'));
    expect(send.mock.calls[0][1]).toContain('Nothing has been booked');
    expect(send.mock.calls[0][1]).not.toMatch(/Private Owner|Private Friend|friend-user|tokenDigest/);
    expect(db.completionNotice.updateMany).toHaveBeenCalledWith({ where: { id: 'notice', state: 'pending' }, data: { state: 'sending' } });
    expect(db.completionNotice.updateMany).toHaveBeenCalledWith({ where: { id: 'notice', state: 'sending' }, data: { state: 'sent' } });
  });

  it('does not retry a claimed or ambiguous send', async () => {
    send.mockRejectedValue(new Error('private provider payload'));
    await processCompletionNotices(now);
    await processCompletionNotices(now);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.completionNotice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'uncertain' } }));
  });

  it('records an unpaired organizer without failing maintenance', async () => {
    send.mockRejectedValue(new HttpError(409, 'PHONE_NOT_PAIRED', 'Pair phone'));
    await expect(processCompletionNotices(now)).resolves.toEqual({ processed: 1 });
    expect(db.completionNotice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'unpaired' } }));
  });

  it.each(['expired', 'revoked', 'expired-share', 'stale', 'cancelled', 'incomplete', 'solo', 'past-option', 'invalid-zone', 'missing'])('suppresses a %s poll after claim without sending', async reason => {
    const notice = saved();
    if (reason === 'expired') notice.request.expiresAt = now;
    if (reason === 'revoked') notice.request.shares[0].revokedAt = now;
    if (reason === 'expired-share') notice.request.shares[0].expiresAt = now;
    if (reason === 'stale') notice.request.slotVersion = 2;
    if (reason === 'cancelled') notice.request.state = 'cancelled';
    if (reason === 'incomplete') notice.request.votes.pop();
    if (reason === 'solo') notice.request.requesterMemberId = null;
    if (reason === 'past-option') notice.request.slots[0].start = new Date('2030-04-30T16:00:00Z');
    if (reason === 'invalid-zone') notice.request.timezone = 'not/a/zone';
    db.completionNotice.findUnique.mockResolvedValue(reason === 'missing' ? null : notice);
    await processCompletionNotices(now);
    expect(send).not.toHaveBeenCalled();
    expect(db.completionNotice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'suppressed' } }));
  });

  it('reports completed answers without inventing a winner when no option works for required members', async () => {
    const notice = saved();
    notice.request.votes[1].choice = 'cant';
    db.completionNotice.findUnique.mockResolvedValue(notice);
    await processCompletionNotices(now);
    expect(send).toHaveBeenCalledWith('owner', expect.stringContaining('no shared option'));
  });

  it('queries bounded pending notices only for active requests with at least one valid share', async () => {
    await processCompletionNotices(now);
    expect(db.completionNotice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20, where: { state: 'pending', request: {
        state: { in: ['ready', 'selected'] }, expiresAt: { gt: now },
        shares: { some: { revokedAt: null, expiresAt: { gt: now } } },
      } },
    }));
  });
});
