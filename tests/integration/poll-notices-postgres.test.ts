import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { createSecret, digestSecret } from '@/features/identity/secrets';
import { castVote } from '@/features/polls/service';
import { processCompletionNotices } from '@/features/polls/notices';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/features/messaging/delivery', () => ({ sendPairedText: send }));

describe.skipIf(process.env.VENN_DATABASE_TESTS !== '1')('legacy completion notices with real Postgres', () => {
  let ownerId: string;
  let requestId: string;
  let slotId: string;
  let token: string;
  beforeEach(async () => {
    send.mockReset().mockResolvedValue(undefined);
    const db = getDb();
    ownerId = (await db.user.create({ data: { name: 'Notice integration owner' } })).id;
    const group = await db.group.create({ data: { name: 'Notice integration group', ownerId } });
    const start = Date.now() + 86_400_000;
    const request = await db.schedulingRequest.create({ data: {
      ownerId, groupId: group.id, requesterMemberId: 'friend', activity: 'lunch',
      localDate: new Date(start).toISOString().slice(0, 10), durationMinutes: 60, timezone: 'UTC',
      expiresAt: new Date(start + 86_400_000),
      participants: { create: [
        { participantId: 'organizer', userId: ownerId, displayName: 'Owner' },
        { participantId: 'friend', userId: `${ownerId}-friend`, displayName: 'Friend' },
      ] },
      slots: { create: [{ ordinal: 1, start: new Date(start), end: new Date(start + 3_600_000),
        freeIds: ['organizer', 'friend'], busyIds: [], unknownIds: [] }] },
    }, include: { slots: true } });
    requestId = request.id; slotId = request.slots[0].id; token = createSecret();
    await db.shareGrant.create({ data: { requestId, tokenDigest: digestSecret(token), expiresAt: new Date(start) } });
    await castVote(token, { slotId, slotVersion: 1, choice: 'works' }, { userId: ownerId });
    await castVote(token, { slotId, slotVersion: 1, choice: 'works' }, { userId: `${ownerId}-friend` });
  });
  afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
  afterAll(async () => { await getDb().$disconnect(); });

  it('consumes a notice created by actual votes exactly once across simultaneous maintenance workers', async () => {
    expect(await getDb().completionNotice.findUnique({ where: { requestId_slotVersion: { requestId, slotVersion: 1 } } }))
      .toMatchObject({ state: 'pending' });
    await Promise.all([processCompletionNotices(), processCompletionNotices(), processCompletionNotices()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ownerId, expect.stringContaining('2 of 2 members'));
    expect(await getDb().completionNotice.findUnique({ where: { requestId_slotVersion: { requestId, slotVersion: 1 } } }))
      .toMatchObject({ state: 'sent' });
    await processCompletionNotices();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('suppresses a queued old version without sending after options change', async () => {
    await getDb().schedulingRequest.update({ where: { id: requestId }, data: { slotVersion: 2 } });
    await processCompletionNotices();
    expect(send).not.toHaveBeenCalled();
    expect(await getDb().completionNotice.findUnique({ where: { requestId_slotVersion: { requestId, slotVersion: 1 } } }))
      .toMatchObject({ state: 'suppressed' });
  });
});
