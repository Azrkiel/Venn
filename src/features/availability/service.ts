import type { Prisma } from '@prisma/client';
import { getDb, isPrismaError } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { createSecret, digestSecret } from '@/features/identity/secrets';
import { avatarIds, type AvatarId, type PictureView } from '@/features/profile-pictures/schema';
import { normalizePicture } from '@/features/profile-pictures/normalize';
import { aggregateAvailability, type AvailabilityBucket } from './overlap';
import { availabilityInputSchema, availabilityPollSchema, validateRanges, windowBounds,
  type AvailabilityPollInput, type AvailabilityRange, type AvailabilityScale } from './schema';

export const AVAILABILITY_COOKIE = 'venn-availability-guest';
const RETENTION_MS = 30 * 86_400_000;
export type AvailabilityActor = { guestKey?: string; userId?: string };
// A poll refresh needs picture references, never every respondent's JPEG bytes.
const responseMetadata = { voterKey: true, name: true, ranges: true, avatarId: true, photoKey: true, updatedAt: true } as const;
type StoredPoll = Prisma.AvailabilityPollGetPayload<{ include: { responses: { select: typeof responseMetadata } } }>;
export type AvailabilityPollView = {
  activity: string; timezone: string; scale: AvailabilityScale; startDate: string; endDate: string;
  closesAt: string; closed: boolean; respondentCount: number; buckets: AvailabilityBucket[]; best: AvailabilityBucket[];
  ownResponse: { name: string; ranges: AvailabilityRange[]; picture?: PictureView } | null;
  names?: string[]; respondents?: { name: string; picture: PictureView | null }[]; isOwner: boolean;
};

function voterKey(actor: AvailabilityActor): string | undefined {
  return actor.guestKey && /^[A-Za-z0-9_-]{43}$/.test(actor.guestKey) ? `guest:${digestSecret(actor.guestKey)}` : undefined;
}

function readable(poll: StoredPoll | null, now = new Date()): StoredPoll {
  if (!poll) throw new HttpError(404, 'VENN_NOT_FOUND', 'This Venn link is not available.');
  if (poll.revokedAt || poll.expiresAt <= now) throw new HttpError(410, 'VENN_EXPIRED', 'This Venn link is no longer available.');
  return poll;
}

async function load(share: string, db: Pick<Prisma.TransactionClient, 'availabilityPoll'>) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(share)) throw new HttpError(404, 'VENN_NOT_FOUND', 'This Venn link is not available.');
  return readable(await db.availabilityPoll.findUnique({ where: { tokenDigest: digestSecret(share) },
    include: { responses: { select: responseMetadata, orderBy: { updatedAt: 'asc' } } } }));
}

function responsePicture(response: { avatarId: string | null; photoKey: string | null }): PictureView | null {
  if (response.avatarId && (avatarIds as readonly string[]).includes(response.avatarId)) return { kind: 'avatar', id: response.avatarId as AvatarId };
  return response.photoKey ? { kind: 'photo', key: response.photoKey } : null;
}

function serializationConflict(error: unknown): boolean {
  if (isPrismaError(error, 'P2034')) return true;
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') return false;
  const cause = error.cause;
  return typeof cause === 'object' && cause !== null && 'kind' in cause && cause.kind === 'TransactionWriteConflict'
    && 'originalCode' in cause && (cause.originalCode === '40001' || cause.originalCode === '40P01');
}

function view(poll: StoredPoll, actor: AvailabilityActor = {}, names = false): AvailabilityPollView {
  const responses = poll.responses.map(response => ({ voterKey: response.voterKey,
    ...availabilityInputSchema.parse({ name: response.name, ranges: response.ranges }), picture: responsePicture(response) }));
  const own = responses.find(response => response.voterKey === voterKey(actor));
  const scale = poll.scale as AvailabilityScale;
  const overlap = aggregateAvailability({ ...poll, scale }, responses);
  return {
    activity: poll.activity, timezone: poll.timezone, scale, startDate: poll.startDate, endDate: poll.endDate,
    closesAt: poll.closesAt.toISOString(), closed: poll.closedAt !== null || poll.closesAt <= new Date(),
    respondentCount: responses.length, ...overlap,
    ownResponse: own ? { name: own.name, ranges: own.ranges, ...(own.picture ? { picture: own.picture } : {}) } : null,
    ...(names && own ? { names: responses.map(response => response.name),
      respondents: responses.map(response => ({ name: response.name, picture: response.picture })) } : {}), isOwner: actor.userId === poll.ownerId,
  };
}

export async function createAvailabilityPoll(ownerId: string, input: AvailabilityPollInput) {
  const parsed = availabilityPollSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_VENN', 'Check the activity, planning dates, timezone and closing deadline.');
  const closesAt = new Date(parsed.data.closesAt);
  if (closesAt <= new Date() || closesAt.getTime() > windowBounds(parsed.data).end.toMillis()) {
    throw new HttpError(422, 'INVALID_DEADLINE', 'Choose a future deadline no later than the end of the planning dates.');
  }
  const share = createSecret();
  const poll = await getDb().availabilityPoll.create({ data: { ...parsed.data, ownerId, closesAt,
    expiresAt: new Date(closesAt.getTime() + RETENTION_MS), tokenDigest: digestSecret(share) }, include: { responses: { select: responseMetadata } } });
  return { path: `/r/${share}`, poll: view(poll, { userId: ownerId }) };
}

export async function getAvailabilityPoll(share: string, actor: AvailabilityActor = {}, options: { names?: boolean } = {}): Promise<AvailabilityPollView> {
  return view(await load(share, getDb()), actor, options.names);
}

export async function saveAvailability(share: string, input: unknown, actor: AvailabilityActor): Promise<AvailabilityPollView> {
  const parsed = availabilityInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'INVALID_AVAILABILITY', 'Enter your name and choose valid availability ranges.');
  const identity = voterKey(actor);
  if (!identity) throw new HttpError(401, 'GUEST_COOKIE_REQUIRED', 'Allow this site to save your response in this browser.');
  const picture = await normalizePicture(parsed.data.picture);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getDb().$transaction(async tx => {
        const poll = await load(share, tx);
        const now = new Date();
        if (poll.closedAt || poll.closesAt <= now) throw new HttpError(410, 'VENN_CLOSED', 'Voting has closed. You can still see the results.');
        const ranges = validateRanges({ ...poll, scale: poll.scale as AvailabilityScale }, parsed.data.ranges);
        // Touch the same row as early close/notice claiming. Concurrent close and vote cannot both use a stale snapshot.
        const lock = await tx.availabilityPoll.updateMany({ where: { id: poll.id, closedAt: null, closesAt: { gt: now }, revokedAt: null },
          data: { revision: { increment: 1 } } });
        if (!lock.count) throw new HttpError(410, 'VENN_CLOSED', 'Voting has closed. You can still see the results.');
        await tx.availabilityResponse.upsert({ where: { pollId_voterKey: { pollId: poll.id, voterKey: identity } },
          create: { pollId: poll.id, voterKey: identity, name: parsed.data.name, ranges, ...picture }, update: { name: parsed.data.name, ranges, ...picture } });
        const responses = await tx.availabilityResponse.findMany({ where: { pollId: poll.id }, select: responseMetadata, orderBy: { updatedAt: 'asc' } });
        return view({ ...poll, responses }, actor);
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!serializationConflict(error)) throw error;
    }
  }
  throw new HttpError(409, 'VENN_CHANGED', 'Another response arrived at the same time. Please try saving again.');
}

/** Picture URLs confer no authority: the requester must have an answer on this exact retained poll. */
export async function getAvailabilityPicture(share: string, picture: string, actor: AvailabilityActor): Promise<Uint8Array<ArrayBuffer>> {
  const missing = () => new HttpError(404, 'PICTURE_NOT_FOUND', 'This picture is not available.');
  const identity = voterKey(actor);
  if (!identity || !/^[A-Za-z0-9_-]{43}$/.test(picture)) throw missing();
  let poll: StoredPoll;
  try { poll = await load(share, getDb()); }
  catch (error) { if (error instanceof HttpError && [404, 410].includes(error.status)) throw missing(); throw error; }
  if (!poll.responses.some(response => response.voterKey === identity)) throw missing();
  const result = await getDb().availabilityResponse.findFirst({ where: { pollId: poll.id, photoKey: picture,
    poll: { revokedAt: null, expiresAt: { gt: new Date() }, responses: { some: { voterKey: identity } } } }, select: { photo: true } });
  if (!result?.photo) throw missing();
  return new Uint8Array(result.photo);
}

export async function closeAvailabilityPoll(ownerId: string, share: string, actor: AvailabilityActor = {}): Promise<AvailabilityPollView> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getDb().$transaction(async tx => {
        const poll = await load(share, tx);
        if (poll.ownerId !== ownerId) throw new HttpError(404, 'VENN_NOT_FOUND', 'This Venn link is not available.');
        const now = new Date();
        if (!poll.closedAt && poll.closesAt > now) {
          const expiresAt = new Date(now.getTime() + RETENTION_MS);
          await tx.availabilityPoll.updateMany({ where: { id: poll.id, ownerId, closedAt: null },
            data: { closedAt: now, expiresAt, revision: { increment: 1 } } });
          return view({ ...poll, closedAt: now, expiresAt }, { ...actor, userId: ownerId });
        }
        return view(poll, { ...actor, userId: ownerId });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!serializationConflict(error)) throw error;
    }
  }
  throw new HttpError(409, 'VENN_CHANGED', 'A response changed while closing. Please try closing again.');
}
