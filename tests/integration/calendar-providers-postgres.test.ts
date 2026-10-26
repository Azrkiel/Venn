import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { saveProviderGrant, selectProviderCalendar, disconnectProvider } from '@/features/calendar/provider-store';
import { getCalendarStatus, getUserAvailability } from '@/features/calendar/client';
import { decryptToken, encryptToken } from '@/features/calendar/token-vault';

describe.skipIf(process.env.VENN_DATABASE_TESTS !== '1')('calendar providers with real Postgres', () => {
  let userId: string;
  beforeEach(async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    userId = (await getDb().user.create({ data: { name: 'Calendar provider test' } })).id;
  });
  afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); if (userId) await getDb().user.delete({ where: { id: userId } }); });
  afterAll(async () => { await getDb().$disconnect(); });
  const expires = () => new Date(Date.now() + 3_600_000);

  it('encrypts independent grants and scopes selection and disconnection to the viewer and provider', async () => {
    await saveProviderGrant(userId, 'outlook', 'private-outlook-token', expires(), [{ calendarId: 'same', name: 'Outlook work' }], 'private-refresh');
    await saveProviderGrant(userId, 'apple', 'private-apple-credentials', expires(), [{ calendarId: 'same', name: 'iCloud home' }]);
    const stored = await getDb().providerCalendarGrant.findMany({ where: { userId } });
    expect(JSON.stringify(stored)).not.toContain('private-');
    expect(decryptToken(stored.find(item => item.provider === 'outlook')!.encryptedAccess, userId)).toBe('private-outlook-token');
    expect((await getCalendarStatus(userId)).calendars.every(item => !item.enabled)).toBe(true);
    await selectProviderCalendar(userId, 'outlook', 'same', true);
    const selected = (await getCalendarStatus(userId)).calendars;
    expect(selected.find(item => item.provider === 'outlook')?.enabled).toBe(true);
    expect(selected.find(item => item.provider === 'apple')?.enabled).toBe(false);
    await expect(selectProviderCalendar('other-user', 'outlook', 'same', true)).rejects.toThrow('CALENDAR_NOT_FOUND');
    await disconnectProvider(userId, 'outlook');
    expect((await getCalendarStatus(userId)).calendars.map(item => item.provider)).toEqual(['apple']);
  });
  it('combines selected Google and Outlook busy ranges and marks partial failures unknown', async () => {
    await getDb().calendarGrant.create({ data: { userId, encryptedAccess: encryptToken('google-access', userId), expiresAt: expires(), scopes: [],
      calendars: { create: { calendarId: 'primary', name: 'Google', enabled: true } } } });
    await saveProviderGrant(userId, 'outlook', 'outlook-access', expires(), [{ calendarId: 'work', name: 'Work' }]);
    await selectProviderCalendar(userId, 'outlook', 'work', true);
    const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('googleapis')
      ? { calendars: { primary: { busy: [{ start: '2030-01-15T12:00:00Z', end: '2030-01-15T13:00:00Z' }] } } }
      : { value: [{ showAs: 'busy', start: { dateTime: '2030-01-15T14:00:00', timeZone: 'UTC' }, end: { dateTime: '2030-01-15T15:00:00', timeZone: 'UTC' } }] }))));
    vi.stubGlobal('fetch', fetcher);
    const window = { start: Date.parse('2030-01-15T00:00:00Z'), end: Date.parse('2030-01-16T00:00:00Z') };
    const known = await getUserAvailability(userId, window);
    expect(known.state).toBe('known'); expect(known.busy).toHaveLength(2);
    fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
    expect(await getUserAvailability(userId, window)).toEqual({ memberId: userId, state: 'unknown', busy: [] });
  });
});
