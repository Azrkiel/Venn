import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { getDb } from '@/lib/db';
import { createSecret, digestSecret } from '@/features/identity/secrets';
import { closeAvailabilityPoll, createAvailabilityPoll, getAvailabilityPicture, getAvailabilityPoll, saveAvailability } from '@/features/availability/service';

describe.skipIf(process.env.VENN_DATABASE_TESTS !== '1')('profile pictures with real Postgres', () => {
  let ownerId: string, share: string;
  const answer = { name: 'Selfie guest', ranges: [] };
  const createPoll = async () => createAvailabilityPoll(ownerId, { activity: 'Picture integration lunch', scale: 'day', timezone: 'UTC',
    startDate: '2030-01-15', endDate: '2030-01-15', closesAt: new Date(Date.now() + 86_400_000).toISOString() });
  beforeEach(async () => {
    ownerId = (await getDb().user.create({ data: { name: 'Picture integration owner' } })).id;
    share = (await createPoll()).path.split('/').at(-1)!;
  });
  afterEach(async () => { vi.restoreAllMocks(); if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
  afterAll(async () => { await getDb().$disconnect(); });
  const selfie = async () => ({ kind: 'photo' as const, dataUrl: `data:image/jpeg;base64,${(await sharp({ create: {
    width: 48, height: 32, channels: 3, background: '#7a4ce0' } }).withExif({ IFD0: { Artist: 'private-test-camera' } }).jpeg().toBuffer()).toString('base64')}` });

  it('stores a normalized photo, protects it by poll/browser membership and invalidates replaced/removed keys', async () => {
    const actor = { guestKey: createSecret() }, another = { guestKey: createSecret() };
    const input = await selfie();
    await saveAvailability(share, { ...answer, picture: { kind: 'avatar', id: 'tongue' } }, actor);
    expect((await getAvailabilityPoll(share, actor)).ownResponse?.picture).toEqual({ kind: 'avatar', id: 'tongue' });
    const saved = await saveAvailability(share, { ...answer, picture: input }, actor);
    const picture = saved.ownResponse!.picture!;
    if (picture.kind !== 'photo') throw new Error('Expected saved photo');
    const bytes = await getAvailabilityPicture(share, picture.key, actor);
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'jpeg', width: 192, height: 192 });
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    await expect(getAvailabilityPicture(share, picture.key, {})).rejects.toMatchObject({ status: 404 });
    await expect(getAvailabilityPicture(share, picture.key, another)).rejects.toMatchObject({ status: 404 });
    await saveAvailability(share, { name: 'Another guest', ranges: [] }, another);
    expect((await getAvailabilityPoll(share, another)).respondents).toBeUndefined();
    expect((await getAvailabilityPoll(share, another, { names: true })).respondents).toEqual(expect.arrayContaining([
      { name: answer.name, picture: { kind: 'photo', key: picture.key } },
    ]));
    await expect(getAvailabilityPicture(share, picture.key, another)).resolves.toBeInstanceOf(Uint8Array);
    await saveAvailability(share, answer, actor);
    expect((await getAvailabilityPoll(share, actor)).ownResponse?.picture).toEqual(picture);
    const replaced = await saveAvailability(share, { ...answer, picture: input }, actor);
    expect(replaced.ownResponse?.picture).not.toEqual(picture);
    await expect(getAvailabilityPicture(share, picture.key, actor)).rejects.toMatchObject({ status: 404 });
    await saveAvailability(share, { ...answer, picture: null }, actor);
    expect((await getAvailabilityPoll(share, actor)).ownResponse?.picture).toBeUndefined();
    expect(await getDb().availabilityResponse.count({ where: { poll: { tokenDigest: digestSecret(share) } } })).toBe(2);
  });

  it('does not reuse another poll/photo reference and keeps retained closed photos available only until expiry', async () => {
    const actor = { guestKey: createSecret() };
    const picture = (await saveAvailability(share, { ...answer, picture: await selfie() }, actor)).ownResponse!.picture!;
    if (picture.kind !== 'photo') throw new Error('Expected saved photo');
    await expect(saveAvailability(share, { ...answer, picture }, actor)).rejects.toMatchObject({ status: 422 });
    const otherShare = (await createPoll()).path.split('/').at(-1)!;
    await saveAvailability(otherShare, answer, actor);
    await expect(getAvailabilityPicture(otherShare, picture.key, actor)).rejects.toMatchObject({ status: 404 });
    await closeAvailabilityPoll(ownerId, share);
    await expect(getAvailabilityPicture(share, picture.key, actor)).resolves.toBeInstanceOf(Uint8Array);
    await getDb().availabilityPoll.updateMany({ where: { ownerId, tokenDigest: digestSecret(share) }, data: { expiresAt: new Date(0) } });
    await expect(getAvailabilityPicture(share, picture.key, actor)).rejects.toMatchObject({ status: 404 });
  });

  it('rechecks revocation at the byte lookup if the poll changes after authorization', async () => {
    const actor = { guestKey: createSecret() };
    const picture = (await saveAvailability(share, { ...answer, picture: await selfie() }, actor)).ownResponse!.picture!;
    if (picture.kind !== 'photo') throw new Error('Expected saved photo');
    const db = getDb();
    const lookup = db.availabilityResponse.findFirst.bind(db.availabilityResponse);
    const revokeBeforeLookup = async (args: Parameters<typeof lookup>[0]) => {
      await db.availabilityPoll.update({ where: { tokenDigest: digestSecret(share) }, data: { revokedAt: new Date() } });
      return lookup(args);
    };
    // The service awaits this query; relation-chain methods on Prisma's promise are not used here.
    vi.spyOn(db.availabilityResponse, 'findFirst').mockImplementationOnce(revokeBeforeLookup as unknown as typeof db.availabilityResponse.findFirst);
    await expect(getAvailabilityPicture(share, picture.key, actor)).rejects.toMatchObject({ status: 404 });
  });
});
