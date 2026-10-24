import { getDb } from '../../../src/lib/db';
import { createSecret, digestSecret } from '../../../src/features/identity/secrets';

const HOUR = 3_600_000;

export type SeededPoll = {
  runId: string;
  ownerEmail: string;
  ownerName: string;
  activity: string;
  optionCount: number;
  tokens: { valid: string; expired: string; revoked: string; unknown: string };
  userId: string;
  groupId: string;
  requestId: string;
};

/** Creates an owner, group, ready request with 3 slots, participants and share grants. Unique per call. */
export async function seedPoll(): Promise<SeededPoll> {
  const db = getDb();
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const ownerEmail = `owner-${runId}@e2e-venn.invalid`;
  const ownerName = `Private Owner ${runId}`;
  const activity = 'lunch';
  const user = await db.user.create({ data: { email: ownerEmail, name: ownerName } });
  const group = await db.group.create({
    data: { name: `E2E ${runId}`, ownerId: user.id, memberships: { create: { userId: user.id, displayName: 'Owner' } } },
  });
  const base = Date.now() + 48 * HOUR;
  const ownerPid = `pt-owner-${runId}`;
  const friendPid = `pt-friend-${runId}`;
  const request = await db.schedulingRequest.create({
    data: {
      ownerId: user.id, groupId: group.id, requesterMemberId: friendPid,
      activity, localDate: '2030-01-15', durationMinutes: 60, timezone: 'America/New_York',
      state: 'ready', expiresAt: new Date(Date.now() + 72 * HOUR),
      participants: { create: [
        { participantId: ownerPid, userId: user.id, displayName: 'Owner' },
        { participantId: friendPid, displayName: 'Friend' },
      ] },
      slots: { create: [1, 2, 3].map(ordinal => ({
        ordinal, start: new Date(base + ordinal * 2 * HOUR), end: new Date(base + ordinal * 2 * HOUR + HOUR),
        freeIds: [ownerPid, friendPid], busyIds: [], unknownIds: [],
      })) },
    },
  });
  const grant = async (offsetMs: number, revoked = false) => {
    const token = createSecret();
    await db.shareGrant.create({
      data: { requestId: request.id, tokenDigest: digestSecret(token), expiresAt: new Date(Date.now() + offsetMs),
        revokedAt: revoked ? new Date() : null },
    });
    return token;
  };
  return {
    runId, ownerEmail, ownerName, activity, optionCount: 3, userId: user.id, groupId: group.id, requestId: request.id,
    tokens: { valid: await grant(24 * HOUR), expired: await grant(-HOUR), revoked: await grant(24 * HOUR, true), unknown: createSecret() },
  };
}

/** Deleting the user cascades to groups, requests, slots, votes and share grants. */
export async function cleanupPoll(seed: SeededPoll | undefined): Promise<void> {
  if (!seed) return;
  await getDb().user.deleteMany({ where: { id: seed.userId } });
}

export async function closeDb(): Promise<void> {
  await getDb().$disconnect();
}
