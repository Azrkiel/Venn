import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/http';
import { consumeRateLimit } from '@/lib/rate-limit';
import { completePhoneLink, isDirectThread } from '@/features/identity/phone-link';
import { cancelRequest, getOwnerRequest, selectSlot } from '@/features/requests/service';
import { addSelectedEvent } from '@/features/requests/add';
import { latestOwnerResult, sendOwnerResult, sendPairedText } from './delivery';
import { photonConfigured } from './transport';

/** Matches the private verifier in pinned @photon-ai/chat-adapter-imessage 3.2.0 exactly. */
export function verifyPhotonSignature(request: Request, rawBody: string, secret: string, now = Math.floor(Date.now() / 1000)): void {
  const signature = request.headers.get('x-spectrum-signature');
  const timestamp = request.headers.get('x-spectrum-timestamp');
  if (!secret || !signature || !timestamp || !/^v0=[a-f0-9]{64}$/.test(signature)
    || !/^\d+$/.test(timestamp) || !Number.isFinite(Number(timestamp)) || Math.abs(now - Number(timestamp)) > 300) {
    throw new HttpError(401, 'INVALID_PHOTON_SIGNATURE', 'The message delivery could not be authenticated.');
  }
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new HttpError(401, 'INVALID_PHOTON_SIGNATURE', 'The message delivery could not be authenticated.');
  }
}

const envelopeSchema = z.object({
  event: z.string(),
  message: z.object({ id: z.string().min(1).max(256), direction: z.string(),
    sender: z.object({ id: z.string().min(1).max(512) }), content: z.unknown(),
    space: z.object({ phone: z.string().max(100).optional() }).optional() }),
  space: z.object({ id: z.string().min(1).max(512), phone: z.string().max(100).optional() }),
});
const textSchema = z.object({ type: z.literal('text'), text: z.string().min(1).max(2_000) });
type VerifiedMessage = { messageId: string; providerSender: string; threadId: string; text: string };
type Ignored = { ignored: string };

// Reason codes only: never the payload, text, sender or thread identifiers.
const logDelivery = (outcome: string) => console.info(`[photon] ${outcome}`);

function parseMessage(rawBody: string): VerifiedMessage | Ignored {
  let raw: unknown;
  try { raw = JSON.parse(rawBody); }
  catch { throw new HttpError(400, 'INVALID_PHOTON_BODY', 'The message delivery could not be read.'); }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return { ignored: 'unrecognized-envelope' };
  const { event, message, space } = parsed.data;
  if (event !== 'messages' || message.direction !== 'inbound') return { ignored: 'not-inbound-message' };
  const phone = space.phone ?? message.space?.phone;
  // The line separator and prefix match the installed adapter's encodeThreadId.
  const threadId = `imessage:${space.id}${phone ? `~${phone}` : ''}`;
  if (!isDirectThread(threadId)) return { ignored: 'not-direct-thread' };
  let content = textSchema.safeParse(message.content);
  if (!content.success) {
    const reply = z.object({ type: z.literal('reply'), content: textSchema }).safeParse(message.content);
    if (!reply.success) return { ignored: 'not-text' };
    content = textSchema.safeParse(reply.data.content);
  }
  if (!content.success || !content.data.text.trim()) return { ignored: 'empty-text' };
  return { messageId: message.id, providerSender: message.sender.id, threadId, text: content.data.text };
}

async function rawBodyWithinLimit(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > 8_192) throw new HttpError(413, 'BODY_TOO_LARGE', 'The message delivery is too large.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > 8_192) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', 'The message delivery is too large.'); }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function liveLink(requestId?: string) {
  const path = `/live${requestId ? `?request=${encodeURIComponent(requestId)}` : ''}`;
  return process.env.APP_BASE_URL ? new URL(path, process.env.APP_BASE_URL).toString() : path;
}

async function processVerifiedMessage(message: VerifiedMessage): Promise<{ state: string; requestId?: string }> {
  const command = message.text.trim();
  const pair = command.match(/^pair ([A-Za-z0-9_-]{43})$/i);
  if (pair) {
    const ownerId = await completePhoneLink(pair[1], { providerSender: message.providerSender, threadId: message.threadId });
    if (!ownerId) return { state: 'pair_code_invalid' };
    await sendPairedText(ownerId, `you're paired with Venn. your calendar results stay in this private chat. start a plan: ${liveLink()}`);
    return { state: 'paired' };
  }
  const owner = await getDb().phoneLink.findUnique({ where: { providerSender: message.providerSender }, select: { userId: true, threadId: true } });
  if (!owner || owner.threadId !== message.threadId) return { state: 'unpaired_sender' };
  await consumeRateLimit(`photon:${owner.userId}`, 15);
  if (/^(?:lemme check|check)$/i.test(command)) {
    try {
      const latest = await latestOwnerResult(owner.userId);
      await sendOwnerResult(owner.userId, latest.id);
      return { state: 'done', requestId: latest.id };
    } catch (error) {
      if (error instanceof HttpError && error.code === 'NO_ACTIVE_REQUEST') {
        await sendPairedText(owner.userId, `no current plan yet. choose your group and requester here: ${liveLink()}`);
        return { state: 'done' };
      }
      throw error;
    }
  }
  if (/^(?:[123]|no|add)$/i.test(command)) {
    const active = await getDb().schedulingRequest.findMany({ where: { ownerId: owner.userId, expiresAt: { gt: new Date() },
      state: { in: ['ready', 'selected'] } }, orderBy: { createdAt: 'desc' }, select: { id: true }, take: 2 });
    if (active.length !== 1) {
      await sendPairedText(owner.userId, `i need you to choose which plan first: ${liveLink()}`);
      return { state: 'needs_request' };
    }
    const result = await getOwnerRequest(owner.userId, active[0].id);
    if (/^no$/i.test(command)) {
      await cancelRequest(owner.userId, result.id);
      await sendPairedText(owner.userId, 'no problem. that plan is cancelled; nothing was added or sent to your friends.');
      return { state: 'cancelled', requestId: result.id };
    }
    if (/^add$/i.test(command)) {
      if (!result.selectedSlotId) {
        await sendPairedText(owner.userId, `choose a specific option before adding it: ${liveLink(result.id)}`);
        return { state: 'needs_selection', requestId: result.id };
      }
      try {
        await addSelectedEvent(owner.userId, result.id, { slotId: result.selectedSlotId, slotVersion: result.slotVersion });
        await sendPairedText(owner.userId, 'added to your calendar. your friends have not been invited or messaged.');
        return { state: 'added', requestId: result.id };
      } catch (error) {
        const consent = typeof error === 'object' && error !== null && 'code' in error && error.code === 'CALENDAR_WRITE_CONSENT_REQUIRED';
        if (!consent) throw error;
        await sendPairedText(owner.userId, `i need your permission before adding an event. review and confirm here: ${liveLink(result.id)}`);
        return { state: 'needs_consent', requestId: result.id };
      }
    }
    const slot = result.slots.find(option => option.ordinal === Number(command));
    if (!slot) {
      await sendPairedText(owner.userId, `that option is not available. review the current plan: ${liveLink(result.id)}`);
      return { state: 'needs_selection', requestId: result.id };
    }
    await selectSlot(owner.userId, result.id, slot.id, result.slotVersion);
    await sendOwnerResult(owner.userId, result.id);
    return { state: 'selected', requestId: result.id };
  }
  // Forwarded text has no trusted group/requester context. Never infer identity from its contents.
  await sendPairedText(owner.userId, `let's choose your group and who's asking before i check calendars: ${liveLink()}`);
  return { state: 'needs_context' };
}

export async function handlePhotonWebhook(request: Request, schedule?: (work: () => Promise<void>) => void): Promise<Response> {
  try {
    if (!photonConfigured()) throw new HttpError(503, 'PHOTON_NOT_CONFIGURED', 'Connect Photon before using Venn in Messages.');
    const rawBody = await rawBodyWithinLimit(request);
    try { verifyPhotonSignature(request, rawBody, process.env.IMESSAGE_WEBHOOK_SECRET!); }
    catch (error) { logDelivery('rejected: invalid signature'); throw error; }
    const event = request.headers.get('x-spectrum-event');
    if (event && event !== 'messages') { logDelivery('ignored: event-header'); return new Response(null, { status: 204 }); }
    const message = parseMessage(rawBody);
    if ('ignored' in message) { logDelivery(`ignored: ${message.ignored}`); return new Response(null, { status: 204 }); }
    let claimed: { id: string };
    try {
      claimed = await getDb().processedDelivery.create({ data: { messageId: message.messageId,
        projectId: process.env.IMESSAGE_PROJECT_ID!, state: 'processing', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return new Response(null, { status: 200 });
      throw error;
    }
    const runDelivery = async () => {
      try {
        const outcome = await processVerifiedMessage(message);
        logDelivery(`processed: ${outcome.state}`);
        await getDb().processedDelivery.update({ where: { id: claimed.id }, data: outcome });
      } catch (error) {
        // No raw exception, provider payload or input text is logged or retained.
        logDelivery(`failed: ${error instanceof HttpError ? error.code : 'unexpected'}`);
        try { await getDb().processedDelivery.update({ where: { id: claimed.id }, data: { state: 'failed' } }); }
        catch { /* A failed ID-only status update must not leak the original message through an unhandled rejection. */ }
      }
    };
    if (schedule) schedule(runDelivery); else await runDelivery();
    return new Response(null, { status: 200 });
  } catch (error) { return apiError(error); }
}
