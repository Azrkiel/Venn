import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertOpenShare, publicPoll, summarizePoll, voterIdentity, type PollSnapshot } from '@/features/polls/service';
import { digestSecret } from '@/features/identity/secrets';

const shareToken = 's'.repeat(43);
const now = new Date('2026-10-24T12:00:00Z');
const snapshot = (): PollSnapshot => ({
  id: 'request-private', ownerId: 'owner', requesterMemberId: 'm-sam',
  activity: 'lunch', localDate: '2026-10-25', timezone: 'America/New_York',
  state: 'ready', slotVersion: 1, expiresAt: new Date('2026-10-26T12:00:00Z'),
  participants: [
    { participantId: 'm-owner', userId: 'owner', displayName: 'Private Owner' },
    { participantId: 'm-sam', userId: 'sam', displayName: 'Private Sam' },
  ],
  slots: [
    { id: 'slot-1', ordinal: 1, start: new Date('2026-10-25T16:00:00Z'), end: new Date('2026-10-25T17:00:00Z'), freeIds: ['m-owner', 'm-sam'], busyIds: [], unknownIds: [] },
    { id: 'slot-2', ordinal: 2, start: new Date('2026-10-25T18:00:00Z'), end: new Date('2026-10-25T19:00:00Z'), freeIds: ['m-owner', 'm-sam'], busyIds: [], unknownIds: [] },
  ], votes: [],
});

describe('poll boundaries and summaries', () => {
  it('strips all identities, attendance IDs and private request identifiers from the public DTO', () => {
    const dto = publicPoll(snapshot());
    expect(dto).toMatchObject({ activity: 'lunch', localDate: '2026-10-25', timezone: 'America/New_York', slotVersion: 1,
      options: [{ id: 'slot-1', freeCount: 2, totalCount: 2 }, { id: 'slot-2', freeCount: 2, totalCount: 2 }] });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toMatch(/Private Owner|Private Sam|m-owner|m-sam|request-private|ownerId|userId|freeIds|busyIds|unknownIds|tokenDigest/);
  });
  it('rejects unknown, revoked, expired and cancelled share access', () => {
    expect(() => assertOpenShare(null, now)).toThrowError(expect.objectContaining({ status: 404 }));
    const grant = { expiresAt: new Date('2026-10-25T12:00:00Z'), revokedAt: null, request: snapshot() };
    expect(() => assertOpenShare({ ...grant, revokedAt: now }, now)).toThrowError(expect.objectContaining({ status: 410 }));
    expect(() => assertOpenShare({ ...grant, expiresAt: now }, now)).toThrowError(expect.objectContaining({ status: 410 }));
    expect(() => assertOpenShare({ ...grant, request: { ...snapshot(), state: 'cancelled' } }, now)).toThrowError(expect.objectContaining({ status: 410 }));
    expect(() => assertOpenShare({ ...grant, request: { ...snapshot(), state: 'retry_required' } }, now)).toThrowError(expect.objectContaining({ status: 410 }));
    expect(() => assertOpenShare({ ...grant, request: { ...snapshot(), expiresAt: now } }, now)).toThrowError(expect.objectContaining({ status: 410 }));
  });
  it('only treats an authenticated expected member as an identified voter', () => {
    expect(voterIdentity(snapshot(), { userId: 'sam' })).toEqual({ voterKey: 'member:sam', isGuest: false, guestName: null });
    const guest = voterIdentity(snapshot(), { userId: 'stranger', guestKey: 'g'.repeat(43), guestName: 'Private Sam' });
    expect(guest).toEqual({ voterKey: `guest:${digestSecret('g'.repeat(43))}`, isGuest: true, guestName: 'Private Sam' });
    expect(() => voterIdentity(snapshot(), { guestName: 'Private Sam' })).toThrowError(expect.objectContaining({ status: 401 }));
  });
  it('ignores untrusted claimed member votes and separates guest responses from roster completion', () => {
    const request = snapshot();
    request.votes = [
      { slotId: 'slot-1', voterKey: 'member:owner', isGuest: false, choice: 'works' },
      { slotId: 'slot-1', voterKey: 'member:stranger', isGuest: false, choice: 'works' },
      { slotId: 'slot-1', voterKey: 'guest:anything', isGuest: true, choice: 'works' },
    ];
    const summary = summarizePoll(request);
    expect(summary.options[0]).toMatchObject({ memberWorks: 1, memberCant: 0, guestWorks: 1, guestCant: 0 });
    expect(summary).toMatchObject({ complete: false, answeredMembers: 0, guestRespondents: 1, expectedMembers: 2 });
  });
  it('requires every member to answer every option and placeholders keep it incomplete', () => {
    const request = snapshot();
    request.votes = request.slots.flatMap(slot => ['owner','sam'].map(id => ({ slotId: slot.id,
      voterKey: `member:${id}`, isGuest: false, choice: 'works' })));
    expect(summarizePoll(request)).toMatchObject({ complete: true, answeredMembers: 2 });
    request.participants.push({ participantId: 'unjoined', userId: null, displayName: 'Unjoined person' });
    expect(summarizePoll(request)).toMatchObject({ complete: false, expectedMembers: 3, answeredMembers: 2 });
  });
  it('selects the most member-approved viable slot and never chooses a required-busy option', () => {
    const request = snapshot();
    request.votes = [
      { slotId: 'slot-1', voterKey: 'member:owner', isGuest: false, choice: 'works' },
      { slotId: 'slot-1', voterKey: 'member:sam', isGuest: false, choice: 'cant' },
      { slotId: 'slot-2', voterKey: 'member:owner', isGuest: false, choice: 'works' },
      { slotId: 'slot-2', voterKey: 'member:sam', isGuest: false, choice: 'works' },
    ];
    expect(summarizePoll(request).winningSlotId).toBe('slot-2');
    request.slots[1].freeIds = ['m-owner'];
    expect(summarizePoll(request).winningSlotId).toBe(null);
  });
  it('deduplicates updates to the same voter and option instead of double counting', () => {
    const request = snapshot();
    request.votes = [
      { slotId: 'slot-1', voterKey: 'member:owner', isGuest: false, choice: 'works' },
      { slotId: 'slot-1', voterKey: 'member:owner', isGuest: false, choice: 'cant' },
    ];
    expect(summarizePoll(request).options[0]).toMatchObject({ memberWorks: 0, memberCant: 1 });
  });
});

const { db } = vi.hoisted(() => ({ db: { shareGrant: { findUnique: vi.fn() }, vote: { upsert: vi.fn(), findMany: vi.fn() },
  completionNotice: { upsert: vi.fn() }, $transaction: vi.fn() } }));
vi.mock('@/lib/db', () => ({ getDb: () => db }));

describe('solo polls', () => {
  const soloSnapshot = (): PollSnapshot => ({ ...snapshot(), requesterMemberId: null,
    participants: [{ participantId: 'self', userId: 'owner', displayName: 'You' }],
    slots: snapshot().slots.map(slot => ({ ...slot, freeIds: ['self'] })) });
  it('summarizes without throwing and never completes or picks a winner', () => {
    const request = soloSnapshot();
    request.votes = request.slots.map(slot => ({ slotId: slot.id, voterKey: 'member:owner', isGuest: false, choice: 'works' }));
    request.votes.push({ slotId: 'slot-1', voterKey: 'guest:abc', isGuest: true, choice: 'works' });
    const dto = publicPoll(request);
    expect(dto).toMatchObject({ complete: false, winningSlotId: null, guestRespondents: 1 });
    expect(dto.options[0]).toMatchObject({ freeCount: 1, totalCount: 1, guestWorks: 1 });
  });
});

describe('poll persistence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const request = snapshot(); request.expiresAt = new Date(Date.now() + 3_600_000);
    db.shareGrant.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, request });
    db.vote.upsert.mockResolvedValue({}); db.vote.findMany.mockResolvedValue([]); db.completionNotice.upsert.mockResolvedValue({});
    db.$transaction.mockImplementation(async (callback: (value: typeof db) => Promise<unknown>) => callback(db));
  });
  it('loads a grant by digest without querying on a raw shared token', async () => {
    const { getPublicPoll } = await import('@/features/polls/service');
    await getPublicPoll(shareToken);
    expect(db.shareGrant.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenDigest: digestSecret(shareToken) } }));
  });
  it('upserts one unique member vote under a serializable transaction', async () => {
    const { castVote } = await import('@/features/polls/service');
    await castVote(shareToken, { slotId: 'slot-1', choice: 'works', slotVersion: 1 }, { userId: 'sam' });
    expect(db.vote.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId_voterKey_slotId: { requestId: 'request-private', voterKey: 'member:sam', slotId: 'slot-1' } },
      update: { choice: 'works', isGuest: false, guestName: null },
    }));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('rejects stale versions and a slot from a different request before writing', async () => {
    const { castVote } = await import('@/features/polls/service');
    await expect(castVote(shareToken, { slotId: 'slot-1', choice: 'works', slotVersion: 2 }, { userId: 'sam' }))
      .rejects.toMatchObject({ status: 409, code: 'STALE_OPTIONS' });
    await expect(castVote(shareToken, { slotId: 'other-request-slot', choice: 'works', slotVersion: 1 }, { userId: 'sam' }))
      .rejects.toMatchObject({ status: 422, code: 'INVALID_SLOT' });
    expect(db.vote.upsert).not.toHaveBeenCalled();
  });
  it('records one unique completion transition only when every member answered every option', async () => {
    const { castVote } = await import('@/features/polls/service');
    db.vote.findMany.mockResolvedValue(snapshot().slots.flatMap(slot => ['owner','sam'].map(id => ({
      slotId: slot.id, voterKey: `member:${id}`, isGuest: false, choice: 'works',
    }))));
    await castVote(shareToken, { slotId: 'slot-1', choice: 'works', slotVersion: 1 }, { userId: 'sam' });
    expect(db.completionNotice.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId_slotVersion: { requestId: 'request-private', slotVersion: 1 } }, update: {},
    }));
  });
  it('rejects an identity smuggled through vote JSON before any write', async () => {
    const { castVote } = await import('@/features/polls/service');
    const malicious = { slotId: 'slot-1', choice: 'works' as const, slotVersion: 1, userId: 'owner' };
    await expect(castVote(shareToken, malicious, { guestKey: 'g'.repeat(43) }))
      .rejects.toMatchObject({ status: 422, code: 'INVALID_VOTE' });
    expect(db.vote.upsert).not.toHaveBeenCalled();
  });
  it('retries serialization conflicts without treating them as extra votes', async () => {
    const { castVote } = await import('@/features/polls/service');
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await castVote(shareToken, { slotId: 'slot-1', choice: 'cant', slotVersion: 1 }, { userId: 'sam' });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.vote.upsert).toHaveBeenCalledTimes(1);
  });
});
