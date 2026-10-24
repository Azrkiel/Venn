import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
vi.mock('next-auth', () => ({ default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
import { currentUserId, loginConfigured, stripLoginTokens } from '@/auth';
import { createPkce, consumeOAuthState, calendarOAuthConfig } from '@/features/calendar/oauth';
import { getDb } from '@/lib/db';
import * as authentication from '@/auth';
import * as calendarOAuth from '@/features/calendar/oauth';
import { GET as calendarCallback } from '@/app/api/calendar/callback/route';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Google identity boundary', () => {
  it('does not retain unused login credentials in the identity account', () => {
    expect(stripLoginTokens({ userId: 'u', type: 'oidc', provider: 'google', providerAccountId: 'sub',
      access_token: 'secret', refresh_token: 'secret', id_token: 'secret', scope: 'openid email profile' })).toEqual({
      userId: 'u', type: 'oidc', provider: 'google', providerAccountId: 'sub', scope: 'openid email profile',
    });
  });
  it('reports setup needed and returns no user without authentication configuration', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('AUTH_GOOGLE_ID', '');
    vi.stubEnv('AUTH_GOOGLE_SECRET', '');
    vi.stubEnv('AUTH_SECRET', '');
    expect(loginConfigured()).toBe(false);
    expect(await currentUserId()).toBeNull();
  });
});

describe('Calendar consent state', () => {
  it('reuses login credentials when optional Calendar client overrides are blank', () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', '   ');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', '');
    vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', '');
    vi.stubEnv('AUTH_GOOGLE_ID', 'login-client-id');
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'login-client-secret');
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
    expect(calendarOAuthConfig()).toEqual({ clientId: 'login-client-id', clientSecret: 'login-client-secret',
      baseUrl: 'http://localhost:3000', redirectUri: 'http://localhost:3000/api/calendar/callback' });
  });
  it('generates a fresh opaque state and PKCE challenge', () => {
    const first = createPkce(), second = createPkce();
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(first.challenge);
    expect(first.state.length).toBeGreaterThanOrEqual(43);
  });
  it('does not consume another owner\'s consent state', async () => {
    const db = { oAuthState: { findUnique: vi.fn().mockResolvedValue({ userId: 'other', expiresAt: new Date(Date.now() + 60_000) }), deleteMany: vi.fn() } };
    vi.mocked(getDb).mockReturnValue(db as never);
    await expect(consumeOAuthState('owner', 'opaque-state')).rejects.toThrow('INVALID_CALENDAR_STATE');
    expect(db.oAuthState.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects expired and already-used state before exchanging credentials', async () => {
    const db = { oAuthState: { findUnique: vi.fn().mockResolvedValue({ userId: 'owner', expiresAt: new Date(0) }), deleteMany: vi.fn() } };
    vi.mocked(getDb).mockReturnValue(db as never);
    await expect(consumeOAuthState('owner', 'opaque-state')).rejects.toThrow('INVALID_CALENDAR_STATE');
    db.oAuthState.findUnique.mockResolvedValue(null);
    await expect(consumeOAuthState('owner', 'opaque-state')).rejects.toThrow('INVALID_CALENDAR_STATE');
  });
});

describe('write-consent return journey', () => {
  it('returns to the selected request without automatically adding an event', async () => {
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
    vi.spyOn(authentication, 'currentUserId').mockResolvedValue('owner');
    vi.spyOn(calendarOAuth, 'finishCalendarConnection').mockResolvedValue({ requestId: 'selected-request', writeGranted: true });
    vi.mocked(getDb).mockClear();
    const response = await calendarCallback(new Request('http://localhost:3000/api/calendar/callback?code=code&state=state'));
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(303);
    expect(destination.pathname).toBe('/live');
    expect(destination.searchParams.get('request')).toBe('selected-request');
    expect(destination.searchParams.get('calendar')).toBe('write-granted');
    expect(getDb).not.toHaveBeenCalled();
  });
  it('returns declined write consent to the request without exchanging or adding', async () => {
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
    vi.spyOn(authentication, 'currentUserId').mockResolvedValue('owner');
    vi.spyOn(calendarOAuth, 'consumeOAuthState').mockResolvedValue({ verifier: 'unused', purpose: 'write', requestId: 'selected-request' });
    const finish = vi.spyOn(calendarOAuth, 'finishCalendarConnection');
    const response = await calendarCallback(new Request('http://localhost:3000/api/calendar/callback?error=access_denied&state=state'));
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/live');
    expect(destination.searchParams.get('request')).toBe('selected-request');
    expect(destination.searchParams.get('calendar')).toBe('write-declined');
    expect(finish).not.toHaveBeenCalled();
  });
});
