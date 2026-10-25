import { DateTime, IANAZone } from 'luxon';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { sendPairedText } from '@/features/messaging/delivery';
import { formatSlot } from '@/features/scheduling/draft';
import { summarizePoll } from './service';

/** Claim before delivery: an ambiguous send is terminal, so cron cannot text twice. */
export async function processCompletionNotices(now = new Date()) {
  const db = getDb();
  const candidates = await db.completionNotice.findMany({
    where: { state: 'pending', request: {
      state: { in: ['ready', 'selected'] }, expiresAt: { gt: now },
      shares: { some: { revokedAt: null, expiresAt: { gt: now } } },
    } },
    select: { id: true }, orderBy: { id: 'asc' }, take: 20,
  });
  let processed = 0;
  await Promise.all(candidates.map(async candidate => {
    const claim = await db.completionNotice.updateMany({
      where: { id: candidate.id, state: 'pending' }, data: { state: 'sending' },
    });
    if (!claim.count) return;
    processed++;
    const finish = (state: string) => db.completionNotice.updateMany({
      where: { id: candidate.id, state: 'sending' }, data: { state },
    });
    try {
      const notice = await db.completionNotice.findUnique({ where: { id: candidate.id },
        include: { request: { include: { participants: true, slots: true, votes: true, shares: true } } },
      });
      const poll = notice?.request;
      if (!poll || poll.slotVersion !== notice.slotVersion || !['ready', 'selected'].includes(poll.state)
        || poll.expiresAt <= now || !poll.shares.some(share => !share.revokedAt && share.expiresAt > now)
        || !IANAZone.isValidZone(poll.timezone)
        || poll.slots.some(slot => slot.start <= now || !Number.isFinite(slot.start.getTime()) || slot.end <= slot.start || !Number.isFinite(slot.end.getTime()))) {
        await finish('suppressed'); return;
      }
      const summary = summarizePoll(poll);
      if (!summary.complete) { await finish('suppressed'); return; }
      const winning = poll.slots.find(slot => slot.id === summary.winningSlotId);
      const approvals = summary.options.find(option => option.id === winning?.id)?.memberWorks;
      const result = winning
        ? `${DateTime.fromJSDate(winning.start, { zone: poll.timezone }).toFormat('ccc, LLL d')}, ${formatSlot(winning.start.getTime(), winning.end.getTime(), poll.timezone)} (${poll.timezone}) works for ${approvals} of ${summary.expectedMembers} members.`
        : 'There is no shared option that works for the required members.';
      await sendPairedText(poll.ownerId, `Everyone in your Venn for ${poll.activity} has answered. ${result} Confirm the final plan with your group. Nothing has been booked.`);
      await finish('sent');
    } catch (error) {
      await finish(error instanceof HttpError && error.code === 'PHONE_NOT_PAIRED' ? 'unpaired' : 'uncertain');
    }
  }));
  return { processed };
}
