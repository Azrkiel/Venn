import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { digestSecret } from '@/features/identity/secrets';

export type PollVote = { slotId: string; voterKey: string; isGuest: boolean; choice: string };
export type PollSnapshot = {
  id: string; ownerId: string; requesterMemberId: string;
  activity: string; localDate: string; timezone: string; state: string; slotVersion: number; expiresAt: Date;
  participants: { participantId: string; userId: string | null; displayName: string }[];
  slots: { id: string; ordinal: number; start: Date; end: Date; freeIds: string[]; busyIds: string[]; unknownIds: string[] }[];
  votes: PollVote[];
};
type OpenShare = { expiresAt: Date; revokedAt: Date | null; request: PollSnapshot };
export type PollActor = { userId?: string; guestKey?: string; guestName?: string };
export const voteInputSchema = z.object({
  slotId: z.string().min(1).max(128), choice: z.enum(['works', 'cant']),
  slotVersion: z.number().int().positive(),
  guestName: z.string().trim().min(1).max(40).regex(/^[^\p{C}]+$/u).optional(),
}).strict();
export type VoteInput = z.infer<typeof voteInputSchema>;

export function assertOpenShare<T extends OpenShare>(grant: T | null, now = new Date()): T {
  if (!grant) throw new HttpError(404, 'POLL_NOT_FOUND', 'This Venn link is not available.');
  if (grant.revokedAt || grant.expiresAt <= now || grant.request.expiresAt <= now
    || !['ready', 'selected'].includes(grant.request.state)) {
    throw new HttpError(410, 'POLL_EXPIRED', 'This plan has expired or changed. Ask the organizer for a new link.');
  }
  return grant;
}

export function voterIdentity(request: PollSnapshot, actor: PollActor) {
  if (actor.userId && request.participants.some(person => person.userId === actor.userId)) {
    return { voterKey: `member:${actor.userId}`, isGuest: false, guestName: null };
  }
  if (!actor.guestKey || !/^[A-Za-z0-9_-]{43}$/.test(actor.guestKey)) {
    throw new HttpError(401, 'GUEST_COOKIE_REQUIRED', 'Please allow this site to save your response in this browser.');
  }
  const guestName = actor.guestName?.trim() || 'Guest';
  if (guestName.length > 40 || /\p{C}/u.test(guestName)) {
    throw new HttpError(422, 'INVALID_GUEST_NAME', 'Use a short display name for your guest response.');
  }
  return { voterKey: `guest:${digestSecret(actor.guestKey)}`, isGuest: true, guestName };
}

/** Aggregate known member identities internally; only counts reach the public response. */
export function summarizePoll(request: PollSnapshot) {
  const expectedKeys = new Set(request.participants.flatMap(person => person.userId ? [`member:${person.userId}`] : []));
  const slotIds = new Set(request.slots.map(slot => slot.id));
  const latest = new Map<string, PollVote>();
  for (const vote of request.votes) {
    if (slotIds.has(vote.slotId) && ['works', 'cant'].includes(vote.choice)
      && (vote.isGuest || expectedKeys.has(vote.voterKey))) {
      latest.set(`${vote.voterKey}:${vote.slotId}`, vote);
    }
  }
  const votes = [...latest.values()];
  const answeredMembers = [...expectedKeys].filter(key => request.slots.length > 0
    && request.slots.every(slot => votes.some(vote => !vote.isGuest && vote.voterKey === key && vote.slotId === slot.id))).length;
  const expectedMembers = request.participants.length;
  const complete = expectedMembers > 0 && request.slots.length > 0
    && request.participants.every(person => person.userId !== null) && answeredMembers === expectedMembers;
  const options = [...request.slots].sort((a, b) => a.ordinal - b.ordinal).map(slot => {
    const matches = votes.filter(vote => vote.slotId === slot.id);
    return { id: slot.id, memberWorks: matches.filter(vote => !vote.isGuest && vote.choice === 'works').length,
      memberCant: matches.filter(vote => !vote.isGuest && vote.choice === 'cant').length,
      guestWorks: matches.filter(vote => vote.isGuest && vote.choice === 'works').length,
      guestCant: matches.filter(vote => vote.isGuest && vote.choice === 'cant').length };
  });
  const owner = request.participants.find(person => person.userId === request.ownerId);
  const requester = request.participants.find(person => person.participantId === request.requesterMemberId);
  const viable = complete && owner?.userId && requester?.userId ? request.slots.filter(slot =>
    slot.freeIds.includes(owner.participantId) && slot.freeIds.includes(requester.participantId)
    && [owner, requester].every(person => votes.some(vote => !vote.isGuest
      && vote.voterKey === `member:${person.userId}` && vote.slotId === slot.id && vote.choice === 'works'))) : [];
  viable.sort((a, b) => (options.find(option => option.id === b.id)?.memberWorks ?? 0)
    - (options.find(option => option.id === a.id)?.memberWorks ?? 0) || b.freeIds.length - a.freeIds.length || a.ordinal - b.ordinal);
  return { options, complete, answeredMembers, expectedMembers,
    guestRespondents: new Set(votes.filter(vote => vote.isGuest).map(vote => vote.voterKey)).size,
    winningSlotId: viable[0]?.id ?? null };
}

export function publicPoll(request: PollSnapshot) {
  const summary = summarizePoll(request);
  return {
    activity: request.activity, localDate: request.localDate, timezone: request.timezone, slotVersion: request.slotVersion,
    expectedMembers: summary.expectedMembers, answeredMembers: summary.answeredMembers,
    guestRespondents: summary.guestRespondents, complete: summary.complete, winningSlotId: summary.winningSlotId,
    options: [...request.slots].sort((a, b) => a.ordinal - b.ordinal).map(slot => ({
      id: slot.id, ordinal: slot.ordinal, start: slot.start.toISOString(), end: slot.end.toISOString(),
      freeCount: slot.freeIds.length, unknownCount: slot.unknownIds.length, totalCount: request.participants.length,
      ...summary.options.find(option => option.id === slot.id),
    })),
  };
}
export type PublicPoll = ReturnType<typeof publicPoll>;

async function loadGrant(shareToken: string, db: Pick<Prisma.TransactionClient, 'shareGrant'>) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(shareToken)) throw new HttpError(404, 'POLL_NOT_FOUND', 'This Venn link is not available.');
  const grant = await db.shareGrant.findUnique({ where: { tokenDigest: digestSecret(shareToken) },
    include: { request: { include: { participants: true, slots: true, votes: true } } } });
  return assertOpenShare(grant);
}

export async function getPublicPoll(shareToken: string): Promise<PublicPoll> {
  return publicPoll((await loadGrant(shareToken, getDb())).request);
}

export async function castVote(shareToken: string, input: VoteInput, actor: PollActor): Promise<PublicPoll> {
  const parsed = voteInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_VOTE', 'Check the option and response, then try again.');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getDb().$transaction(async tx => {
        const { request } = await loadGrant(shareToken, tx);
        if (request.slotVersion !== parsed.data.slotVersion) {
          throw new HttpError(409, 'STALE_OPTIONS', 'These options have changed. Refresh before responding.');
        }
        if (!request.slots.some(slot => slot.id === parsed.data.slotId)) {
          throw new HttpError(422, 'INVALID_SLOT', 'That option does not belong to this plan.');
        }
        const identity = voterIdentity(request, { ...actor, guestName: parsed.data.guestName ?? actor.guestName });
        await tx.vote.upsert({
          where: { requestId_voterKey_slotId: { requestId: request.id, voterKey: identity.voterKey, slotId: parsed.data.slotId } },
          create: { requestId: request.id, slotId: parsed.data.slotId, ...identity, choice: parsed.data.choice },
          update: { choice: parsed.data.choice, isGuest: identity.isGuest, guestName: identity.guestName },
        });
        const votes = await tx.vote.findMany({ where: { requestId: request.id } });
        const updated = { ...request, votes };
        if (summarizePoll(updated).complete) {
          await tx.completionNotice.upsert({
            where: { requestId_slotVersion: { requestId: request.id, slotVersion: request.slotVersion } },
            create: { requestId: request.id, slotVersion: request.slotVersion }, update: {},
          });
        }
        return publicPoll(updated);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')) throw error;
    }
  }
  throw new HttpError(409, 'POLL_CHANGED', 'Another response arrived at the same time. Please try again.');
}
