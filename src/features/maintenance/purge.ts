import { getDb } from '@/lib/db';

export async function purgeExpired(now = new Date()) {
  const db = getDb();
  const results = await db.$transaction([
    db.schedulingRequest.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.shareGrant.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] } }),
    db.invite.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] } }),
    db.deviceToken.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] } }),
    db.oAuthState.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.pairingChallenge.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.processedDelivery.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.session.deleteMany({ where: { expires: { lte: now } } }),
  ]);
  return { deletedRecords: results.reduce((total, result) => total + result.count, 0) };
}
