import { createHash, randomBytes } from 'node:crypto';

export const createSecret = () => randomBytes(32).toString('base64url');
export const digestSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
export const calendarEventId = (ownerId: string, requestId: string) =>
  `v${digestSecret(JSON.stringify([ownerId, requestId]))}`;
