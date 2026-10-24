import { timingSafeEqual } from 'node:crypto';
import { purgeExpired } from '@/features/maintenance/purge';
import { apiError, HttpError, privateJson } from '@/lib/http';

export const GET = async (request: Request) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new HttpError(503, 'MAINTENANCE_NOT_CONFIGURED', 'Maintenance is not configured.');
    const expected = Buffer.from(`Bearer ${secret}`), received = Buffer.from(request.headers.get('authorization') ?? '');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new HttpError(401, 'UNAUTHORIZED', 'A maintenance credential is required.');
    return privateJson(await purgeExpired());
  } catch (error) { return apiError(error); }
};
