import { describe, expect, it, vi } from 'vitest';
import { prepareRequest, type RequestContext } from '@/features/requests/prepare';

const group: RequestContext = { id: 'g', name: 'Lunch crew', ownerId: 'owner-user', members: [
  { id: 'owner', userId: 'owner-user', displayName: 'You' },
  { id: 'sam', userId: 'sam-user', displayName: 'Sam' },
  { id: 'lee', userId: null, displayName: 'Lee' },
] };
const input = { ownerId: 'owner-user', requesterMemberId: 'sam', group,
  text: 'private original message', receivedAt: '2026-10-24T13:00:00Z', timezone: 'America/New_York' };
const intent = { activity: 'lunch' as const, localDate: '2026-10-25', durationMinutes: 60,
  needsClarification: false, clarificationReason: null };
const deps = () => ({ parse: vi.fn(async () => intent),
  availability: vi.fn(async (userId: string) => ({ memberId: userId, state: 'known' as const, busy: [] })) });

describe('request orchestration', () => {
  it('checks authorization before using the model or calendars', async () => {
    const services = deps();
    await expect(prepareRequest({ ...input, ownerId: 'attacker' }, services)).rejects.toMatchObject({ status: 403 });
    expect(services.parse).not.toHaveBeenCalled();
    expect(services.availability).not.toHaveBeenCalled();
  });
  it('does not guess an unmatched requester', async () => {
    await expect(prepareRequest({ ...input, requesterMemberId: 'someone-else' }, deps())).rejects.toMatchObject({ code: 'REQUESTER_REQUIRED' });
  });
  it('produces live-path normalized options without retaining the original ask', async () => {
    const result = await prepareRequest(input, deps());
    expect(result.state).toBe('ready');
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].freeIds).toHaveLength(2);
    expect(result.slots[0].unknownIds).toEqual(['lee']);
    expect(JSON.stringify(result)).not.toContain(input.text);
  });
  it('never treats a calendar exception as free availability', async () => {
    const services = deps();
    services.availability.mockRejectedValue(new Error('raw provider payload'));
    const result = await prepareRequest(input, services);
    expect(result.state).toBe('retry_required');
    expect(result.slots).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('raw provider');
  });
  it('asks for clarification without fetching calendars', async () => {
    const services = deps();
    services.parse.mockResolvedValue({ ...intent, localDate: null as unknown as string,
      needsClarification: true, clarificationReason: 'date' as unknown as null });
    const result = await prepareRequest(input, services);
    expect(result.state).toBe('needs_clarification');
    expect(services.availability).not.toHaveBeenCalled();
  });
});
