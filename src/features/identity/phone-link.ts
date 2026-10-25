import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { createSecret, digestSecret } from './secrets';

/** Mirrors the adapter's DM rule (`;-;` chat GUIDs); Photon's shared pool uses `any;-;<handle>`. Group GUIDs use `;+;`. */
export function isDirectThread(threadId: string): boolean {
  return /^imessage:[A-Za-z]+;-;[^~;\r\n]+(?:~[^~\r\n]+)?$/.test(threadId);
}

export async function beginPhoneLink(ownerId: string) {
  const code = createSecret();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await getDb().$transaction(async tx => {
    await tx.pairingChallenge.deleteMany({ where: { ownerId } });
    await tx.pairingChallenge.create({ data: { ownerId, codeDigest: digestSecret(code), expiresAt } });
  });
  return { command: `pair ${code}`, expiresAt: expiresAt.toISOString() };
}

/** Called only after authenticating the exact Photon delivery; these are observed provider fields, never form input. */
export async function completePhoneLink(code: string, observed: { providerSender: string; threadId: string }): Promise<string | null> {
  if (!isDirectThread(observed.threadId) || !observed.providerSender || observed.providerSender.length > 512
    || /[\r\n]/.test(observed.providerSender)) {
    throw new HttpError(422, 'DIRECT_MESSAGE_REQUIRED', 'Pair Venn in a direct message, not a group chat.');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  return getDb().$transaction(async tx => {
    const challenge = await tx.pairingChallenge.findUnique({ where: { codeDigest: digestSecret(code) } });
    if (!challenge || challenge.expiresAt <= new Date()) return null;
    const existing = await tx.phoneLink.findUnique({ where: { providerSender: observed.providerSender } });
    if (existing && existing.userId !== challenge.ownerId) {
      throw new HttpError(409, 'PHONE_ALREADY_LINKED', 'Unlink the previous Venn account before pairing this phone.');
    }
    const consumed = await tx.pairingChallenge.deleteMany({ where: { id: challenge.id, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return null;
    await tx.phoneLink.upsert({ where: { userId: challenge.ownerId },
      create: { userId: challenge.ownerId, providerSender: observed.providerSender, threadId: observed.threadId },
      update: { providerSender: observed.providerSender, threadId: observed.threadId } });
    return challenge.ownerId;
  });
}

export async function phoneLinkState(ownerId: string) {
  return { paired: Boolean(await getDb().phoneLink.findUnique({ where: { userId: ownerId }, select: { id: true } })) };
}

export async function unlinkPhone(ownerId: string) {
  await getDb().$transaction(async tx => {
    await tx.phoneLink.deleteMany({ where: { userId: ownerId } });
    await tx.pairingChallenge.deleteMany({ where: { ownerId } });
  });
  return { paired: false };
}
