import { z } from 'zod';
import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { createSecret, digestSecret } from './secrets';

export const deviceLabelSchema = z.object({ label: z.string().trim().min(1).max(50).regex(/^[^\p{C}]+$/u) }).strict();

export async function issueDeviceToken(ownerId: string, label: string) {
  const parsed = deviceLabelSchema.safeParse({ label });
  if (!parsed.success) throw new HttpError(422, 'INVALID_DEVICE_LABEL', 'Give this Shortcut a short device name.');
  const token = createSecret();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  const device = await getDb().deviceToken.create({ data: {
    ownerId, label: parsed.data.label, tokenDigest: digestSecret(token), expiresAt,
  }, select: { id: true } });
  return { id: device.id, token, label: parsed.data.label, expiresAt: expiresAt.toISOString() };
}

/** This credential is accepted only by the Shortcut intake/latest endpoints, never cookie-authenticated APIs. */
export async function authenticateDevice(request: Request): Promise<string> {
  const match = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
  if (!match) throw new HttpError(401, 'DEVICE_TOKEN_REQUIRED', 'Pair this Shortcut with a Venn device token first.');
  const record = await getDb().deviceToken.findUnique({ where: { tokenDigest: digestSecret(match[1]) },
    select: { ownerId: true, expiresAt: true, revokedAt: true } });
  if (!record || record.revokedAt || record.expiresAt <= new Date()) {
    throw new HttpError(401, 'DEVICE_TOKEN_INVALID', 'This Shortcut token expired or was revoked. Pair it again in Venn.');
  }
  return record.ownerId;
}

export async function listDeviceTokens(ownerId: string) {
  return getDb().deviceToken.findMany({ where: { ownerId }, orderBy: { expiresAt: 'desc' },
    select: { id: true, label: true, expiresAt: true, revokedAt: true } });
}

export async function revokeDeviceToken(ownerId: string, id: string) {
  const changed = await getDb().deviceToken.updateMany({ where: { id, ownerId }, data: { revokedAt: new Date() } });
  if (changed.count !== 1) throw new HttpError(404, 'DEVICE_NOT_FOUND', 'That device was not found.');
  return { revoked: true };
}
