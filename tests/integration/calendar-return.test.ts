import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
vi.mock('@/auth', () => ({ currentUserId: vi.fn(), loginConfigured: vi.fn(() => true), signIn: vi.fn(), signOut: vi.fn() }));
import * as authentication from '@/auth';
import * as calendarOAuth from '@/features/calendar/oauth';
import * as calendarClient from '@/features/calendar/client';
import * as transport from '@/features/messaging/transport';
import { getDb } from '@/lib/db';
import { decryptToken, encryptToken } from '@/features/calendar/token-vault';
import { safeSharedReturnPath, safeSignupReturnPath, setupReturnPath } from '@/features/identity/return-path';
import { POST as connect } from '@/app/api/calendar/connect/route';
import { GET as callback } from '@/app/api/calendar/callback/route';
import { POST as selectCalendar } from '@/app/api/calendar/selection/route';
import SignupPage from '@/app/signup/page';
import SetupPage from '@/app/setup/page';

const shared = `/r/${'s'.repeat(43)}`;
const setupPath = `/setup?returnTo=${encodeURIComponent(shared)}`;

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

function formRequest(path: string, body: Record<string, string>) {
  return new Request(`http://localhost:3000${path}`, { method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('AUTH_GOOGLE_ID', 'test-client');
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-secret');
  vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', '');
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', '');
  vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', '');
  vi.mocked(authentication.currentUserId).mockResolvedValue('owner');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('safe signup and calendar return paths', () => {
  it('accepts only the intended local destinations, including one nested setup return', () => {
    for (const path of ['/venn', '/live', shared]) expect(safeSignupReturnPath(path)).toBe(path);
    expect(safeSignupReturnPath(setupPath)).toBe(setupPath);
    expect(safeSharedReturnPath(shared)).toBe(shared);
    expect(setupReturnPath(shared, 'connected')).toBe(`/setup?calendar=connected&returnTo=${encodeURIComponent(shared)}`);
  });
  it('rejects open redirects, encoded paths, duplicate parameters and unapproved destinations', () => {
    for (const value of [undefined, [], 'https://evil.test', '//evil.test', '/\\evil.test', ' /venn', '/venn#x',
      '/live?x=1', '/setup', '/r/short', `${shared}/more`, `${shared}?x=1`, `${shared}#x`, `${shared}\n`, `${shared}\r`,
      '%2Fr%2F' + 's'.repeat(43), `/setup?returnTo=${encodeURIComponent(encodeURIComponent(shared))}`,
      `/setup?returnTo=${encodeURIComponent(shared)}&returnTo=https://evil.test`,
      `/setup?returnTo=${encodeURIComponent(shared)}&extra=1`, '/setup?returnTo=//evil.test']) {
      expect(safeSignupReturnPath(value)).toBe('/venn');
      expect(safeSharedReturnPath(value)).toBeUndefined();
    }
  });
});

describe('encrypted calendar return state', () => {
  function stateDb() {
    const db = { oAuthState: { create: vi.fn().mockResolvedValue({}), findUnique: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      schedulingRequest: { findFirst: vi.fn().mockResolvedValue({ id: 'selected' }) } };
    vi.mocked(getDb).mockReturnValue(db as never);
    return db;
  }
  it('roundtrips an encrypted Venn return without storing a plaintext share token or requesting writes', async () => {
    const db = stateDb();
    const authorization = new URL(await calendarOAuth.beginCalendarConnection('owner', undefined, shared));
    const data = db.oAuthState.create.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toContain(shared.split('/').at(-1));
    const envelope = JSON.parse(decryptToken(data.encryptedVerifier, 'owner'));
    expect(envelope.returnTo).toBe(shared);
    expect(envelope.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(authorization.searchParams.get('scope')).not.toContain(calendarOAuth.OWNED_EVENTS_SCOPE);
    expect(authorization.searchParams.get('scope')).not.toContain('calendar.events.readonly');
    db.oAuthState.findUnique.mockResolvedValue({ id: 'state', ...data });
    expect(await calendarOAuth.consumeOAuthState('owner', authorization.searchParams.get('state')!))
      .toEqual({ verifier: envelope.verifier, purpose: 'calendar', requestId: null, returnTo: shared });
  });
  it('continues consuming legacy encrypted plain verifiers', async () => {
    const db = stateDb();
    db.oAuthState.findUnique.mockResolvedValue({ id: 'old', userId: 'owner', purpose: 'write', requestId: 'selected',
      expiresAt: new Date(Date.now() + 60_000), encryptedVerifier: encryptToken('legacy-verifier', 'owner') });
    expect(await calendarOAuth.consumeOAuthState('owner', 'legacy-state'))
      .toEqual({ verifier: 'legacy-verifier', purpose: 'write', requestId: 'selected' });
  });
  it('preserves the return through the real token exchange and calendar-list flow without persisting it in the grant', async () => {
    const db = { ...stateDb(), account: { findFirst: vi.fn().mockResolvedValue({ providerAccountId: 'owner-google-id' }) },
      calendarGrant: { upsert: vi.fn().mockResolvedValue({}), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'grant' }) },
      $transaction: vi.fn().mockResolvedValue([]) };
    vi.mocked(getDb).mockReturnValue(db as never);
    const authorization = new URL(await calendarOAuth.beginCalendarConnection('owner', undefined, shared));
    db.oAuthState.findUnique.mockResolvedValue({ id: 'state', ...db.oAuthState.create.mock.calls[0][0].data });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600,
        scope: ['openid', calendarOAuth.FREEBUSY_SCOPE, calendarOAuth.CALENDAR_LIST_SCOPE].join(' ') }))
      .mockResolvedValueOnce(Response.json({ sub: 'owner-google-id' }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    expect(await calendarOAuth.finishCalendarConnection('owner', 'code', authorization.searchParams.get('state')!, fetcher))
      .toEqual({ requestId: null, writeGranted: false, returnTo: shared });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(db.calendarGrant.upsert.mock.calls[0])).not.toContain(shared);
    expect(JSON.stringify(db.calendarGrant.upsert.mock.calls[0])).not.toContain('private-access');
    const verifier = new URLSearchParams(fetcher.mock.calls[0][1].body).get('code_verifier');
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });
  it('drops unsafe return paths and ignores shared returns for owner write consent', async () => {
    const db = stateDb();
    await calendarOAuth.beginCalendarConnection('owner', undefined, '//evil.test');
    expect(decryptToken(db.oAuthState.create.mock.calls[0][0].data.encryptedVerifier, 'owner')).not.toContain('evil');
    const url = new URL(await calendarOAuth.beginCalendarConnection('owner', 'selected', shared));
    const data = db.oAuthState.create.mock.calls[1][0].data;
    expect(data.purpose).toBe('write');
    expect(decryptToken(data.encryptedVerifier, 'owner')).not.toContain(shared);
    expect(url.searchParams.get('scope')).toContain(calendarOAuth.OWNED_EVENTS_SCOPE);
  });
});

describe('Venn signup and calendar consent journey', () => {
  it('signs in to calendar setup with the Venn return intact, using identity sign-in only', async () => {
    vi.mocked(authentication.currentUserId).mockResolvedValue(null);
    const page = await SignupPage({ searchParams: Promise.resolve({ returnTo: setupPath }) });
    const form = elements(page).find(element => element.type === 'form')!;
    await (form.props.action as () => Promise<void>)();
    expect(authentication.signIn).toHaveBeenCalledWith('google', { redirectTo: setupPath });
    const invalid = await SignupPage({ searchParams: Promise.resolve({ returnTo: '//evil.test' }) });
    await (elements(invalid).find(element => element.type === 'form')!.props.action as () => Promise<void>)();
    expect(authentication.signIn).toHaveBeenLastCalledWith('google', { redirectTo: '/venn' });
  });
  it('keeps setup sign-in on setup, exposes a back link and carries return through calendar forms', async () => {
    vi.spyOn(transport, 'photonConfigured').mockReturnValue(false);
    vi.mocked(authentication.currentUserId).mockResolvedValue(null);
    const props = { searchParams: Promise.resolve({ returnTo: shared }) };
    const unsigned = elements(await SetupPage(props));
    await (unsigned.find(element => element.type === 'form')!.props.action as () => Promise<void>)();
    expect(authentication.signIn).toHaveBeenCalledWith('google', { redirectTo: setupPath });
    expect(unsigned.find(element => element.props.href === shared)?.props.children).toBe('Back to your Venn');
    vi.mocked(authentication.currentUserId).mockResolvedValue('owner');
    vi.spyOn(calendarClient, 'getCalendarStatus').mockResolvedValue({ state: 'connected', calendars: [
      { id: 'calendar', name: 'Personal', enabled: false, writable: true },
    ] } as never);
    const signed = elements(await SetupPage(props));
    for (const action of ['/api/calendar/connect', '/api/calendar/selection']) {
      const form = signed.find(element => element.type === 'form' && element.props.action === action)!;
      expect(elements(form).some(element => element.type === 'input' && element.props.name === 'returnTo' && element.props.value === shared)).toBe(true);
    }
  });
  it('passes a validated connect return but leaves write connection arguments unchanged', async () => {
    const begin = vi.spyOn(calendarOAuth, 'beginCalendarConnection').mockResolvedValue('https://accounts.google.com/consent');
    expect((await connect(formRequest('/api/calendar/connect', { returnTo: shared }))).status).toBe(303);
    expect(begin).toHaveBeenCalledWith('owner', undefined, shared);
    await connect(formRequest('/api/calendar/connect', { purpose: 'write', requestId: 'selected', returnTo: shared }));
    expect(begin).toHaveBeenLastCalledWith('owner', 'selected', undefined);
  });
  it('returns successful and declined read consent to calendar selection with the Venn remembered', async () => {
    const finish = vi.spyOn(calendarOAuth, 'finishCalendarConnection').mockResolvedValue({ requestId: null, writeGranted: false, returnTo: shared });
    const success = await callback(new Request('http://localhost:3000/api/calendar/callback?code=code&state=state'));
    expect(success.headers.get('location')).toBe(`http://localhost:3000/setup?calendar=connected&returnTo=${encodeURIComponent(shared)}`);
    vi.spyOn(calendarOAuth, 'consumeOAuthState').mockResolvedValue({ verifier: 'unused', purpose: 'calendar', requestId: null, returnTo: shared });
    const declined = await callback(new Request('http://localhost:3000/api/calendar/callback?error=access_denied&state=state'));
    expect(declined.headers.get('location')).toBe(`http://localhost:3000/setup?calendar=declined&returnTo=${encodeURIComponent(shared)}`);
    expect(finish).toHaveBeenCalledTimes(1);
  });
  it('retains the Venn after selecting a calendar and never redirects selection to an external URL', async () => {
    const select = vi.spyOn(calendarClient, 'selectCalendar').mockResolvedValue(undefined as never);
    const response = await selectCalendar(formRequest('/api/calendar/selection', { calendarId: 'calendar', enabled: 'true', returnTo: shared }));
    expect(select).toHaveBeenCalledWith('owner', 'calendar', true);
    expect(response.headers.get('location')).toBe(`http://localhost:3000/setup?calendar=updated&returnTo=${encodeURIComponent(shared)}`);
    const unsafe = await selectCalendar(formRequest('/api/calendar/selection', { calendarId: 'calendar', enabled: 'false', returnTo: '//evil.test' }));
    expect(unsafe.headers.get('location')).toBe('http://localhost:3000/setup?calendar=updated');
  });
});
