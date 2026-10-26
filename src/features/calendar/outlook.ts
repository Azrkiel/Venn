import { DateTime } from 'luxon';
import { getDb } from '@/lib/db';
import type { Busy } from '@/features/scheduling/types';
import { safeSharedReturnPath } from '@/features/identity/return-path';
import { createHash } from 'node:crypto';
import { CalendarError } from './errors';
import { createPkce, consumeOAuthState } from './oauth';
import { encryptToken, decryptToken } from './token-vault';
import { saveProviderGrant, type ProviderCalendarItem } from './provider-store';

const graph = 'https://graph.microsoft.com/v1.0';
const authority = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const scope = 'offline_access https://graph.microsoft.com/Calendars.ReadBasic';
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);

export function outlookOAuthConfig() {
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim();
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim();
  const base = process.env.APP_BASE_URL?.trim() || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  if (!clientId || !clientSecret || !base) throw new CalendarError('OUTLOOK_OAUTH_NOT_CONFIGURED');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new CalendarError('OUTLOOK_OAUTH_NOT_CONFIGURED');
  return { clientId, clientSecret, redirectUri: `${url.origin}/api/calendar/outlook/callback` };
}

export async function beginOutlookConnection(userId: string, returnTo?: string) {
  const config = outlookOAuthConfig(), pkce = createPkce();
  await getDb().oAuthState.create({ data: { userId, stateDigest: createHash('sha256').update(pkce.state).digest('hex'),
    encryptedVerifier: encryptToken(JSON.stringify({ verifier: pkce.verifier, returnTo: safeSharedReturnPath(returnTo) }), userId),
    purpose: 'outlook', expiresAt: new Date(Date.now() + 600_000) } });
  return `${authority}/authorize?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', response_mode: 'query', scope, state: pkce.state, code_challenge: pkce.challenge,
    code_challenge_method: 'S256', prompt: 'select_account' })}`;
}

async function exchange(body: Record<string, string>, fetcher: typeof fetch) {
  const config = outlookOAuthConfig();
  const response = await fetcher(`${authority}/token`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope, ...body }) });
  const data: unknown = await response.json();
  if (!response.ok) throw new CalendarError(object(data) && data.error === 'invalid_grant' ? 'CALENDAR_RECONNECT_REQUIRED' : 'CALENDAR_REFRESH_UNAVAILABLE');
  if (!object(data) || typeof data.access_token !== 'string' || !data.access_token || typeof data.expires_in !== 'number'
    || data.expires_in < 1 || data.expires_in > 86_400) throw new CalendarError('CALENDAR_TOKEN_RESPONSE_INVALID');
  if (typeof data.scope !== 'string' || !data.scope.split(/\s+/).some(value => /^(https:\/\/graph.microsoft.com\/)?Calendars.ReadBasic$/i.test(value))) throw new CalendarError('CALENDAR_SCOPES_NOT_GRANTED', 403);
  return { access: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000),
    refresh: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : undefined };
}

export async function finishOutlookConnection(userId: string, code: string, state: string, fetcher: typeof fetch = fetch) {
  const saved = await consumeOAuthState(userId, state);
  if (saved.purpose !== 'outlook') throw new CalendarError('INVALID_CALENDAR_STATE', 400);
  if (!code || code.length > 4096) throw new CalendarError('INVALID_CALENDAR_CODE', 400);
  const tokens = await exchange({ grant_type: 'authorization_code', code, code_verifier: saved.verifier,
    redirect_uri: outlookOAuthConfig().redirectUri }, fetcher);
  if (!tokens.refresh) throw new CalendarError('CALENDAR_SCOPES_NOT_GRANTED', 403);
  const calendars = await listOutlookCalendars(tokens.access, fetcher);
  await saveProviderGrant(userId, 'outlook', tokens.access, tokens.expiresAt, calendars, tokens.refresh);
  return saved.returnTo;
}

export async function outlookAccessToken(userId: string, fetcher: typeof fetch = fetch) {
  const db = getDb(), where = { userId_provider: { userId, provider: 'outlook' } };
  const grant = await db.providerCalendarGrant.findUnique({ where });
  if (!grant || grant.needsReconnect) throw new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401);
  if (grant.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(grant.encryptedAccess, userId);
  if (!grant.encryptedRefresh) throw new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401);
  const lockUntil = new Date(Date.now() + 30_000);
  const locked = await db.providerCalendarGrant.updateMany({ where: { id: grant.id,
    OR: [{ refreshLockUntil: null }, { refreshLockUntil: { lt: new Date() } }] }, data: { refreshLockUntil: lockUntil } });
  if (locked.count !== 1) throw new CalendarError('CALENDAR_REFRESH_UNAVAILABLE');
  try {
    const tokens = await exchange({ grant_type: 'refresh_token', refresh_token: decryptToken(grant.encryptedRefresh, userId) }, fetcher);
    const updated = await db.providerCalendarGrant.updateMany({ where: { id: grant.id, encryptedRefresh: grant.encryptedRefresh, refreshLockUntil: lockUntil }, data: { encryptedAccess: encryptToken(tokens.access, userId), expiresAt: tokens.expiresAt,
      ...(tokens.refresh ? { encryptedRefresh: encryptToken(tokens.refresh, userId) } : {}) } });
    if (updated.count !== 1) throw new CalendarError('CALENDAR_REFRESH_UNAVAILABLE');
    return tokens.access;
  } catch (error) {
    if (error instanceof CalendarError && error.code === 'CALENDAR_RECONNECT_REQUIRED') await db.providerCalendarGrant.updateMany({
      where: { id: grant.id, encryptedRefresh: grant.encryptedRefresh, refreshLockUntil: lockUntil }, data: { needsReconnect: true } });
    throw error;
  } finally { await db.providerCalendarGrant.updateMany({ where: { id: grant.id, refreshLockUntil: lockUntil }, data: { refreshLockUntil: null } }); }
}

async function graphPages(url: string, token: string, fetcher: typeof fetch): Promise<ObjectValue[]> {
  const items: ObjectValue[] = [], seen = new Set<string>();
  while (url) {
    const target = new URL(url);
    if (target.origin !== 'https://graph.microsoft.com' || !target.pathname.startsWith('/v1.0/me/') || target.username || target.password
      || seen.has(url) || seen.size >= 100) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    seen.add(url);
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) {
      // Only Graph's error code is logged; bodies can echo account details.
      const failure: unknown = await response.json().catch(() => null);
      const code = object(failure) && object(failure.error) && typeof failure.error.code === 'string' ? failure.error.code.slice(0, 80) : 'unknown';
      // Graph explains 401s in WWW-Authenticate (error codes and descriptions, never token values).
      const challenge = response.headers.get('www-authenticate')?.replace(/authorization_uri="[^"]*"/g, '').slice(0, 300) ?? '';
      console.warn('[outlook] graph_request_failed', { status: response.status, code, challenge });
      // Microsoft accounts made with another provider's email address have no Outlook mailbox or calendar.
      if (code === 'MailboxNotEnabledForRESTAPI' || code === 'MailboxNotSupportedForRESTAPI') throw new CalendarError('OUTLOOK_MAILBOX_UNAVAILABLE', 409);
      throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    }
    const data: unknown = await response.json();
    if (!object(data) || !Array.isArray(data.value) || !data.value.every(object)) throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    items.push(...data.value);
    if (data['@odata.nextLink'] !== undefined && typeof data['@odata.nextLink'] !== 'string') throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    url = typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : '';
  }
  return items;
}

export async function listOutlookCalendars(token: string, fetcher: typeof fetch = fetch): Promise<ProviderCalendarItem[]> {
  const items = await graphPages(`${graph}/me/calendars?${new URLSearchParams({ '$select': 'id,name', '$top': '100' })}`, token, fetcher);
  return items.map(item => {
    if (typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') throw new CalendarError('CALENDAR_LIST_UNAVAILABLE');
    return { calendarId: item.id, name: item.name };
  });
}

export async function queryOutlookBusy(token: string, ids: string[], window: Busy, fetcher: typeof fetch = fetch): Promise<Busy[] | null> {
  if (!ids.length || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start >= window.end) return null;
  try {
    const busy: Busy[] = [];
    for (const id of ids) {
      const params = new URLSearchParams({ startDateTime: new Date(window.start).toISOString(), endDateTime: new Date(window.end).toISOString(),
        '$select': 'start,end,showAs,isCancelled', '$top': '1000' });
      for (const event of await graphPages(`${graph}/me/calendars/${encodeURIComponent(id)}/calendarView?${params}`, token, fetcher)) {
        if (event.isCancelled === true || event.showAs === 'free') continue;
        if (!['busy', 'tentative', 'oof', 'workingElsewhere'].includes(String(event.showAs)) || !object(event.start) || !object(event.end)
          || typeof event.start.dateTime !== 'string' || typeof event.end.dateTime !== 'string'
          || event.start.timeZone !== 'UTC' || event.end.timeZone !== 'UTC') return null;
        const start = DateTime.fromISO(event.start.dateTime, { zone: 'UTC' }).toMillis(), end = DateTime.fromISO(event.end.dateTime, { zone: 'UTC' }).toMillis();
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
        if (start < window.end && end > window.start) busy.push({ start: Math.max(start, window.start), end: Math.min(end, window.end) });
      }
    }
    return busy;
  } catch { return null; }
}
