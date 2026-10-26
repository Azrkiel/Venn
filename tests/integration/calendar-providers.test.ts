import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
import { listOutlookCalendars, queryOutlookBusy, outlookOAuthConfig, outlookAccessToken } from '@/features/calendar/outlook';
import { parseAppleBusy, trustedAppleUrl, appleFetch } from '@/features/calendar/apple';
import { getDb } from '@/lib/db';
import { encryptToken, decryptToken } from '@/features/calendar/token-vault';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const window = { start: Date.parse('2030-01-15T00:00:00Z'), end: Date.parse('2030-01-16T00:00:00Z') };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Outlook calendar coverage', () => {
  it('discovers every calendar page without requesting event content', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ value: [{ id: 'personal', name: 'Personal' }],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?$skip=1' }))
      .mockResolvedValueOnce(json({ value: [{ id: 'work', name: 'Work' }] }));
    expect((await listOutlookCalendars('token', fetcher)).map(item => item.calendarId)).toEqual(['personal', 'work']);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('$select')).toBe('id,name');
  });
  it('combines selected calendars and ignores free or cancelled events', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ value: [
      { showAs: 'busy', start: { dateTime: '2030-01-15T12:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2030-01-15T13:00:00.0000000', timeZone: 'UTC' } },
      { showAs: 'free' }, { isCancelled: true },
    ] })).mockResolvedValueOnce(json({ value: [] }));
    expect(await queryOutlookBusy('token', ['personal', 'work'], window, fetcher)).toEqual([
      { start: Date.parse('2030-01-15T12:00:00Z'), end: Date.parse('2030-01-15T13:00:00Z') },
    ]);
    expect(String(fetcher.mock.calls[0][0])).not.toContain('subject');
  });
  it('returns unknown for partial errors, malformed events and unsafe paging links', async () => {
    for (const data of [{}, { value: [{ showAs: 'busy', start: { dateTime: 'wrong' }, end: {} }] },
      { value: [], '@odata.nextLink': 'https://attacker.test/steal' }]) {
      const fetcher = vi.fn().mockResolvedValue(json(data));
      expect(await queryOutlookBusy('token', ['work'], window, fetcher)).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    expect(await queryOutlookBusy('token', ['work'], window, vi.fn().mockResolvedValue(json({}, 403)))).toBeNull();
  });
  it('requires its own configured OAuth client', () => {
    vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_ID', ''); vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_SECRET', '');
    expect(() => outlookOAuthConfig()).toThrow('OUTLOOK_OAUTH_NOT_CONFIGURED');
  });
});

describe('Outlook encrypted token refresh', () => {
  function setup() {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_ID', 'client'); vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_SECRET', 'secret');
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
    const grant = { id: 'grant', encryptedAccess: encryptToken('old', 'u'), encryptedRefresh: encryptToken('refresh', 'u'), expiresAt: new Date(0), needsReconnect: false };
    const db = { providerCalendarGrant: { findUnique: vi.fn().mockResolvedValue(grant), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() } };
    vi.mocked(getDb).mockReturnValue(db as never);
    return { db, grant };
  }
  it('encrypts the refreshed access token and preserves an omitted refresh replacement', async () => {
    const { db } = setup();
    expect(await outlookAccessToken('u', vi.fn().mockResolvedValue(json({ access_token: 'new', expires_in: 3600, scope: 'Calendars.ReadBasic' })))).toBe('new');
    const writes = db.providerCalendarGrant.updateMany.mock.calls.map(call => call[0]);
    const stored = writes.find(call => call.data.encryptedAccess)?.data;
    expect(stored).toBeDefined();
    expect(decryptToken(stored.encryptedAccess, 'u')).toBe('new');
    expect(stored.encryptedRefresh).toBeUndefined();
    expect(writes.at(-1)?.data).toEqual({ refreshLockUntil: null });
  });
  it('does not overwrite credentials when the user reconnected during an in-flight refresh', async () => {
    const { db } = setup();
    db.providerCalendarGrant.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(outlookAccessToken('u', vi.fn().mockResolvedValue(json({ access_token: 'old-account', expires_in: 3600, scope: 'Calendars.ReadBasic' })))).rejects.toThrow('CALENDAR_REFRESH_UNAVAILABLE');
    expect(db.providerCalendarGrant.update).not.toHaveBeenCalled();
  });
});

describe('Apple iCloud calendar coverage', () => {
  it('parses expanded UTC events and excludes transparent or cancelled events', () => {
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20300115T120000Z\r\nDTEND:20300115T130000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:2\r\nTRANSP:TRANSPARENT\r\nDTSTART:20300115T150000Z\r\nDTEND:20300115T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(parseAppleBusy([ics], window)).toEqual([{ start: Date.parse('2030-01-15T12:00:00Z'), end: Date.parse('2030-01-15T13:00:00Z') }]);
    expect(parseAppleBusy([], window)).toEqual([]);
  });
  it('never calls an unexpanded recurrence or malformed calendar free', () => {
    expect(parseAppleBusy(['broken'], window)).toBeNull();
    expect(parseAppleBusy(['BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20300115T120000Z\r\nDTEND:20300115T130000Z\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT\r\nEND:VCALENDAR'], window)).toBeNull();
  });
  it('keeps iCloud credentials inside trusted HTTPS hosts', () => {
    expect(trustedAppleUrl('https://p123-caldav.icloud.com/123/calendars/')).toBe(true);
    for (const url of ['http://caldav.icloud.com', 'https://icloud.com.attacker.test', 'https://attacker.test', 'https://user:pass@caldav.icloud.com']) expect(trustedAppleUrl(url)).toBe(false);
  });
  it('blocks redirects that would send an app password outside iCloud', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://attacker.test/steal' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(appleFetch('https://caldav.icloud.com/', { headers: { Authorization: 'Basic private' } })).rejects.toThrow('APPLE_CALENDAR_HOST_INVALID');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
