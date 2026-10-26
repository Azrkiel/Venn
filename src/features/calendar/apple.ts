import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import { createDAVClient } from 'tsdav';
import type { Busy } from '@/features/scheduling/types';
import { CalendarError } from './errors';
import { saveProviderGrant } from './provider-store';

export function trustedAppleUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && /^(caldav\.icloud\.com|p\d+-caldav\.icloud\.com)$/.test(url.hostname);
  } catch { return false; }
}

/** Discovery and redirects must never forward an app password outside iCloud. */
export const appleFetch: typeof fetch = async (input, init) => {
  let url = input instanceof Request ? input.url : String(input);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (!trustedAppleUrl(url)) throw new CalendarError('APPLE_CALENDAR_HOST_INVALID');
    const response = await fetch(url, { ...init, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (![301, 302, 307, 308].includes(response.status)) {
      if (!response.ok) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
      return response;
    }
    const location = response.headers.get('location');
    if (!location) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    url = new URL(location, url).href;
  }
  throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
};

async function appleClient(username: string, password: string) {
  return createDAVClient({ serverUrl: 'https://caldav.icloud.com', credentials: { username, password },
    authMethod: 'Basic', defaultAccountType: 'caldav', fetch: appleFetch });
}

export async function connectApple(userId: string, username: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || username.length > 254 || !/^[a-z]{4}(?:-[a-z]{4}){3}$/i.test(password)) throw new CalendarError('APPLE_APP_PASSWORD_REQUIRED', 422);
  try {
    const client = await appleClient(username, password);
    const calendars = await client.fetchCalendars();
    if (!calendars.length || calendars.some(calendar => !trustedAppleUrl(calendar.url))) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    await saveProviderGrant(userId, 'apple', JSON.stringify({ username, password }), new Date('9999-01-01'),
      calendars.map(calendar => ({ calendarId: calendar.url, name: typeof calendar.displayName === 'string' ? calendar.displayName : 'iCloud calendar' })));
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    throw new CalendarError('APPLE_CONNECTION_FAILED', 422);
  }
}

export function parseAppleBusy(calendars: string[], window: Busy, timezone = 'UTC'): Busy[] | null {
  try {
    const busy: Busy[] = [];
    for (const data of calendars) {
      const component = new ICAL.Component(ICAL.parse(data));
      if (component.name !== 'vcalendar') return null;
      for (const item of component.getAllSubcomponents('vevent')) {
        if (item.getFirstPropertyValue('status') === 'CANCELLED' || item.getFirstPropertyValue('transp') === 'TRANSPARENT') continue;
        // The server must expand recurrence, including exceptions, inside the bounded query.
        if (item.hasProperty('rrule') || item.hasProperty('rdate')) return null;
        const event = new ICAL.Event(item);
        const millis = (time: ICAL.Time) => {
          if (!time) return Number.NaN;
          if (time.isDate || time.zone.tzid === 'floating') {
            const tzid = item.getFirstProperty('dtstart')?.getParameter('tzid');
            return DateTime.fromObject({ year: time.year, month: time.month, day: time.day,
              hour: time.hour, minute: time.minute, second: time.second }, { zone: typeof tzid === 'string' ? tzid : timezone }).toMillis();
          }
          return time.toJSDate().getTime();
        };
        const start = millis(event.startDate), end = millis(event.endDate);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
        if (start < window.end && end > window.start) busy.push({ start: Math.max(start, window.start), end: Math.min(end, window.end) });
      }
    }
    return busy;
  } catch { return null; }
}

export async function queryAppleBusy(credentials: string, ids: string[], window: Busy, timezone: string): Promise<Busy[] | null> {
  if (!ids.length || ids.some(id => !trustedAppleUrl(id)) || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start >= window.end) return null;
  try {
    const parsed: unknown = JSON.parse(credentials);
    if (!parsed || typeof parsed !== 'object' || !('username' in parsed) || !('password' in parsed)
      || typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null;
    const client = await appleClient(parsed.username, parsed.password);
    const available = await client.fetchCalendars();
    const objects: string[] = [];
    for (const id of ids) {
      const calendar = available.find(calendar => calendar.url === id);
      if (!calendar) return null;
      const events = await client.fetchCalendarObjects({ calendar, expand: true, useMultiGet: false,
        timeRange: { start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() } });
      for (const event of events) {
        if (typeof event.data !== 'string') return null;
        objects.push(event.data);
      }
    }
    return parseAppleBusy(objects, window, timezone);
  } catch { return null; }
}
