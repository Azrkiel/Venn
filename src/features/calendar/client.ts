import { getDb } from '@/lib/db';
import type { Availability, Busy } from '@/features/scheduling/types';
import { getAccessToken, OWNED_EVENTS_SCOPE } from './oauth';
import { CalendarError } from './errors';
import { outlookAccessToken, queryOutlookBusy } from './outlook';
import { queryAppleBusy } from './apple';
import { decryptToken } from './token-vault';
import type { CalendarProvider } from './provider-store';

type JsonObject = Record<string, unknown>;
type Fetcher = typeof fetch;
type CalendarItem = { calendarId: string; name: string; writable: boolean };
export type OwnerEvent = { id: string; summary: string; start: number; end: number; timezone: string; calendarId?: string };
const api = 'https://www.googleapis.com/calendar/v3';
const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

export async function queryFreeBusy(token: string, calendarIds: string[], window: Busy, fetcher: Fetcher = fetch): Promise<Busy[] | null> {
  if (!calendarIds.length || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start >= window.end) return null;
  const combined: Busy[] = [];
  try {
    for (let offset = 0; offset < calendarIds.length; offset += 50) {
      const selected = calendarIds.slice(offset, offset + 50);
      const response = await fetcher(`${api}/freeBusy`, { method: 'POST', headers: headers(token),
        body: JSON.stringify({ timeMin: new Date(window.start).toISOString(), timeMax: new Date(window.end).toISOString(),
          items: selected.map(id => ({ id })), calendarExpansionMax: 50 }), signal: AbortSignal.timeout(12_000), cache: 'no-store' });
      if (!response.ok) return null;
      const data: unknown = await response.json();
      if (!object(data) || !object(data.calendars)) return null;
      for (const id of selected) {
        const calendar = data.calendars[id];
        if (!object(calendar) || calendar.errors || !Array.isArray(calendar.busy)) return null;
        for (const interval of calendar.busy) {
          if (!object(interval) || typeof interval.start !== 'string' || typeof interval.end !== 'string') return null;
          const start = Date.parse(interval.start), end = Date.parse(interval.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
          combined.push({ start, end });
        }
      }
    }
    return combined;
  } catch { return null; }
}

export async function listCalendarPages(token: string, fetcher: Fetcher = fetch): Promise<CalendarItem[]> {
  const result: CalendarItem[] = [];
  const seen = new Set<string>();
  let pageToken = '';
  do {
    const params = new URLSearchParams({ maxResults: '250', showHidden: 'true' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetcher(`${api}/users/me/calendarList?${params}`, {
      headers: headers(token), signal: AbortSignal.timeout(12_000), cache: 'no-store',
    });
    if (!response.ok) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    const data: unknown = await response.json();
    if (!object(data) || (data.items !== undefined && !Array.isArray(data.items))) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    for (const item of (data.items ?? []) as unknown[]) {
      if (!object(item) || item.deleted || typeof item.id !== 'string') continue;
      result.push({ calendarId: item.id, name: typeof item.summary === 'string' ? item.summary : 'Calendar', writable: item.accessRole === 'owner' });
    }
    pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
    if (pageToken && seen.has(pageToken)) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    if (pageToken) seen.add(pageToken);
    if (seen.size > 100) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
  } while (pageToken);
  return result;
}

export async function getUserAvailability(userId: string, window: Busy): Promise<Availability> {
  const unknown: Availability = { memberId: userId, state: 'unknown', busy: [] };
  try {
    const grant = await getDb().calendarGrant.findUnique({ where: { userId }, include: { calendars: { where: { enabled: true } } } });
    const providers = await getDb().providerCalendarGrant.findMany({ where: { userId }, include: { calendars: { where: { enabled: true } } } });
    const selectedProviders = providers.filter(item => item.calendars.length > 0);
    const googleSelected = !!grant?.calendars.length;
    if ((!googleSelected && !selectedProviders.length) || (googleSelected && grant?.needsReconnect) || selectedProviders.some(item => item.needsReconnect)) return unknown;
    const combined: Busy[] = [];
    if (googleSelected && grant) {
      const busy = await queryFreeBusy(await getAccessToken(userId), grant.calendars.map(calendar => calendar.calendarId), window);
      if (busy === null) return unknown;
      combined.push(...busy);
    }
    const timezone = selectedProviders.some(item => item.provider === 'apple')
      ? (await getDb().user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone ?? 'UTC' : 'UTC';
    for (const provider of selectedProviders) {
      const ids = provider.calendars.map(calendar => calendar.calendarId);
      const busy = provider.provider === 'outlook' ? await queryOutlookBusy(await outlookAccessToken(userId), ids, window)
        : provider.provider === 'apple' ? await queryAppleBusy(decryptToken(provider.encryptedAccess, userId), ids, window, timezone) : null;
      if (busy === null) return unknown;
      combined.push(...busy);
    }
    return { memberId: userId, state: 'known', busy: combined };
  } catch { return unknown; }
}

export async function getCalendarStatus(userId: string) {
  const grant = await getDb().calendarGrant.findUnique({ where: { userId }, include: { calendars: { orderBy: { name: 'asc' } } } });
  const external = await getDb().providerCalendarGrant.findMany({ where: { userId }, include: { calendars: { orderBy: { name: 'asc' } } } });
  const providers = [
    { provider: 'google' as CalendarProvider, state: !grant ? 'disconnected' : grant.needsReconnect ? 'reconnect' : 'connected' },
    ...(['outlook', 'apple'] as const).map(provider => { const found = external.find(item => item.provider === provider);
      return { provider, state: !found ? 'disconnected' : found.needsReconnect ? 'reconnect' : 'connected' }; }),
  ];
  return {
    state: providers.every(item => item.state === 'disconnected') ? 'disconnected' : providers.some(item => item.state === 'reconnect') ? 'reconnect' : 'connected',
    canWrite: grant?.scopes.includes(OWNED_EVENTS_SCOPE) ?? false,
    providers,
    calendars: [
      ...(grant?.calendars.map(calendar => ({ id: calendar.calendarId, name: calendar.name, enabled: calendar.enabled, writable: calendar.writable, provider: 'google' as CalendarProvider })) ?? []),
      ...external.flatMap(item => item.calendars.map(calendar => ({ id: calendar.calendarId, name: calendar.name, enabled: calendar.enabled, writable: false, provider: item.provider as CalendarProvider }))),
    ],
  };
}

export async function selectCalendar(userId: string, calendarId: string, enabled: boolean): Promise<void> {
  const changed = await getDb().selectedCalendar.updateMany({ where: { calendarId, grant: { userId } }, data: { enabled } });
  if (!changed.count) throw new CalendarError('CALENDAR_NOT_FOUND', 404);
  await getDb().schedulingRequest.updateMany({ where: { participants: { some: { userId } }, state: { in: ['ready', 'selected'] } }, data: { state: 'retry_required' } });
}

function matchingEvent(data: unknown, event: OwnerEvent): data is { id: string; htmlLink?: string } {
  return object(data) && data.status !== 'cancelled' && data.id === event.id && data.summary === event.summary
    && object(data.start) && typeof data.start.dateTime === 'string' && Date.parse(data.start.dateTime) === event.start
    && object(data.end) && typeof data.end.dateTime === 'string' && Date.parse(data.end.dateTime) === event.end;
}

export async function insertCalendarEvent(token: string, calendarId: string, event: OwnerEvent, fetcher: Fetcher = fetch): Promise<{ id: string; htmlLink?: string; calendarId: string }> {
  if (!/^[0-9a-v]{5,1024}$/.test(event.id) || !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.start >= event.end) {
    throw new CalendarError('INVALID_EVENT', 422);
  }
  const path = `${api}/calendars/${encodeURIComponent(calendarId)}/events`;
  let response: Response | undefined;
  try {
    response = await fetcher(`${path}?sendUpdates=none`, { method: 'POST', headers: headers(token),
      body: JSON.stringify({ id: event.id, summary: event.summary,
        start: { dateTime: new Date(event.start).toISOString(), timeZone: event.timezone },
        end: { dateTime: new Date(event.end).toISOString(), timeZone: event.timezone } }),
      signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  } catch { /* Reconcile the deterministic identity before reporting an uncertain write. */ }
  if (response?.ok) {
    const data: unknown = await response.json();
    if (!object(data) || data.id !== event.id) throw new CalendarError('CALENDAR_WRITE_UNCERTAIN');
    return { id: event.id, calendarId, ...(typeof data.htmlLink === 'string' ? { htmlLink: data.htmlLink } : {}) };
  }
  if (response && response.status !== 409 && response.status < 500) {
    throw new CalendarError(response.status === 403 || response.status === 401 ? 'CALENDAR_WRITE_CONSENT_REQUIRED' : 'CALENDAR_WRITE_FAILED', response.status === 403 || response.status === 401 ? 403 : 503);
  }
  try {
    const found = await fetcher(`${path}/${encodeURIComponent(event.id)}`, { headers: headers(token), signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    const data: unknown = found.ok ? await found.json() : null;
    if (matchingEvent(data, event)) return { id: event.id, calendarId, ...(typeof data.htmlLink === 'string' ? { htmlLink: data.htmlLink } : {}) };
  } catch { /* Never retry insertion with a fresh ID after an ambiguous response. */ }
  throw new CalendarError('CALENDAR_WRITE_UNCERTAIN');
}

async function writableOwnerCalendar(userId: string, calendarId?: string) {
  const grant = await getDb().calendarGrant.findUnique({ where: { userId }, include: { calendars: true } });
  if (!grant || grant.needsReconnect) throw new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401);
  if (!grant.scopes.includes(OWNED_EVENTS_SCOPE)) throw new CalendarError('CALENDAR_WRITE_CONSENT_REQUIRED', 403);
  const calendar = grant.calendars.find(item => item.enabled && item.writable && (!calendarId || item.calendarId === calendarId));
  if (!calendar) throw new CalendarError('CALENDAR_WRITABLE_SELECTION_REQUIRED', 422);
  return calendar;
}

export async function addOwnerEvent(userId: string, event: OwnerEvent) {
  const calendar = await writableOwnerCalendar(userId, event.calendarId);
  return insertCalendarEvent(await getAccessToken(userId), calendar.calendarId, event);
}

/** Reconcile a frozen event action before checking whether its own event is busy. */
export async function lookupOwnerEvent(userId: string, event: OwnerEvent, fetcher: Fetcher = fetch): Promise<{ id: string; htmlLink?: string; calendarId: string } | null> {
  const calendar = await writableOwnerCalendar(userId, event.calendarId);
  const token = await getAccessToken(userId);
  try {
    const response = await fetcher(`${api}/calendars/${encodeURIComponent(calendar.calendarId)}/events/${encodeURIComponent(event.id)}`, {
      headers: headers(token), signal: AbortSignal.timeout(12_000), cache: 'no-store',
    });
    if (response.status === 404) return null;
    const data: unknown = response.ok ? await response.json() : null;
    if (matchingEvent(data, event)) return { id: event.id, calendarId: calendar.calendarId,
      ...(typeof data.htmlLink === 'string' ? { htmlLink: data.htmlLink } : {}) };
  } catch { /* A failed lookup is not proof that another insert is safe. */ }
  throw new CalendarError('CALENDAR_WRITE_UNCERTAIN');
}
