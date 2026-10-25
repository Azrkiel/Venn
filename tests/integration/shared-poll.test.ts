import { beforeEach, describe, expect, it, vi } from 'vitest';

const { availability, options } = vi.hoisted(() => ({ availability: vi.fn(), options: vi.fn() }));
vi.mock('@/features/availability/service', () => ({ getAvailabilityPoll: availability }));
vi.mock('@/features/polls/service', () => ({ getPublicPoll: options }));

import { loadSharedPoll } from '@/features/polls/shared';
import { HttpError } from '@/lib/http';

describe('shared link routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores the new poll using only the current viewer identity', async () => {
    const poll = { activity: 'beach', ownResponse: { name: 'Lee', ranges: [] } };
    availability.mockResolvedValueOnce(poll);
    const actor = { guestKey: 'browser-secret', userId: 'signed-in-owner' };
    await expect(loadSharedPoll('shared-token', actor)).resolves.toEqual({ kind: 'availability', poll });
    expect(availability).toHaveBeenCalledWith('shared-token', actor);
    expect(options).not.toHaveBeenCalled();
  });

  it('retains existing option polls when no availability poll matches', async () => {
    availability.mockRejectedValueOnce(new HttpError(404, 'POLL_NOT_FOUND', 'Unknown link'));
    options.mockResolvedValueOnce({ activity: 'lunch', options: [] });
    await expect(loadSharedPoll('old-token')).resolves.toEqual({ kind: 'options', poll: { activity: 'lunch', options: [] } });
    expect(options).toHaveBeenCalledWith('old-token');
  });

  it('does not mask a revoked/expired poll or a backend outage by falling through', async () => {
    for (const error of [new HttpError(410, 'POLL_EXPIRED', 'Expired'), new Error('unavailable')]) {
      availability.mockRejectedValueOnce(error);
      await expect(loadSharedPoll('shared-token')).rejects.toBe(error);
    }
    expect(options).not.toHaveBeenCalled();
  });
});
