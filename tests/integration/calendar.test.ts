import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
import { queryFreeBusy, listCalendarPages, insertCalendarEvent, lookupOwnerEvent, addOwnerEvent } from '@/features/calendar/client';
import { getAccessToken, OWNED_EVENTS_SCOPE } from '@/features/calendar/oauth';
import { encryptToken, decryptToken } from '@/features/calendar/token-vault';
import { getDb } from '@/lib/db';

afterEach(() => vi.unstubAllEnvs());

const window = { start: Date.parse('2026-10-25T11:00:00Z'), end: Date.parse('2026-10-25T14:00:00Z') };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('Google availability adapter', () => {
  it('requires a response for every selected calendar', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ calendars: { primary: { busy: [] } } }));
    expect(await queryFreeBusy('token', ['primary', 'work'], window, fetcher)).toBeNull();
  });
  it('makes partial calendar errors unknown rather than free', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ calendars: {
      primary: { busy: [] }, work: { errors: [{ reason: 'internalError' }] },
    } }));
    expect(await queryFreeBusy('token', ['primary', 'work'], window, fetcher)).toBeNull();
  });
  it('combines known selected calendars without reading event titles', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ calendars: {
      primary: { busy: [{ start: '2026-10-25T12:00:00Z', end: '2026-10-25T13:00:00Z' }] },
      work: { busy: [] },
    } }));
    expect(await queryFreeBusy('token', ['primary', 'work'], window, fetcher)).toEqual([
      { start: Date.parse('2026-10-25T12:00:00Z'), end: Date.parse('2026-10-25T13:00:00Z') },
    ]);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://www.googleapis.com/calendar/v3/freeBusy');
    expect(String(fetcher.mock.calls[0][1].body)).not.toContain('events');
  });
  it('rejects no selected calendars and malformed intervals', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ calendars: { primary: { busy: [{ start: 'wrong', end: 'wrong' }] } } }));
    expect(await queryFreeBusy('token', [], window, fetcher)).toBeNull();
    expect(await queryFreeBusy('token', ['primary'], window, fetcher)).toBeNull();
  });
  it('treats denied or timed-out provider requests as unknown', async () => {
    expect(await queryFreeBusy('token', ['primary'], window, vi.fn().mockResolvedValue(json({}, 403)))).toBeNull();
    expect(await queryFreeBusy('token', ['primary'], window, vi.fn().mockRejectedValue(new Error('timeout')))).toBeNull();
  });
  it('enumerates every calendar-list page and excludes deleted entries', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ items: [{ id: 'a', summary: 'Personal', accessRole: 'owner' }], nextPageToken: 'next' }))
      .mockResolvedValueOnce(json({ items: [{ id: 'b', summary: 'Work', accessRole: 'reader' }, { id: 'gone', deleted: true }] }));
    const calendars = await listCalendarPages('token', fetcher);
    expect(calendars.map(calendar => calendar.calendarId)).toEqual(['a', 'b']);
    expect(calendars.map(calendar => calendar.writable)).toEqual([true, false]);
    expect(String(fetcher.mock.calls[1][0])).toContain('pageToken=next');
  });
});

describe('explicit owner event adapter', () => {
  const event = { id: 'abc012', summary: 'Lunch', start: window.start, end: window.end, timezone: 'Europe/London' };
  it('creates only the requested owner event without attendee invitations', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: event.id, htmlLink: 'https://calendar.google.com/event' }));
    expect((await insertCalendarEvent('token', 'primary', event, fetcher)).id).toBe(event.id);
    const sent = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(sent.attendees).toBeUndefined();
    expect(String(fetcher.mock.calls[0][0])).toContain('sendUpdates=none');
  });
  it('reconciles a provider timeout by the same deterministic event ID', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(json({
      id: event.id, summary: event.summary,
      start: { dateTime: new Date(event.start).toISOString() }, end: { dateTime: new Date(event.end).toISOString() },
    }));
    expect((await insertCalendarEvent('token', 'primary', event, fetcher)).id).toBe(event.id);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain(`/events/${event.id}`);
  });
  it('rejects an existing event with different content', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 409)).mockResolvedValueOnce(json({ id: event.id, summary: 'Other' }));
    await expect(insertCalendarEvent('token', 'primary', event, fetcher)).rejects.toThrow('CALENDAR_WRITE_UNCERTAIN');
  });
});

describe('server-side Calendar token lifecycle', () => {
  function setupGrant(expiresAt = new Date(0)) {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.stubEnv('AUTH_GOOGLE_ID', 'test-client');
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-secret');
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
    const grant = { encryptedAccess: encryptToken('old-access', 'u'), encryptedRefresh: encryptToken('keep-refresh', 'u'),
      expiresAt, needsReconnect: false, refreshLockUntil: null };
    const db = { calendarGrant: { findUnique: vi.fn().mockResolvedValue(grant),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}) } };
    vi.mocked(getDb).mockReturnValue(db as never);
    return { db, grant };
  }
  it('keeps valid access server-side without a provider call', async () => {
    setupGrant(new Date(Date.now() + 3600_000));
    const fetcher = vi.fn();
    expect(await getAccessToken('u', fetcher)).toBe('old-access');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves an existing refresh token when Google returns no replacement', async () => {
    const { db } = setupGrant();
    const fetcher = vi.fn().mockResolvedValue(json({ access_token: 'new-access', expires_in: 3600 }));
    expect(await getAccessToken('u', fetcher)).toBe('new-access');
    const written = db.calendarGrant.update.mock.calls[0][0].data;
    expect(written.encryptedRefresh).toBeUndefined();
    expect(written.encryptedAccess).not.toContain('new-access');
    expect(decryptToken(written.encryptedAccess, 'u')).toBe('new-access');
    expect(db.calendarGrant.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { refreshLockUntil: null } }));
  });
  it('marks revoked grants as reconnect-required and releases its refresh lock', async () => {
    const { db } = setupGrant();
    await expect(getAccessToken('u', vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400))))
      .rejects.toThrow('CALENDAR_RECONNECT_REQUIRED');
    expect(db.calendarGrant.update).toHaveBeenCalledWith({ where: { userId: 'u' }, data: { needsReconnect: true } });
    expect(db.calendarGrant.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { refreshLockUntil: null } }));
  });
  it('does not mark a temporary provider outage as revoked consent', async () => {
    const { db } = setupGrant();
    await expect(getAccessToken('u', vi.fn().mockResolvedValue(json({ error: 'temporarily_unavailable' }, 503))))
      .rejects.toThrow('CALENDAR_REFRESH_UNAVAILABLE');
    expect(db.calendarGrant.update).not.toHaveBeenCalled();
  });
});

describe('frozen owner-event reconciliation', () => {
  const event = { id: 'abc012', summary: 'Lunch', start: window.start, end: window.end, timezone: 'Europe/London', calendarId: 'frozen-calendar' };
  function setupOwner() {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    const grant = { encryptedAccess: encryptToken('owner-access', 'owner'), expiresAt: new Date(Date.now() + 3600_000),
      needsReconnect: false, scopes: [OWNED_EVENTS_SCOPE], calendars: [
        { calendarId: 'other-calendar', enabled: true, writable: true },
        { calendarId: 'frozen-calendar', enabled: true, writable: true },
      ] };
    const db = { calendarGrant: { findUnique: vi.fn().mockResolvedValue(grant) } };
    vi.mocked(getDb).mockReturnValue(db as never);
    return { db, grant };
  }
  it('returns null only for a confirmed missing event on the frozen calendar', async () => {
    setupOwner();
    const fetcher = vi.fn().mockResolvedValue(json({}, 404));
    expect(await lookupOwnerEvent('owner', event, fetcher)).toBeNull();
    expect(String(fetcher.mock.calls[0][0])).toContain('/calendars/frozen-calendar/events/abc012');
  });
  it('reconciles an exact already-created event before another conflict check', async () => {
    setupOwner();
    const fetcher = vi.fn().mockResolvedValue(json({ id: event.id, summary: event.summary,
      start: { dateTime: new Date(event.start).toISOString() }, end: { dateTime: new Date(event.end).toISOString() },
      htmlLink: 'https://calendar.google.com/receipt' }));
    expect(await lookupOwnerEvent('owner', event, fetcher)).toEqual({ id: event.id, calendarId: 'frozen-calendar', htmlLink: 'https://calendar.google.com/receipt' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not treat mismatched content or a failed lookup as permission to insert again', async () => {
    setupOwner();
    await expect(lookupOwnerEvent('owner', event, vi.fn().mockResolvedValue(json({ id: event.id, summary: 'Other event' }))))
      .rejects.toThrow('CALENDAR_WRITE_UNCERTAIN');
    await expect(lookupOwnerEvent('owner', event, vi.fn().mockResolvedValue(json({}, 503))))
      .rejects.toThrow('CALENDAR_WRITE_UNCERTAIN');
  });
  it('rejects a frozen calendar that is no longer selected and writable', async () => {
    const { grant } = setupOwner();
    grant.calendars[1].enabled = false;
    await expect(lookupOwnerEvent('owner', event, vi.fn())).rejects.toThrow('CALENDAR_WRITABLE_SELECTION_REQUIRED');
    await expect(addOwnerEvent('owner', event)).rejects.toThrow('CALENDAR_WRITABLE_SELECTION_REQUIRED');
  });
});
