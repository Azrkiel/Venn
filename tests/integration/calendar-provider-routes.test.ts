import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/auth', () => ({ currentUserId: vi.fn(), loginConfigured: vi.fn(() => true) }));
vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: vi.fn() }));
import { currentUserId } from '@/auth';
import * as outlook from '@/features/calendar/outlook';
import * as apple from '@/features/calendar/apple';
import { CalendarError } from '@/features/calendar/errors';
import { consumeOAuthState, finishCalendarConnection } from '@/features/calendar/oauth';
import { getDb } from '@/lib/db';
import { encryptToken, decryptToken } from '@/features/calendar/token-vault';
import { POST as connect } from '@/app/api/calendar/connect/route';
import { POST as appleConnect } from '@/app/api/calendar/apple/connect/route';
import { POST as selection } from '@/app/api/calendar/selection/route';
import { POST as revoke } from '@/app/api/calendar/revoke/route';

const shared = `/r/${'s'.repeat(43)}`;
const form = (path: string, values: Record<string, string> = {}, origin = 'http://localhost:3000') => new Request(`http://localhost:3000/api/calendar/${path}`, {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values),
});
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(currentUserId).mockResolvedValue('viewer');
  vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_ID', 'microsoft-client'); vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_SECRET', 'microsoft-secret');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('calendar provider identity boundaries', () => {
  it('requires sign-in before all provider connection, selection, and disconnect actions', async () => {
    vi.mocked(currentUserId).mockResolvedValue(null);
    const begin = vi.spyOn(outlook, 'beginOutlookConnection');
    const appleStart = vi.spyOn(apple, 'connectApple');
    for (const [handler, request] of [[connect, form('connect', { provider: 'outlook' })], [appleConnect, form('apple/connect')],
      [selection, form('selection')], [revoke, form('revoke')]] as const) expect((await handler(request)).status).toBe(401);
    expect(begin).not.toHaveBeenCalled(); expect(appleStart).not.toHaveBeenCalled(); expect(getDb).not.toHaveBeenCalled();
  });
  it('rejects cross-site connection attempts before touching credentials', async () => {
    expect((await appleConnect(form('apple/connect', {}, 'https://attacker.test'))).status).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
  });
  it('starts Outlook consent for the signed-in viewer with a validated Venn return', async () => {
    const begin = vi.spyOn(outlook, 'beginOutlookConnection').mockResolvedValue('https://login.microsoftonline.com/consent');
    expect((await connect(form('connect', { provider: 'outlook', returnTo: shared }))).status).toBe(303);
    expect(begin).toHaveBeenCalledWith('viewer', shared);
    expect((await connect(form('connect', { provider: 'apple' }))).status).toBe(422);
  });
  it('keeps failed Apple credentials out of the URL and returns to the same Venn', async () => {
    vi.spyOn(apple, 'connectApple').mockRejectedValue(new CalendarError('APPLE_CONNECTION_FAILED', 422));
    const result = await appleConnect(form('apple/connect', { email: 'private@example.com', password: 'abcd-efgh-ijkl-mnop', returnTo: shared }));
    expect(result.status).toBe(303);
    const url = new URL(result.headers.get('location')!);
    expect(url.searchParams.get('returnTo')).toBe(shared);
    expect(url.searchParams.get('calendar')).toBe('apple-failed');
    expect(url.href).not.toMatch(/private|abcd/);
  });
});

describe('provider consent state', () => {
  it('roundtrips an encrypted provider-bound PKCE state and Venn return', async () => {
    const db = { oAuthState: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    vi.mocked(getDb).mockReturnValue(db as never);
    const url = new URL(await outlook.beginOutlookConnection('viewer', shared));
    const data = db.oAuthState.create.mock.calls[0][0].data;
    expect(data.purpose).toBe('outlook'); expect(JSON.stringify(data)).not.toContain(shared);
    expect(url.searchParams.get('scope')).not.toContain('ReadWrite');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    db.oAuthState.findUnique.mockResolvedValue({ id: 'state-id', ...data });
    expect(await consumeOAuthState('viewer', url.searchParams.get('state')!)).toMatchObject({ purpose: 'outlook', returnTo: shared });
    expect(decryptToken(data.encryptedVerifier, 'viewer')).toContain(shared);
  });
  it('rejects a different provider state before any token exchange', async () => {
    const db = { oAuthState: { findUnique: vi.fn().mockResolvedValue({ id: 'state-id', userId: 'viewer', purpose: 'outlook',
      encryptedVerifier: encryptToken('v'.repeat(43), 'viewer'), expiresAt: new Date(Date.now() + 60_000) }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    vi.mocked(getDb).mockReturnValue(db as never);
    const fetcher = vi.fn();
    await expect(finishCalendarConnection('viewer', 'code', 'state', fetcher)).rejects.toThrow('INVALID_CALENDAR_STATE');
    expect(fetcher).not.toHaveBeenCalled();
    db.oAuthState.findUnique.mockResolvedValue({ ...await db.oAuthState.findUnique(), purpose: 'calendar' });
    await expect(outlook.finishOutlookConnection('viewer', 'code', 'state', fetcher)).rejects.toThrow('INVALID_CALENDAR_STATE');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
