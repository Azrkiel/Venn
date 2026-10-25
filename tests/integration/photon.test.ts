import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePhotonWebhook, verifyPhotonSignature } from '@/features/messaging/bot';
import { sendOwnerResult } from '@/features/messaging/delivery';
import { IntentParseError } from '@/features/scheduling/intent';
import { CalendarError } from '@/features/calendar/errors';

const { db, ownerRequest, pairedSend, createLive } = vi.hoisted(() => ({
  db: { processedDelivery: { create: vi.fn(), update: vi.fn() }, phoneLink: { findUnique: vi.fn() }, user: { findUnique: vi.fn() },
    schedulingRequest: { findMany: vi.fn(), updateMany: vi.fn() } },
  ownerRequest: vi.fn(), pairedSend: vi.fn(), createLive: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ getDb: () => db }));
vi.mock('@/features/requests/service', () => ({ getOwnerRequest: ownerRequest, selectSlot: vi.fn(), cancelRequest: vi.fn(), createLiveRequest: createLive }));
vi.mock('@/features/messaging/transport', async importOriginal => ({ ...await importOriginal<typeof import('@/features/messaging/transport')>(), postVerifiedThread: pairedSend }));
vi.mock('@/features/requests/add', () => ({ addSelectedEvent: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: vi.fn() }));
const secret = 'test-signing-secret';
const payload = (text = 'private-canary-text') => JSON.stringify({ event: 'messages',
  message: { id: 'message1', direction: 'inbound', sender: { id: '+15551234567' }, content: { type: 'text', text } },
  space: { id: 'iMessage;-;+15551234567', phone: '+15550000000' } });
function signedRequest(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  return new Request('https://venn.test/api/webhooks/photon', { method: 'POST', body,
    headers: { 'x-spectrum-signature': signature, 'x-spectrum-timestamp': timestamp, 'x-spectrum-event': 'messages' } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('IMESSAGE_PROJECT_ID', 'test-project'); vi.stubEnv('IMESSAGE_PROJECT_SECRET', 'test-project-secret');
  vi.stubEnv('IMESSAGE_WEBHOOK_SECRET', secret); vi.stubEnv('DATABASE_URL', 'postgresql://not-connected.invalid/venn');
  vi.stubEnv('APP_BASE_URL', 'https://venn.test');
  db.processedDelivery.create.mockResolvedValue({ id: 'delivery1' }); db.processedDelivery.update.mockResolvedValue({});
  db.phoneLink.findUnique.mockResolvedValue(null);
});

describe('Photon authenticity and retention', () => {
  it('accepts the pinned adapter v0 HMAC but rejects unsigned, modified or stale bodies', () => {
    const body = payload();
    expect(() => verifyPhotonSignature(signedRequest(body), body, secret)).not.toThrow();
    expect(() => verifyPhotonSignature(new Request('https://venn.test'), body, secret)).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => verifyPhotonSignature(signedRequest(body), body + ' ', secret)).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => verifyPhotonSignature(signedRequest(body, String(Math.floor(Date.now() / 1000) - 301)), body, secret))
      .toThrowError(expect.objectContaining({ status: 401 }));
  });
  it('rejects unsigned input before reading identities or claiming processing', async () => {
    const response = await handlePhotonWebhook(new Request('https://venn.test', { method: 'POST', body: payload() }));
    expect(response.status).toBe(401); expect(db.processedDelivery.create).not.toHaveBeenCalled();
    expect(db.phoneLink.findUnique).not.toHaveBeenCalled();
  });
  it('deduplicates a verified provider message before any private lookup or send', async () => {
    db.processedDelivery.create.mockRejectedValue({ code: 'P2002' });
    expect((await handlePhotonWebhook(signedRequest(payload()))).status).toBe(200);
    expect(db.phoneLink.findUnique).not.toHaveBeenCalled(); expect(pairedSend).not.toHaveBeenCalled();
  });
  it('discards an unpaired scheduling message and never persists the raw-text canary', async () => {
    const response = await handlePhotonWebhook(signedRequest(payload()));
    expect(response.status).toBe(200);
    expect(db.processedDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: 'test-project', messageId: 'message1' }) });
    expect(JSON.stringify([db.processedDelivery.create.mock.calls, db.processedDelivery.update.mock.calls]))
      .not.toContain('private-canary-text');
    expect(ownerRequest).not.toHaveBeenCalled();
  });
  it("processes Photon's shared-pool DM shape (any;-;<handle>) instead of ignoring it", async () => {
    const shared = JSON.stringify({ event: 'messages', space: { id: 'any;-;+15551234567', platform: 'iMessage' },
      message: { id: 'spc-msg-1', platform: 'iMessage', direction: 'inbound', timestamp: new Date().toISOString(),
        sender: { id: '+15551234567', platform: 'iMessage' }, space: { id: 'any;-;+15551234567', platform: 'iMessage' },
        content: { type: 'text', text: 'hi' } } });
    expect((await handlePhotonWebhook(signedRequest(shared))).status).toBe(200);
    expect(db.processedDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ messageId: 'spc-msg-1' }) });
    expect(db.phoneLink.findUnique).toHaveBeenCalled();
  });
  it('ignores group and outbound messages even when signed', async () => {
    const group = JSON.parse(payload()); group.space.id = 'iMessage;+;group';
    expect((await handlePhotonWebhook(signedRequest(JSON.stringify(group)))).status).toBe(204);
    const outbound = JSON.parse(payload()); outbound.message.direction = 'outbound';
    expect((await handlePhotonWebhook(signedRequest(JSON.stringify(outbound)))).status).toBe(204);
    expect(db.processedDelivery.create).not.toHaveBeenCalled();
  });
  it('returns a safe setup error without credentials instead of creating an unofficial local bot', async () => {
    vi.stubEnv('IMESSAGE_PROJECT_ID', '');
    const response = await handlePhotonWebhook(signedRequest(payload()));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain(secret);
  });
});

describe('owner-only delivery', () => {
  it('sends only through the saved verified owner thread, never a caller recipient', async () => {
    ownerRequest.mockResolvedValue({ id: 'req1', state: 'ready', activity: 'lunch', localDate: '2026-10-25',
      timezone: 'America/New_York', slots: [], participants: [], draft: 'yes! lunch works' });
    db.phoneLink.findUnique.mockResolvedValue({ userId: 'owner', threadId: 'imessage:iMessage;-;+15551234567~+15550000000' });
    db.schedulingRequest.updateMany.mockResolvedValue({ count: 1 }); pairedSend.mockResolvedValue(undefined);
    await sendOwnerResult('owner', 'req1', pairedSend);
    expect(ownerRequest).toHaveBeenCalledWith('owner', 'req1');
    expect(pairedSend).toHaveBeenCalledWith('imessage:iMessage;-;+15551234567~+15550000000', expect.stringContaining('yes! lunch works'));
  });
  it('refuses unpaired or invalidated results without a send', async () => {
    ownerRequest.mockResolvedValue({ id: 'req1', state: 'retry_required', slots: [], draft: 'stale private draft' });
    await expect(sendOwnerResult('owner', 'req1', pairedSend)).rejects.toMatchObject({ status: 409 });
    expect(pairedSend).not.toHaveBeenCalled();
    ownerRequest.mockResolvedValue({ id: 'req1', state: 'ready', slots: [], draft: 'private draft' }); db.phoneLink.findUnique.mockResolvedValue(null);
    await expect(sendOwnerResult('owner', 'req1', pairedSend)).rejects.toMatchObject({ status: 409, code: 'PHONE_NOT_PAIRED' });
  });
});

describe('solo asks from the paired owner', () => {
  const threadId = 'imessage:iMessage;-;+15551234567~+15550000000';
  const solo = { id: 'req1', mode: 'solo', state: 'ready', activity: 'lunch', localDate: '2026-10-25', timezone: 'America/Chicago',
    participants: [{ id: 'self', displayName: 'You' }], draft: 'yes! i can do 12:00–1:00pm for lunch if that works?',
    slots: [{ ordinal: 1, start: Date.UTC(2026, 9, 25, 17), end: Date.UTC(2026, 9, 25, 18), freeIds: ['self'], busyIds: [], unknownIds: [] }] };
  let info: ReturnType<typeof vi.spyOn>;
  const sent = () => JSON.stringify(pairedSend.mock.calls);
  const logged = () => JSON.stringify([info.mock.calls, db.processedDelivery.create.mock.calls, db.processedDelivery.update.mock.calls]);
  beforeEach(() => {
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
    db.phoneLink.findUnique.mockResolvedValue({ userId: 'owner', threadId });
    db.user.findUnique.mockResolvedValue({ timezone: 'America/Chicago' });
    db.schedulingRequest.updateMany.mockResolvedValue({ count: 1 }); pairedSend.mockResolvedValue(undefined);
    ownerRequest.mockResolvedValue(solo); createLive.mockResolvedValue(solo);
  });
  it('creates a solo request with the stored timezone and sends options without attendance counts', async () => {
    expect((await handlePhotonWebhook(signedRequest(payload('private-canary-text')))).status).toBe(200);
    expect(createLive).toHaveBeenCalledWith('owner', { text: 'private-canary-text', timezone: 'America/Chicago' });
    expect(pairedSend).toHaveBeenCalledTimes(1);
    const text = pairedSend.mock.calls[0][1] as string;
    expect(text).toContain('1. '); expect(text).toContain('yes! i can do'); expect(text).toContain('/live?request=req1');
    expect(text).not.toMatch(/free|unknown/); expect(text).not.toContain('private-canary-text');
    expect(logged()).not.toContain('private-canary-text');
    expect(db.processedDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'solo_sent', requestId: 'req1' } }));
  });
  it.each([
    ['needs_clarification', { state: 'needs_clarification' }, /day/, 'solo_needs_clarification'],
    ['no_slots', { ...solo, state: 'no_slots', slots: [] }, /nothing fits/, 'solo_no_slots'],
    ['retry_required', { ...solo, state: 'retry_required', slots: [] }, /\/setup/, 'solo_reconnect'],
  ])('answers %s with a short reply that never echoes the text', async (_name, result, pattern, state) => {
    createLive.mockResolvedValue(result);
    await handlePhotonWebhook(signedRequest(payload('private-canary-text')));
    expect(pairedSend).toHaveBeenCalledTimes(1);
    expect(pairedSend.mock.calls[0][1]).toMatch(pattern); expect(sent()).not.toContain('private-canary-text');
    expect(db.processedDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: { state } }));
  });
  it('asks to reconnect when the calendar cannot be read', async () => {
    createLive.mockRejectedValue(new CalendarError('CALENDAR_RECONNECT_REQUIRED'));
    await handlePhotonWebhook(signedRequest(payload('private-canary-text')));
    expect(pairedSend.mock.calls[0][1]).toContain('/setup'); expect(sent()).not.toContain('private-canary-text');
  });
  it('replies busy when Gemini is at its limit and generic for other intent errors', async () => {
    createLive.mockRejectedValue(new IntentParseError('MODEL_BUSY', 'busy'));
    await handlePhotonWebhook(signedRequest(payload('private-canary-text')));
    expect(pairedSend.mock.calls[0][1]).toBe("i'm at my request limit, try again in a minute.");
    pairedSend.mockClear(); createLive.mockRejectedValue(new IntentParseError('INVALID_MODEL_OUTPUT', 'raw private-canary-text'));
    await handlePhotonWebhook(signedRequest(payload('private-canary-text')));
    expect(pairedSend).toHaveBeenCalledTimes(1); expect(sent()).not.toContain('private-canary-text'); expect(logged()).not.toContain('private-canary-text');
  });
  it('applies a numbered reply to the newest plan even when older plans are still open', async () => {
    db.phoneLink.findUnique.mockResolvedValue({ userId: 'owner', threadId: 'imessage:iMessage;-;+15551234567~+15550000000' });
    db.schedulingRequest.findMany.mockResolvedValue([{ id: 'newest' }]);
    ownerRequest.mockRejectedValue(new Error('stop after lookup'));
    await handlePhotonWebhook(signedRequest(payload('2')));
    expect(db.schedulingRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 1 }));
    expect(ownerRequest).toHaveBeenCalledWith('owner', 'newest');
  });
  it('does not treat commands as asks', async () => {
    db.schedulingRequest.findMany.mockResolvedValue([]);
    await handlePhotonWebhook(signedRequest(payload('2')));
    expect(createLive).not.toHaveBeenCalled();
  });
});
