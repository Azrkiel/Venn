import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { requestContext } from '@/features/groups/service';
import { parseIntent } from '@/features/scheduling/intent';
import { buildDraft } from '@/features/scheduling/draft';
import { getUserAvailability } from '@/features/calendar/client';
import { createSecret, digestSecret } from '@/features/identity/secrets';
import { prepareRequest } from './prepare';
import type { Activity } from '@/features/scheduling/types';

export async function createLiveRequest(ownerId: string, input: { groupId: string; requesterMemberId: string; text: string; timezone: string }) {
  const group = await requestContext(ownerId, input.groupId);
  const receivedAt = new Date().toISOString();
  const result = await prepareRequest({ ...input, ownerId, group, receivedAt }, { parse: parseIntent, availability: getUserAvailability });
  if (result.state === 'needs_clarification' || !result.intent.localDate) return result;
  const saved = await getDb().schedulingRequest.create({ data: {
    ownerId, groupId: group.id, requesterMemberId: input.requesterMemberId, activity: result.intent.activity,
    localDate: result.intent.localDate, durationMinutes: result.intent.durationMinutes, timezone: input.timezone,
    state: result.state, expiresAt: new Date(Date.now() + 48 * 60 * 60_000),
    participants: { create: result.participants.map(member => ({ participantId: member.id, userId: member.userId, displayName: member.displayName })) },
    slots: { create: result.slots.map((slot, index) => ({ ordinal: index + 1, start: new Date(slot.start), end: new Date(slot.end),
      freeIds: slot.freeIds, busyIds: slot.busyIds, unknownIds: slot.unknownIds })) },
  }, select: { id: true } });
  return getOwnerRequest(ownerId, saved.id);
}

export async function loadOwnerRequest(ownerId: string, requestId: string) {
  const saved = await getDb().schedulingRequest.findFirst({ where: { id: requestId, ownerId },
    include: { group: { select: { name: true } }, participants: true, slots: { orderBy: { ordinal: 'asc' } }, eventAction: true } });
  if (!saved) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'That request was not found.');
  if (saved.expiresAt <= new Date()) throw new HttpError(410, 'REQUEST_EXPIRED', 'That request has expired. Check the calendars again.');
  return saved;
}

export async function getOwnerRequest(ownerId: string, requestId: string) {
  const saved = await loadOwnerRequest(ownerId, requestId);
  const slots = saved.slots.map(slot => ({ id: slot.id, ordinal: slot.ordinal, start: slot.start.getTime(), end: slot.end.getTime(),
    freeIds: slot.freeIds, busyIds: slot.busyIds, unknownIds: slot.unknownIds }));
  const selected = slots.find(slot => slot.id === saved.selectedSlotId);
  return { id: saved.id, groupId: saved.groupId, groupName: saved.group.name, activity: saved.activity, localDate: saved.localDate,
    durationMinutes: saved.durationMinutes, timezone: saved.timezone, state: saved.state, slotVersion: saved.slotVersion,
    selectedSlotId: saved.selectedSlotId, checkedAt: saved.createdAt.toISOString(), expiresAt: saved.expiresAt.toISOString(),
    participants: saved.participants.map(member => ({ id: member.participantId, displayName: member.displayName })), slots,
    draft: buildDraft(selected ? [selected] : slots, saved.timezone, saved.activity as Activity),
    event: saved.eventAction?.state === 'added' ? { id: saved.eventAction.eventId, htmlLink: saved.eventAction.htmlLink } : null };
}

export async function selectSlot(ownerId: string, requestId: string, slotId: string, slotVersion: number) {
  const saved = await loadOwnerRequest(ownerId, requestId);
  if (saved.eventAction) throw new HttpError(409, 'EVENT_ACTION_BOUND', 'This request already has an event action. Start a fresh request to change the time.');
  if (!saved.slots.some(slot => slot.id === slotId) || saved.slotVersion !== slotVersion || !['ready', 'selected'].includes(saved.state)) {
    throw new HttpError(409, 'STALE_OPTION', 'The options changed. Check availability again.');
  }
  const changed = await getDb().schedulingRequest.updateMany({ where: { id: requestId, ownerId, slotVersion,
    state: { in: ['ready', 'selected'] }, eventAction: { is: null }, expiresAt: { gt: new Date() } }, data: { state: 'selected', selectedSlotId: slotId } });
  if (changed.count !== 1) throw new HttpError(409, 'STALE_OPTION', 'The options changed. Check availability again.');
  return getOwnerRequest(ownerId, requestId);
}

export async function cancelRequest(ownerId: string, requestId: string) {
  const saved = await loadOwnerRequest(ownerId, requestId);
  if (saved.eventAction && ['pending', 'uncertain', 'added'].includes(saved.eventAction.state)) throw new HttpError(409, 'EVENT_ACTION_BOUND', 'Reconcile the event action before cancelling this request.');
  const changed = await getDb().schedulingRequest.updateMany({ where: { id: requestId, ownerId, state: { not: 'added' },
    OR: [{ eventAction: { is: null } }, { eventAction: { is: { state: 'failed' } } }] }, data: { state: 'cancelled', selectedSlotId: null } });
  if (!changed.count) throw new HttpError(409, 'ALREADY_ADDED', 'That event has already been added.');
  await getDb().shareGrant.updateMany({ where: { requestId }, data: { revokedAt: new Date() } });
  return { state: 'cancelled' };
}

export async function shareRequest(ownerId: string, requestId: string) {
  const saved = await loadOwnerRequest(ownerId, requestId);
  if (!['ready', 'selected'].includes(saved.state) || !saved.slots.length) throw new HttpError(409, 'RESULT_NOT_SHAREABLE', 'Refresh this request before sharing.');
  const token = createSecret();
  await getDb().shareGrant.create({ data: { requestId, tokenDigest: digestSecret(token), expiresAt: saved.expiresAt } });
  return { path: `/r/${token}`, expiresAt: saved.expiresAt.toISOString() };
}
