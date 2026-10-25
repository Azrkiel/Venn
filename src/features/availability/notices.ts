import { DateTime } from 'luxon';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { sendPairedText } from '@/features/messaging/delivery';
import { aggregateAvailability } from './overlap';
import { availabilityInputSchema, isTimedScale, type AvailabilityScale } from './schema';

/** Claim before sending: a crashed/ambiguous send remains terminal rather than texting twice. */
export async function processAvailabilityNotices(now = new Date(), pollId?: string, tokenDigest?: string) {
  const db = getDb();
  const due = { noticeState: 'pending', revokedAt: null, expiresAt: { gt: now },
    OR: [{ closesAt: { lte: now } }, { closedAt: { not: null } }] };
  const candidates = await db.availabilityPoll.findMany({ where: { ...due, ...(pollId ? { id: pollId } : {}), ...(tokenDigest ? { tokenDigest } : {}) },
    select: { id: true }, take: 20, orderBy: { closesAt: 'asc' } });
  let processed = 0;
  await Promise.all(candidates.map(async candidate => {
    const claim = await db.availabilityPoll.updateMany({ where: { id: candidate.id, ...due },
      data: { noticeState: 'sending', revision: { increment: 1 } } });
    if (!claim.count) return;
    processed++;
    try {
      const poll = await db.availabilityPoll.findUnique({ where: { id: candidate.id }, include: { responses: true } });
      if (!poll) return;
      const scale = poll.scale as AvailabilityScale;
      const responses = poll.responses.map(response => availabilityInputSchema.parse({ name: response.name, ranges: response.ranges }));
      const best = aggregateAvailability({ ...poll, scale }, responses).best[0];
      const start = best ? DateTime.fromISO(best.start, { zone: poll.timezone }) : null;
      const end = best ? DateTime.fromISO(best.end, { zone: poll.timezone }) : null;
      const label = best ? isTimedScale(scale)
        ? `${start!.toFormat('ccc, LLL d, h:mm a')}–${end!.toFormat(start!.toISODate() === end!.toISODate() ? 'h:mm a' : 'ccc, LLL d, h:mm a')} (${poll.timezone})`
        : `${best.start} through ${DateTime.fromISO(best.end, { zone: 'UTC' }).minus({ days: 1 }).toISODate()}` : '';
      const result = best ? `${label} works for ${best.count} of ${responses.length} respondents.`
        : `${responses.length} ${responses.length === 1 ? 'person responded' : 'people responded'}; no shared availability was selected.`;
      await sendPairedText(poll.ownerId, `Your Venn for ${poll.activity} is closed. ${result} Availability is self-reported; confirm the final plan with your group.`);
      await db.availabilityPoll.updateMany({ where: { id: candidate.id, noticeState: 'sending' }, data: { noticeState: 'sent' } });
    } catch (error) {
      const state = error instanceof HttpError && error.code === 'PHONE_NOT_PAIRED' ? 'unpaired' : 'uncertain';
      await db.availabilityPoll.updateMany({ where: { id: candidate.id, noticeState: 'sending' }, data: { noticeState: state } });
    }
  }));
  return { processed };
}
