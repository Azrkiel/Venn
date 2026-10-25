import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { getOwnerRequest } from '@/features/requests/service';
import { formatSlot } from '@/features/scheduling/draft';
import { isDirectThread } from '@/features/identity/phone-link';
import { postVerifiedThread, type OwnerTransport } from './transport';

export async function sendPairedText(ownerId: string, text: string, transport: OwnerTransport = postVerifiedThread) {
  const pair = await getDb().phoneLink.findUnique({ where: { userId: ownerId }, select: { threadId: true } });
  if (!pair || !isDirectThread(pair.threadId)) throw new HttpError(409, 'PHONE_NOT_PAIRED', 'Pair your own phone with Venn before receiving private results.');
  await transport(pair.threadId, text);
}

export async function latestOwnerResult(ownerId: string) {
  const latest = await getDb().schedulingRequest.findFirst({ where: { ownerId, expiresAt: { gt: new Date() },
    state: { in: ['ready', 'selected', 'no_slots'] } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (!latest) throw new HttpError(404, 'NO_ACTIVE_REQUEST', 'No current result yet. Create a request in Venn first.');
  return getOwnerRequest(ownerId, latest.id);
}

export async function sendOwnerResult(ownerId: string, requestId: string, transport: OwnerTransport = postVerifiedThread) {
  const result = await getOwnerRequest(ownerId, requestId);
  if (!['ready', 'selected', 'no_slots'].includes(result.state)) {
    throw new HttpError(409, 'STALE_RESULT', 'These calendars need to be checked again before sharing a result.');
  }
  const pair = await getDb().phoneLink.findUnique({ where: { userId: ownerId }, select: { threadId: true } });
  if (!pair || !isDirectThread(pair.threadId)) throw new HttpError(409, 'PHONE_NOT_PAIRED', 'Pair your own phone with Venn before receiving private results.');
  const options = result.slots.map(slot => `${slot.ordinal}. ${formatSlot(slot.start, slot.end, result.timezone)}${result.mode === 'solo' ? '' : ` · ${slot.freeIds.length} of ${result.participants.length} free${slot.unknownIds.length ? `, ${slot.unknownIds.length} unknown` : ''}`}`);
  const path = `/live?request=${encodeURIComponent(result.id)}`;
  const base = process.env.APP_BASE_URL;
  const privateUrl = base ? new URL(path, base).toString() : path;
  const text = [`${result.activity} · ${result.localDate} · ${result.timezone}`, ...options,
    result.draft, `Review privately: ${privateUrl}`, 'Your reply is a draft. You decide when to send it.'].join('\n\n');
  await getDb().schedulingRequest.updateMany({ where: { id: requestId, ownerId }, data: { deliveryState: 'pending' } });
  try {
    await transport(pair.threadId, text);
    await getDb().schedulingRequest.updateMany({ where: { id: requestId, ownerId }, data: { deliveryState: 'sent' } });
    return { deliveryState: 'sent' };
  } catch (error) {
    const state = error instanceof HttpError && error.code === 'PHOTON_NOT_CONFIGURED' ? 'failed' : 'uncertain';
    await getDb().schedulingRequest.updateMany({ where: { id: requestId, ownerId }, data: { deliveryState: state } });
    throw new HttpError(503, state === 'uncertain' ? 'DELIVERY_UNCERTAIN' : 'PHOTON_NOT_CONFIGURED',
      state === 'uncertain' ? 'Delivery could not be confirmed. Check Messages before sending again.' : 'Connect Photon before sending this result.');
  }
}
