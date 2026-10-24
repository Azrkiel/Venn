import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { calendarEventId } from '@/features/identity/secrets';
import { getCalendarStatus, getUserAvailability, addOwnerEvent, lookupOwnerEvent } from '@/features/calendar/client';
import { getOwnerRequest, loadOwnerRequest } from './service';
import { performBooking } from './booking';

export async function addSelectedEvent(ownerId: string, requestId: string, input: { slotId: string; slotVersion: number }) {
  const saved = await loadOwnerRequest(ownerId, requestId);
  if (saved.eventAction?.state === 'added') return getOwnerRequest(ownerId, requestId);
  const slot = saved.slots.find(item => item.id === input.slotId);
  if (!slot || saved.selectedSlotId !== slot.id || saved.slotVersion !== input.slotVersion || saved.state !== 'selected') {
    throw new HttpError(409, 'SELECT_A_CURRENT_OPTION', 'Choose a current option before adding it.');
  }
  if (slot.start <= new Date()) throw new HttpError(409, 'OPTION_IN_PAST', 'That time has passed. Check for new options.');
  const status = await getCalendarStatus(ownerId);
  if (!status.canWrite) throw new HttpError(403, 'CALENDAR_WRITE_CONSENT_REQUIRED', 'Allow calendar writes, then confirm Add again.');
  const calendar = status.calendars.find(item => item.enabled && item.writable);
  if (!calendar) throw new HttpError(422, 'CALENDAR_WRITABLE_SELECTION_REQUIRED', 'Include one of your own calendars before adding an event.');
  const eventId = calendarEventId(ownerId, requestId);
  const claimed = await getDb().$transaction(async db => {
    const existing = await db.eventAction.findUnique({ where: { requestId } });
    if (existing?.state === 'added') return existing;
    const current = await db.schedulingRequest.updateMany({ where: { id: requestId, ownerId,
      selectedSlotId: slot.id, slotVersion: input.slotVersion, state: 'selected', expiresAt: { gt: new Date() } },
      data: { selectedSlotId: slot.id } });
    if (current.count !== 1) throw new HttpError(409, 'STALE_OPTION', 'The request changed before Add. Check the current options again.');
    if (existing && existing.slotId !== slot.id) throw new HttpError(409, 'EVENT_ACTION_BOUND', 'An event action already belongs to another option. Start a fresh request.');
    if (existing?.state === 'pending' && existing.createdAt.getTime() > Date.now() - 120_000) {
      throw new HttpError(409, 'ADD_IN_PROGRESS', 'That Add action is still being checked. Try again shortly.');
    }
    if (existing) return db.eventAction.update({ where: { requestId }, data: { state: 'pending', createdAt: new Date() } });
    return db.eventAction.create({ data: { ownerId, requestId, slotId: slot.id, eventId, calendarId: calendar.id, state: 'pending' } });
  }, { isolationLevel: 'Serializable' });
  if (claimed.state === 'added') return getOwnerRequest(ownerId, requestId);
  const requester = saved.participants.find(member => member.participantId === saved.requesterMemberId)?.userId;
  if (!requester) {
    await getDb().eventAction.update({ where: { requestId }, data: { state: 'failed' } });
    throw new HttpError(409, 'REQUESTER_UNKNOWN', 'The requester needs to be identified before booking.');
  }
  const event = { id: eventId, calendarId: claimed.calendarId, summary: `Venn · ${saved.activity}`,
    start: slot.start.getTime(), end: slot.end.getTime(), timezone: saved.timezone };
  try {
    const receipt = await performBooking({ ownerId, requestId, eventId, calendarId: claimed.calendarId,
      slotId: slot.id, start: event.start, end: event.end, timezone: event.timezone, summary: event.summary,
      requiredUserIds: [ownerId, requester], reconcileFirst: Boolean(saved.eventAction) }, {
      lookup: () => lookupOwnerEvent(ownerId, event), availability: getUserAvailability,
      insert: () => addOwnerEvent(ownerId, event),
    });
    await getDb().$transaction([
      getDb().eventAction.update({ where: { requestId }, data: { state: 'added', htmlLink: receipt.htmlLink ?? null, calendarId: receipt.calendarId } }),
      getDb().schedulingRequest.update({ where: { id: requestId }, data: { state: 'added' } }),
    ]);
    return getOwnerRequest(ownerId, requestId);
  } catch (error) {
    const state = error instanceof HttpError ? 'failed' : 'uncertain';
    await getDb().eventAction.updateMany({ where: { requestId, state: 'pending' }, data: { state } });
    throw error;
  }
}
