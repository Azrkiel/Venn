import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptToken, encryptToken } from '@/features/calendar/token-vault';

beforeEach(() => vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64')));
afterEach(() => vi.unstubAllEnvs());

describe('Calendar token vault', () => {
  it('encrypts and authenticates a token without storing it in plaintext', () => {
    const envelope = encryptToken('private-calendar-token', 'user-a');
    expect(envelope).not.toContain('private-calendar-token');
    expect(decryptToken(envelope, 'user-a')).toBe('private-calendar-token');
    expect(encryptToken('private-calendar-token', 'user-a')).not.toBe(envelope);
  });
  it('binds each encrypted grant to its owner', () => {
    expect(() => decryptToken(encryptToken('token', 'user-a'), 'user-b')).toThrow();
  });
  it('rejects tampering and wrong encryption keys', () => {
    const token = encryptToken('token', 'user-a');
    const parts = token.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptToken(parts.join('.'), 'user-a')).toThrow();
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    expect(() => decryptToken(token, 'user-a')).toThrow();
  });
  it('fails closed when no valid key is configured', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'not-a-valid-key');
    expect(() => encryptToken('token', 'user-a')).toThrow('CALENDAR_ENCRYPTION_NOT_CONFIGURED');
  });
});
