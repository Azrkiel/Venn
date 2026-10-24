import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { encryptToken, decryptToken } from './token-vault';
import { CalendarError } from './errors';

export const FREEBUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.events.freebusy';
export const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const OWNED_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const baseScopes = ['openid', FREEBUSY_SCOPE, CALENDAR_LIST_SCOPE];
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
type Tokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function calendarOAuthConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || process.env.AUTH_GOOGLE_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || process.env.AUTH_GOOGLE_SECRET?.trim();
  const base = process.env.APP_BASE_URL?.trim() || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  if (!clientId || !clientSecret || !base) throw new CalendarError('CALENDAR_OAUTH_NOT_CONFIGURED');
  let url: URL;
  try { url = new URL(base); } catch { throw new CalendarError('CALENDAR_OAUTH_NOT_CONFIGURED'); }
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new CalendarError('CALENDAR_OAUTH_NOT_CONFIGURED');
  }
  return { clientId, clientSecret, baseUrl: url.origin,
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || `${url.origin}/api/calendar/callback` };
}

export function createPkce() {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { state, verifier, challenge };
}

export async function beginCalendarConnection(userId: string, requestId?: string): Promise<string> {
  const config = calendarOAuthConfig();
  if (requestId) {
    const request = await getDb().schedulingRequest.findFirst({ where: { id: requestId, ownerId: userId,
      state: 'selected', expiresAt: { gt: new Date() }, selectedSlotId: { not: null } }, select: { id: true } });
    if (!request) throw new CalendarError('INVALID_EVENT_ACTION', 409);
  }
  const pkce = createPkce();
  await getDb().oAuthState.create({ data: { stateDigest: digest(pkce.state), userId,
    encryptedVerifier: encryptToken(pkce.verifier, userId), purpose: requestId ? 'write' : 'calendar',
    requestId: requestId ?? null, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', scope: [...baseScopes, ...(requestId ? [OWNED_EVENTS_SCOPE] : [])].join(' '),
    state: pkce.state, code_challenge: pkce.challenge, code_challenge_method: 'S256',
    access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent' });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function consumeOAuthState(userId: string, state: string) {
  if (!state || state.length > 256) throw new CalendarError('INVALID_CALENDAR_STATE', 400);
  const db = getDb();
  const saved = await db.oAuthState.findUnique({ where: { stateDigest: digest(state) } });
  if (!saved || saved.userId !== userId || saved.expiresAt <= new Date()) throw new CalendarError('INVALID_CALENDAR_STATE', 400);
  const consumed = await db.oAuthState.deleteMany({ where: { id: saved.id, userId, expiresAt: { gt: new Date() } } });
  if (consumed.count !== 1) throw new CalendarError('INVALID_CALENDAR_STATE', 400);
  return { verifier: decryptToken(saved.encryptedVerifier, userId), purpose: saved.purpose, requestId: saved.requestId };
}

function parseTokens(value: unknown): Tokens {
  if (!value || typeof value !== 'object') throw new CalendarError('CALENDAR_TOKEN_RESPONSE_INVALID');
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== 'string' || !token.access_token
    || typeof token.expires_in !== 'number' || token.expires_in < 1 || token.expires_in > 86_400) {
    throw new CalendarError('CALENDAR_TOKEN_RESPONSE_INVALID');
  }
  return { access_token: token.access_token, expires_in: token.expires_in,
    ...(typeof token.refresh_token === 'string' && token.refresh_token ? { refresh_token: token.refresh_token } : {}),
    ...(typeof token.scope === 'string' ? { scope: token.scope } : {}) };
}

export async function finishCalendarConnection(userId: string, code: string, state: string, fetcher: typeof fetch = fetch) {
  const saved = await consumeOAuthState(userId, state);
  if (!code || code.length > 4096) throw new CalendarError('INVALID_CALENDAR_CODE', 400);
  const config = calendarOAuthConfig();
  const response = await fetcher(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: 'authorization_code', code, code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  if (!response.ok) throw new CalendarError('CALENDAR_CONSENT_EXCHANGE_FAILED');
  const tokens = parseTokens(await response.json());
  // A separate consent screen must not silently attach another Google account.
  const account = await getDb().account.findFirst({ where: { userId, provider: 'google' }, select: { providerAccountId: true } });
  const identityResponse = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  const identity: unknown = identityResponse.ok ? await identityResponse.json() : null;
  if (!account || !identity || typeof identity !== 'object' || !('sub' in identity) || identity.sub !== account.providerAccountId) {
    throw new CalendarError('CALENDAR_ACCOUNT_MISMATCH', 403);
  }
  const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];
  if (!baseScopes.every(scope => scopes.includes(scope))) throw new CalendarError('CALENDAR_SCOPES_NOT_GRANTED', 403);
  const encryptedAccess = encryptToken(tokens.access_token, userId);
  const data = { encryptedAccess, expiresAt: new Date(Date.now() + tokens.expires_in * 1000), scopes,
    needsReconnect: false, refreshLockUntil: null, ...(tokens.refresh_token ? { encryptedRefresh: encryptToken(tokens.refresh_token, userId) } : {}) };
  await getDb().calendarGrant.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  // Loading the calendar list is read-only; the user selects coverage on setup.
  const { listCalendarPages } = await import('./client');
  const calendars = await listCalendarPages(tokens.access_token, fetcher);
  const grant = await getDb().calendarGrant.findUniqueOrThrow({ where: { userId }, select: { id: true } });
  await getDb().$transaction(calendars.map(calendar => getDb().selectedCalendar.upsert({
    where: { grantId_calendarId: { grantId: grant.id, calendarId: calendar.calendarId } },
    create: { grantId: grant.id, ...calendar, enabled: false }, update: { name: calendar.name, writable: calendar.writable },
  })));
  return { requestId: saved.requestId, writeGranted: scopes.includes(OWNED_EVENTS_SCOPE) };
}

export async function getAccessToken(userId: string, fetcher: typeof fetch = fetch): Promise<string> {
  const db = getDb();
  let grant = await db.calendarGrant.findUnique({ where: { userId } });
  if (!grant || grant.needsReconnect) throw new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401);
  if (grant.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(grant.encryptedAccess, userId);
  if (!grant.encryptedRefresh) {
    await db.calendarGrant.update({ where: { userId }, data: { needsReconnect: true } });
    throw new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401);
  }
  const lockUntil = new Date(Date.now() + 20_000);
  const acquired = await db.calendarGrant.updateMany({ where: { userId, needsReconnect: false,
    OR: [{ refreshLockUntil: null }, { refreshLockUntil: { lt: new Date() } }] }, data: { refreshLockUntil: lockUntil } });
  if (!acquired.count) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      grant = await db.calendarGrant.findUnique({ where: { userId } });
      if (grant && !grant.needsReconnect && grant.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(grant.encryptedAccess, userId);
    }
    throw new CalendarError('CALENDAR_REFRESH_IN_PROGRESS');
  }
  try {
    const config = calendarOAuthConfig();
    const response = await fetcher(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        grant_type: 'refresh_token', refresh_token: decryptToken(grant.encryptedRefresh, userId) }),
      signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      if (error && typeof error === 'object' && 'error' in error && error.error === 'invalid_grant') {
        await db.calendarGrant.update({ where: { userId }, data: { needsReconnect: true } });
        throw new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401);
      }
      throw new CalendarError('CALENDAR_REFRESH_UNAVAILABLE');
    }
    const tokens = parseTokens(await response.json());
    await db.calendarGrant.update({ where: { userId }, data: { encryptedAccess: encryptToken(tokens.access_token, userId),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      ...(tokens.refresh_token ? { encryptedRefresh: encryptToken(tokens.refresh_token, userId) } : {}),
      ...(tokens.scope ? { scopes: tokens.scope.split(/\s+/) } : {}), needsReconnect: false } });
    return tokens.access_token;
  } finally {
    await db.calendarGrant.updateMany({ where: { userId, refreshLockUntil: lockUntil }, data: { refreshLockUntil: null } });
  }
}

export async function revokeCalendar(userId: string, fetcher: typeof fetch = fetch) {
  const db = getDb();
  const grant = await db.calendarGrant.findUnique({ where: { userId } });
  let providerRevoked = !grant;
  if (grant) {
    try {
      const token = decryptToken(grant.encryptedRefresh ?? grant.encryptedAccess, userId);
      const response = await fetcher('https://oauth2.googleapis.com/revoke', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(12_000) });
      providerRevoked = response.ok;
    } catch { /* Local revocation still blocks all future Venn calendar use. */ }
  }
  await db.$transaction([
    db.schedulingRequest.updateMany({ where: { OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
      state: { in: ['ready', 'selected'] } }, data: { state: 'retry_required' } }),
    db.calendarGrant.deleteMany({ where: { userId } }),
    db.oAuthState.deleteMany({ where: { userId } }),
  ]);
  return { providerRevoked };
}
