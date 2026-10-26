import { beforeEach, describe, expect, it, vi } from 'vitest';
import { digestSecret } from '@/features/identity/secrets';
import { getAvailabilityPicture, getAvailabilityPoll, saveAvailability } from '@/features/availability/service';

const { db } = vi.hoisted(() => ({ db: {
  availabilityPoll: { findUnique: vi.fn(), updateMany: vi.fn() },
  availabilityResponse: { upsert: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock('@/lib/db', () => ({ getDb: () => db, isPrismaError: (error: { code?: string }, code: string) => error?.code === code }));
const share = 's'.repeat(43), ownKey = 'a'.repeat(43), otherKey = 'b'.repeat(43), photoKey = 'p'.repeat(43);
const answer = { name: 'Sam', ranges: [] };
const response = (key = ownKey) => ({ ...answer, voterKey: `guest:${digestSecret(key)}`, avatarId: null as string | null, photoKey: photoKey as string | null });
const savedPoll = () => ({ id: 'poll', ownerId: 'private-owner', activity: 'Lunch', timezone: 'UTC', scale: 'day',
  startDate: '2030-01-01', endDate: '2030-01-01', closesAt: new Date('2030-01-01'), closedAt: null,
  expiresAt: new Date('2031-01-01'), revokedAt: null, tokenDigest: digestSecret(share), responses: [response()] });

describe('respondent picture privacy and persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.availabilityPoll.findUnique.mockResolvedValue(savedPoll());
    db.availabilityPoll.updateMany.mockResolvedValue({ count: 1 });
    db.availabilityResponse.findMany.mockResolvedValue([response()]);
    db.availabilityResponse.upsert.mockResolvedValue({});
    db.availabilityResponse.findFirst.mockResolvedValue({ photo: new Uint8Array([255, 216, 255, 217]) });
    db.$transaction.mockImplementation(async callback => callback(db));
  });
  it('keeps picture metadata private until a saved respondent explicitly asks for names', async () => {
    const stranger = await getAvailabilityPoll(share, {}, { names: true });
    expect(stranger.respondents).toBeUndefined(); expect(stranger.ownResponse).toBeNull();
    expect(JSON.stringify(stranger)).not.toContain(photoKey);
    const own = await getAvailabilityPoll(share, { guestKey: ownKey });
    expect(own.ownResponse?.picture).toEqual({ kind: 'photo', key: photoKey });
    expect(own.respondents).toBeUndefined();
    const revealed = await getAvailabilityPoll(share, { guestKey: ownKey }, { names: true });
    expect(revealed.names).toEqual(['Sam']);
    expect(revealed.respondents).toEqual([{ name: 'Sam', picture: { kind: 'photo', key: photoKey } }]);
    expect(JSON.stringify(revealed)).not.toMatch(/private-owner|voterKey|"photo":/);
    const query = db.availabilityPoll.findUnique.mock.calls[0][0];
    expect(query.include.responses.select.photo).not.toBe(true);
  });
  it('replaces a photo with an avatar, explicitly removes pictures and preserves omission', async () => {
    await saveAvailability(share, { ...answer, picture: { kind: 'avatar', id: 'wink' } }, { guestKey: ownKey });
    expect(db.availabilityResponse.upsert.mock.calls[0][0].update).toMatchObject({ avatarId: 'wink', photo: null, photoKey: null });
    await saveAvailability(share, { ...answer, picture: null }, { guestKey: ownKey });
    expect(db.availabilityResponse.upsert.mock.calls[1][0].update).toMatchObject({ avatarId: null, photo: null, photoKey: null });
    await saveAvailability(share, answer, { guestKey: ownKey });
    expect(db.availabilityResponse.upsert.mock.calls[2][0].update).toEqual(answer);
    expect(db.availabilityResponse.findMany.mock.calls[0][0].select.photo).not.toBe(true);
  });
  it('rejects anonymous, unknown-browser, malformed and cross-poll image requests before returning bytes', async () => {
    for (const actor of [{}, { userId: 'private-owner' }, { guestKey: otherKey }]) {
      await expect(getAvailabilityPicture(share, photoKey, actor)).rejects.toMatchObject({ status: 404 });
    }
    expect(db.availabilityResponse.findFirst).not.toHaveBeenCalled();
    await expect(getAvailabilityPicture(share, '../escape', { guestKey: ownKey })).rejects.toMatchObject({ status: 404 });
    db.availabilityResponse.findFirst.mockResolvedValue(null);
    await expect(getAvailabilityPicture(share, 'x'.repeat(43), { guestKey: ownKey })).rejects.toMatchObject({ status: 404 });
    expect(db.availabilityResponse.findFirst).toHaveBeenLastCalledWith({ where: { pollId: 'poll', photoKey: 'x'.repeat(43),
      poll: { revokedAt: null, expiresAt: { gt: expect.any(Date) }, responses: { some: { voterKey: `guest:${digestSecret(ownKey)}` } } } },
      select: { photo: true } });
  });
  it('allows saved respondents to read valid retained pictures but never expired or revoked polls', async () => {
    await expect(getAvailabilityPicture(share, photoKey, { guestKey: ownKey })).resolves.toEqual(new Uint8Array([255, 216, 255, 217]));
    db.availabilityPoll.findUnique.mockResolvedValue({ ...savedPoll(), closedAt: new Date() });
    await expect(getAvailabilityPicture(share, photoKey, { guestKey: ownKey })).resolves.toBeInstanceOf(Uint8Array);
    for (const poll of [{ ...savedPoll(), expiresAt: new Date(0) }, { ...savedPoll(), revokedAt: new Date() }]) {
      db.availabilityPoll.findUnique.mockResolvedValue(poll);
      await expect(getAvailabilityPicture(share, photoKey, { guestKey: ownKey })).rejects.toMatchObject({ status: 404 });
    }
  });
  it('retries the observed raw adapter commit serialization error and bounds repeated conflicts', async () => {
    const conflict = Object.assign(new Error('TransactionWriteConflict'), { name: 'DriverAdapterError',
      cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } });
    db.$transaction.mockRejectedValueOnce(conflict);
    await expect(saveAvailability(share, answer, { guestKey: ownKey })).resolves.toMatchObject({ respondentCount: 1 });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockRejectedValue(conflict);
    await expect(saveAvailability(share, answer, { guestKey: ownKey })).rejects.toMatchObject({ status: 409, code: 'VENN_CHANGED' });
    expect(db.$transaction).toHaveBeenCalledTimes(5);
  });
  it('does not treat arbitrary errors or non-serialization adapter failures as retryable', async () => {
    const failure = Object.assign(new Error('private-driver-data'), { name: 'DriverAdapterError',
      cause: { kind: 'TransactionWriteConflict', originalCode: '99999' } });
    db.$transaction.mockRejectedValueOnce(failure);
    await expect(saveAvailability(share, answer, { guestKey: ownKey })).rejects.toBe(failure);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
