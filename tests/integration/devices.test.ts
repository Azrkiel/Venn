import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateDevice, issueDeviceToken, revokeDeviceToken } from '@/features/identity/device-token';
import { beginPhoneLink, completePhoneLink } from '@/features/identity/phone-link';
import { digestSecret } from '@/features/identity/secrets';

const { db } = vi.hoisted(() => ({ db: {
  deviceToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  pairingChallenge: { deleteMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  phoneLink: { findUnique: vi.fn(), upsert: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock('@/lib/db', () => ({ getDb: () => db }));
beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (callback: (value: typeof db) => Promise<unknown>) => callback(db));
});

describe('Shortcut credentials', () => {
  it('issues a credential once and persists only its digest and owner scope', async () => {
    db.deviceToken.create.mockResolvedValue({ id: 'device1' });
    const issued = await issueDeviceToken('owner', 'My phone');
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(db.deviceToken.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ownerId: 'owner', label: 'My phone', tokenDigest: digestSecret(issued.token),
    }) }));
    expect(JSON.stringify(db.deviceToken.create.mock.calls)).not.toContain(issued.token);
    expect(Date.parse(issued.expiresAt)).toBeGreaterThan(Date.now() + 29 * 24 * 3_600_000);
  });
  it('rejects a Venn ID, missing bearer token, and malformed bearer without a DB lookup', async () => {
    for (const authorization of ['', 'owner', 'Bearer owner']) {
      await expect(authenticateDevice(new Request('https://venn.test/api/shortcut', { headers: { authorization } })))
        .rejects.toMatchObject({ status: 401 });
    }
    expect(db.deviceToken.findUnique).not.toHaveBeenCalled();
  });
  it('resolves only the owner of an active digest and rejects expired/revoked tokens', async () => {
    const token = 't'.repeat(43);
    const request = () => new Request('https://venn.test/api/shortcut', { headers: { Authorization: `Bearer ${token}` } });
    db.deviceToken.findUnique.mockResolvedValue({ ownerId: 'owner', expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
    expect(await authenticateDevice(request())).toBe('owner');
    expect(db.deviceToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenDigest: digestSecret(token) } }));
    db.deviceToken.findUnique.mockResolvedValue({ ownerId: 'owner', expiresAt: new Date(0), revokedAt: null });
    await expect(authenticateDevice(request())).rejects.toMatchObject({ status: 401 });
    db.deviceToken.findUnique.mockResolvedValue({ ownerId: 'owner', expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() });
    await expect(authenticateDevice(request())).rejects.toMatchObject({ status: 401 });
  });
  it('cannot revoke another organizer device', async () => {
    db.deviceToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(revokeDeviceToken('owner', 'someone-else-device')).rejects.toMatchObject({ status: 404 });
    expect(db.deviceToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'someone-else-device', ownerId: 'owner' }) }));
  });
});

describe('verified-DM pairing', () => {
  it('issues a short-lived random challenge with only its digest retained', async () => {
    db.pairingChallenge.create.mockResolvedValue({}); db.pairingChallenge.deleteMany.mockResolvedValue({ count: 0 });
    const challenge = await beginPhoneLink('owner');
    expect(challenge.command).toMatch(/^pair [A-Za-z0-9_-]{43}$/);
    const code = challenge.command.slice(5);
    expect(JSON.stringify(db.pairingChallenge.create.mock.calls)).not.toContain(code);
    expect(db.pairingChallenge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerId: 'owner', codeDigest: digestSecret(code) }) });
  });
  it('binds only the observed signed sender/thread after atomic one-time consumption', async () => {
    const code = 'c'.repeat(43);
    db.pairingChallenge.findUnique.mockResolvedValue({ id: 'challenge', ownerId: 'owner', expiresAt: new Date(Date.now() + 60_000) });
    db.pairingChallenge.deleteMany.mockResolvedValue({ count: 1 }); db.phoneLink.findUnique.mockResolvedValue(null);
    db.phoneLink.upsert.mockResolvedValue({});
    expect(await completePhoneLink(code, { providerSender: '+15551234567', threadId: 'imessage:iMessage;-;+15551234567~+15550000000' })).toBe('owner');
    expect(db.phoneLink.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner' }, create: { userId: 'owner', providerSender: '+15551234567', threadId: 'imessage:iMessage;-;+15551234567~+15550000000' },
    }));
    db.pairingChallenge.deleteMany.mockResolvedValue({ count: 0 });
    expect(await completePhoneLink(code, { providerSender: '+15551234567', threadId: 'imessage:iMessage;-;+15551234567' })).toBe(null);
    expect(db.phoneLink.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects expired challenges and group-chat routing without binding a number', async () => {
    db.pairingChallenge.findUnique.mockResolvedValue({ id: 'expired', ownerId: 'owner', expiresAt: new Date(0) });
    expect(await completePhoneLink('c'.repeat(43), { providerSender: '+15551234567', threadId: 'imessage:iMessage;-;+15551234567' })).toBe(null);
    await expect(completePhoneLink('c'.repeat(43), { providerSender: '+15551234567', threadId: 'imessage:iMessage;+;group' }))
      .rejects.toMatchObject({ status: 422 });
    expect(db.phoneLink.upsert).not.toHaveBeenCalled();
  });
});
