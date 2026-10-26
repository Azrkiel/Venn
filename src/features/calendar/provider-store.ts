import { getDb } from '@/lib/db';
import { encryptToken } from './token-vault';
import { CalendarError } from './errors';

export type CalendarProvider = 'google' | 'outlook' | 'apple';
export type ProviderCalendarItem = { calendarId: string; name: string };
export const providerNames: Record<CalendarProvider, string> = { google: 'Google Calendar', outlook: 'Microsoft Outlook', apple: 'Apple iCloud' };

export async function selectProviderCalendar(userId: string, provider: 'outlook' | 'apple', calendarId: string, enabled: boolean) {
  const changed = await getDb().providerCalendar.updateMany({ where: { calendarId, grant: { userId, provider } }, data: { enabled } });
  if (!changed.count) throw new CalendarError('CALENDAR_NOT_FOUND', 404);
  await invalidateCalendarChecks(userId);
}

export async function disconnectProvider(userId: string, provider: 'outlook' | 'apple') {
  await getDb().$transaction([
    getDb().providerCalendarGrant.deleteMany({ where: { userId, provider } }),
    getDb().oAuthState.deleteMany({ where: { userId, purpose: provider } }),
    getDb().schedulingRequest.updateMany({ where: { OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
      state: { in: ['ready', 'selected'] } }, data: { state: 'retry_required' } }),
  ]);
}

export async function invalidateCalendarChecks(userId: string) {
  await getDb().schedulingRequest.updateMany({ where: { OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
    state: { in: ['ready', 'selected'] } }, data: { state: 'retry_required' } });
}

export async function saveProviderGrant(userId: string, provider: 'outlook' | 'apple', access: string,
  expiresAt: Date, calendars: ProviderCalendarItem[], refresh?: string) {
  // A deliberate reconnect starts with no selected calendars: never silently check another account.
  const data = { encryptedAccess: encryptToken(access, userId), expiresAt, needsReconnect: false, refreshLockUntil: null,
    encryptedRefresh: refresh ? encryptToken(refresh, userId) : null };
  await getDb().$transaction(async db => {
    const grant = await db.providerCalendarGrant.upsert({ where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...data }, update: data });
    await db.providerCalendar.deleteMany({ where: { grantId: grant.id } });
    await db.providerCalendar.createMany({ data: calendars.map(calendar => ({ grantId: grant.id, ...calendar, enabled: false })) });
    await db.schedulingRequest.updateMany({ where: { OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
      state: { in: ['ready', 'selected'] } }, data: { state: 'retry_required' } });
  });
}
