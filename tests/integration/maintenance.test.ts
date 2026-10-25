import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/internal/maintenance/route';

const { availability, completion, purge } = vi.hoisted(() => ({ availability: vi.fn(), completion: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/availability/notices', () => ({ processAvailabilityNotices: availability }));
vi.mock('@/features/polls/notices', () => ({ processCompletionNotices: completion }));
vi.mock('@/features/maintenance/purge', () => ({ purgeExpired: purge }));

describe('protected maintenance processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'maintenance-test-secret');
    availability.mockResolvedValue({ processed: 2 });
    completion.mockResolvedValue({ processed: 3 });
    purge.mockResolvedValue({ deletedRecords: 4 });
  });

  it('processes both poll types before expiry cleanup and returns combined counts', async () => {
    const response = await GET(new Request('https://venn.invalid/api/internal/maintenance', {
      headers: { authorization: 'Bearer maintenance-test-secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 5, availabilityProcessed: 2, completionProcessed: 3, deletedRecords: 4 });
    expect(availability.mock.invocationCallOrder[0]).toBeLessThan(purge.mock.invocationCallOrder[0]);
    expect(completion.mock.invocationCallOrder[0]).toBeLessThan(purge.mock.invocationCallOrder[0]);
  });

  it('rejects an invalid credential before any notification or database work', async () => {
    const response = await GET(new Request('https://venn.invalid/api/internal/maintenance', {
      headers: { authorization: 'Bearer wrong' },
    }));
    expect(response.status).toBe(401);
    expect(availability).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });
});
