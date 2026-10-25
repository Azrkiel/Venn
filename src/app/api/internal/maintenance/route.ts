import { timingSafeEqual } from 'node:crypto';
import { purgeExpired } from '@/features/maintenance/purge';
import { processAvailabilityNotices } from '@/features/availability/notices';
import { processCompletionNotices } from '@/features/polls/notices';
import { apiError, HttpError, privateJson } from '@/lib/http';

export const GET = async (request: Request) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new HttpError(503, 'MAINTENANCE_NOT_CONFIGURED', 'Maintenance is not configured.');
    const expected = Buffer.from(`Bearer ${secret}`), received = Buffer.from(request.headers.get('authorization') ?? '');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new HttpError(401, 'UNAUTHORIZED', 'A maintenance credential is required.');
    const availability = await processAvailabilityNotices();
    const completion = await processCompletionNotices();
    return privateJson({ ...await purgeExpired(), processed: availability.processed + completion.processed,
      availabilityProcessed: availability.processed, completionProcessed: completion.processed });
  } catch (error) { return apiError(error); }
};
