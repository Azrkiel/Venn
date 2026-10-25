import { beforeEach, describe, expect, it, vi } from 'vitest';
import { digestSecret } from '@/features/identity/secrets';
import { createAvailabilityPoll, getAvailabilityPoll, saveAvailability, closeAvailabilityPoll } from '@/features/availability/service';

const { db } = vi.hoisted(() => ({ db: {
  availabilityPoll: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  availabilityResponse: { upsert: vi.fn(), findMany: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock('@/lib/db', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/db')>(), getDb: () => db }));
vi.mock('@/features/availability/notices', () => ({ processAvailabilityNotices: vi.fn().mockResolvedValue({ processed: 0 }) }));
const token = 's'.repeat(43);
const key = 'g'.repeat(43);
const input = { activity: 'Beach', timezone: 'America/New_York', scale: 'month' as const,
  startDate: '2030-06-01', endDate: '2030-06-30', closesAt: '2030-05-31T12:00:00Z' };
const response = { name: 'Sam', ranges: [{ start: '2030-06-10', end: '2030-06-12' }] };
function poll() {
  return { id: 'private-poll-id', ownerId: 'private-owner', ...input, closesAt: new Date(input.closesAt),
    expiresAt: new Date('2030-07-01T12:00:00Z'), closedAt: null, revokedAt: null,
    noticeState: 'pending', revision: 0, tokenDigest: digestSecret(token), createdAt: new Date(), responses: [] as {
      voterKey: string; name: string; ranges: { start: string; end: string }[];
    }[] };
}

describe('availability persistence and privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.availabilityPoll.findUnique.mockResolvedValue(poll());
    db.availabilityPoll.create.mockImplementation(async ({ data }) => ({ ...poll(), ...data, responses: [] }));
    db.availabilityPoll.updateMany.mockResolvedValue({ count: 1 });
    db.availabilityResponse.upsert.mockResolvedValue({});
    db.availabilityResponse.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db));
  });
  it('creates a distinct random link and persists only its digest, retaining results beyond closure', async () => {
    const result = await createAvailabilityPoll('private-owner', input);
    const raw = result.path.split('/').at(-1)!;
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const data = db.availabilityPoll.create.mock.calls[0][0].data;
    expect(data.tokenDigest).toBe(digestSecret(raw));
    expect(JSON.stringify(data)).not.toContain(raw);
    expect(data.expiresAt.getTime() - data.closesAt.getTime()).toBe(30 * 86_400_000);
    expect(result.poll).toMatchObject({ activity: 'Beach', respondentCount: 0, ownResponse: null });
  });
  it('rejects past deadlines and deadlines beyond the planning span', async () => {
    await expect(createAvailabilityPoll('owner', { ...input, closesAt: '2000-01-01T00:00:00Z' })).rejects.toMatchObject({ status: 422 });
    await expect(createAvailabilityPoll('owner', { ...input, closesAt: '2031-01-01T00:00:00Z' })).rejects.toMatchObject({ status: 422 });
    expect(db.availabilityPoll.create).not.toHaveBeenCalled();
  });
  it('upserts by browser digest under a serializable transaction and never trusts a claimed name as identity', async () => {
    await saveAvailability(token, response, { guestKey: key });
    expect(db.availabilityResponse.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { pollId_voterKey: { pollId: 'private-poll-id', voterKey: `guest:${digestSecret(key)}` } },
      update: { name: 'Sam', ranges: response.ranges },
    }));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(db.availabilityPoll.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revision: { increment: 1 } } }));
    expect(db.availabilityPoll.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenDigest: digestSecret(token) } }));
  });
  it('rejects ranges outside the window, missing browser identity and input identity injection', async () => {
    await expect(saveAvailability(token, { ...response, ranges: [{ start: '2030-05-31', end: '2030-06-01' }] }, { guestKey: key }))
      .rejects.toMatchObject({ status: 422 });
    await expect(saveAvailability(token, response, {})).rejects.toMatchObject({ status: 401 });
    await expect(saveAvailability(token, { ...response, ownerId: 'private-owner' }, { guestKey: key })).rejects.toMatchObject({ status: 422 });
    expect(db.availabilityResponse.upsert).not.toHaveBeenCalled();
  });
  it('unlocks optional names only after saving an answer, without leaking anyone else\'s ranges or identifiers', async () => {
    const saved = poll();
    saved.responses = [{ ...response, voterKey: `guest:${digestSecret(key)}` },
      { name: 'Alex', voterKey: 'private-other-key', ranges: [{ start: '2030-06-10', end: '2030-06-11' }] }];
    db.availabilityPoll.findUnique.mockResolvedValue(saved);
    const stranger = await getAvailabilityPoll(token, {}, { names: true });
    expect(stranger.names).toBeUndefined(); expect(stranger.ownResponse).toBeNull();
    const own = await getAvailabilityPoll(token, { guestKey: key }, { names: true });
    expect(own.names).toEqual(['Sam', 'Alex']); expect(own.ownResponse).toEqual(response);
    expect(own.respondentCount).toBe(2);
    expect(JSON.stringify(own)).not.toMatch(/private-other-key|private-owner|private-poll-id|tokenDigest|voterKey/);
    expect((await getAvailabilityPoll(token, { guestKey: key })).names).toBeUndefined();
  });
  it('allows closed reads but rejects closed edits, revoked links and expired retained results', async () => {
    db.availabilityPoll.findUnique.mockResolvedValue({ ...poll(), closedAt: new Date() });
    expect((await getAvailabilityPoll(token)).closed).toBe(true);
    await expect(saveAvailability(token, response, { guestKey: key })).rejects.toMatchObject({ status: 410 });
    db.availabilityPoll.findUnique.mockResolvedValue({ ...poll(), closesAt: new Date(0) });
    await expect(saveAvailability(token, response, { guestKey: key })).rejects.toMatchObject({ status: 410 });
    db.availabilityPoll.findUnique.mockResolvedValue({ ...poll(), revokedAt: new Date() });
    await expect(getAvailabilityPoll(token)).rejects.toMatchObject({ status: 410 });
    db.availabilityPoll.findUnique.mockResolvedValue({ ...poll(), expiresAt: new Date(0) });
    await expect(getAvailabilityPoll(token)).rejects.toMatchObject({ status: 410 });
  });
  it('keeps early close owner-only and shortens retention without deleting results immediately', async () => {
    await expect(closeAvailabilityPoll('stranger', token)).rejects.toMatchObject({ status: 404 });
    expect(db.availabilityPoll.updateMany).not.toHaveBeenCalled();
    await closeAvailabilityPoll('private-owner', token);
    const data = db.availabilityPoll.updateMany.mock.calls[0][0].data;
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime() - data.closedAt.getTime()).toBe(30 * 86_400_000);
  });
  it('retries a serialization conflict but gives a bounded conflict after three attempts', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await saveAvailability(token, response, { guestKey: key });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(saveAvailability(token, response, { guestKey: key })).rejects.toMatchObject({ status: 409 });
  });
});
