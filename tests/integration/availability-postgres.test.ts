import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { createSecret } from '@/features/identity/secrets';
import { closeAvailabilityPoll, createAvailabilityPoll, getAvailabilityPoll, saveAvailability } from '@/features/availability/service';

describe.skipIf(process.env.VENN_DATABASE_TESTS !== '1')('availability with real Postgres', () => {
  let ownerId: string;
  let share: string;
  beforeEach(async () => {
    ownerId = (await getDb().user.create({ data: { name: 'Private smoke owner' } })).id;
    const result = await createAvailabilityPoll(ownerId, {
      activity: 'Beach', scale: 'month', timezone: 'America/New_York', startDate: '2030-06-01', endDate: '2030-06-30',
      closesAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    share = result.path.split('/').at(-1)!;
  });
  afterEach(async () => { if (ownerId) await getDb().user.deleteMany({ where: { id: ownerId } }); });
  afterAll(async () => { await getDb().$disconnect(); });

  it('persists concurrent guests once each and keeps subsequent edits on the same response', async () => {
    const a = { guestKey: createSecret() }, b = { guestKey: createSecret() };
    await Promise.all([
      saveAvailability(share, { name: 'Alice', ranges: [{ start: '2030-06-10', end: '2030-06-12' }] }, a),
      saveAvailability(share, { name: 'Bob', ranges: [{ start: '2030-06-11', end: '2030-06-13' }] }, b),
    ]);
    const result = await getAvailabilityPoll(share, a, { names: true });
    expect(result.respondentCount).toBe(2);
    expect(result.buckets.find(bucket => bucket.start === '2030-06-11')?.count).toBe(2);
    expect(result.names).toEqual(expect.arrayContaining(['Alice', 'Bob']));
    await saveAvailability(share, { name: 'Alice', ranges: [] }, a);
    const edited = await getAvailabilityPoll(share, a);
    expect(edited.respondentCount).toBe(2);
    expect(edited.ownResponse).toEqual({ name: 'Alice', ranges: [] });
    expect(edited.buckets.find(bucket => bucket.start === '2030-06-11')?.count).toBe(1);
    expect((await getAvailabilityPoll(share, {}, { names: true })).names).toBeUndefined();
  });

  it('serializes a last answer against owner close and never accepts an answer after close', async () => {
    await expect(closeAvailabilityPoll('some-other-owner', share)).rejects.toMatchObject({ status: 404 });
    const actor = { guestKey: createSecret() };
    const outcomes = await Promise.allSettled([
      saveAvailability(share, { name: 'Casey', ranges: [{ start: '2030-06-10', end: '2030-06-11' }] }, actor),
      closeAvailabilityPoll(ownerId, share),
    ]);
    expect(outcomes[1].status).toBe('fulfilled');
    if (outcomes[0].status === 'rejected') expect(outcomes[0].reason).toMatchObject({ status: 410 });
    const result = await getAvailabilityPoll(share, actor);
    expect(result.closed).toBe(true);
    expect(result.respondentCount).toBe(outcomes[0].status === 'fulfilled' ? 1 : 0);
    await expect(saveAvailability(share, { name: 'Casey', ranges: [] }, actor)).rejects.toMatchObject({ status: 410 });
  });
});
