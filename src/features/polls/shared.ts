import { getAvailabilityPoll } from '@/features/availability/service';
import { HttpError } from '@/lib/http';
import { getPublicPoll } from './service';

/** One link surface preserves existing option polls alongside availability Venns. */
export async function loadSharedPoll(share: string, actor?: { userId?: string; guestKey?: string }) {
  try {
    return { kind: 'availability' as const, poll: await getAvailabilityPoll(share, actor) };
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  return { kind: 'options' as const, poll: await getPublicPoll(share) };
}
