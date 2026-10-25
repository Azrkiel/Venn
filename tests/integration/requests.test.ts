import { describe, expect, it, vi } from 'vitest';
import { prepareRequest, type RequestContext } from '@/features/requests/prepare';
import type { Availability } from '@/features/scheduling/types';
import { requestSchema } from '@/features/requests/schema';

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

describe('solo requests', () => {
  const solo = { ownerId: 'owner-user', group: null, text: 'private original message',
    receivedAt: '2026-10-24T13:00:00Z', timezone: 'America/New_York' };
  const deps = () => ({ parse: vi.fn(async () => intent),
    availability: vi.fn(async (userId: string): Promise<Availability> => ({ memberId: userId, state: 'known', busy: [] })) });
  it('checks only the organizer calendar and offers slots when free', async () => {
    const services = deps();
    const result = await prepareRequest(solo, services);
    expect(result.state).toBe('ready');
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].freeIds).toEqual(['self']);
    expect(result.participants).toEqual([{ id: 'self', userId: 'owner-user', displayName: 'You' }]);
    expect(services.availability).toHaveBeenCalledTimes(1);
    expect(services.availability).toHaveBeenCalledWith('owner-user', expect.anything());
    expect(JSON.stringify(result)).not.toContain(solo.text);
  });
  it('returns no_slots when the organizer is busy all day', async () => {
    const services = deps();
    services.availability.mockImplementation(async (userId: string) => ({ memberId: userId, state: 'known' as const,
      busy: [{ start: Date.parse('2026-10-24T00:00:00Z'), end: Date.parse('2026-10-27T00:00:00Z') }] }));
    const result = await prepareRequest(solo, services);
    expect(result.state).toBe('no_slots'); expect(result.slots).toEqual([]);
  });
  it('requires a retry when the organizer availability is unknown', async () => {
    const services = deps();
    services.availability.mockResolvedValue({ memberId: 'owner-user', state: 'unknown' as const, busy: [] });
    expect((await prepareRequest(solo, services)).state).toBe('retry_required');
    services.availability.mockRejectedValue(new Error('provider'));
    const failed = await prepareRequest(solo, services);
    expect(failed.state).toBe('retry_required'); expect(failed.slots).toEqual([]);
  });
});

describe('request input schema', () => {
  const base = { text: ' lunch tomorrow? ', timezone: 'America/New_York' };
  it('accepts solo (neither id) and group (both ids)', () => {
    expect(requestSchema.safeParse(base).success).toBe(true);
    expect(requestSchema.safeParse({ ...base, groupId: 'g', requesterMemberId: 'm' }).success).toBe(true);
  });
  it('rejects one id without the other, unknown keys and a bad timezone', () => {
    expect(requestSchema.safeParse({ ...base, groupId: 'g' }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, requesterMemberId: 'm' }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, ownerId: 'x' }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, timezone: 'Mars/Base' }).success).toBe(false);
  });
});
