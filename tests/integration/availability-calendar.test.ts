import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCalendarReference } from '@/features/availability/calendar-reference';
import { GET } from '@/app/api/venns/[share]/calendar/route';

const { poll, status, availability, userId, configured, rateLimit } = vi.hoisted(() => ({
  poll: vi.fn(), status: vi.fn(), availability: vi.fn(), userId: vi.fn(), configured: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock('@/features/availability/service', () => ({ getAvailabilityPoll: poll }));
vi.mock('@/features/calendar/client', () => ({ getCalendarStatus: status, getUserAvailability: availability }));
vi.mock('@/auth', () => ({ currentUserId: userId, loginConfigured: configured }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: rateLimit }));

const share = 's'.repeat(43);
const view = { startDate: '2030-11-01', endDate: '2030-11-14', timezone: 'America/New_York', scale: 'fortnight' };
const visible = { start: '2030-11-01T04:00:00Z', end: '2030-11-08T05:00:00Z' };
const connected = { state: 'connected', canWrite: false,
  calendars: [{ id: 'private-calendar-id', name: 'Private Calendar Name', enabled: true, writable: false }] };

describe('private calendar reference for an availability Venn', () => {
  beforeEach(() => {
    vi.clearAllMocks(); poll.mockResolvedValue(view); status.mockResolvedValue(connected);
    availability.mockResolvedValue({ memberId: 'viewer-private-id', state: 'known', busy: [] });
    userId.mockResolvedValue('viewer-private-id'); configured.mockReturnValue(true); rateLimit.mockResolvedValue(undefined);
  });
  it('checks only the signed-in viewer and whitelists/clips busy ranges without calendar identities or details', async () => {
    availability.mockResolvedValue({ memberId: 'viewer-private-id', state: 'known',
      calendarId: 'private-calendar-id', token: 'private-token', busy: [
        { start: Date.parse('2030-10-31T23:00:00Z'), end: Date.parse('2030-11-01T06:00:00Z'), title: 'Private Meeting' },
        { start: Date.parse('2030-11-01T05:30:00Z'), end: Date.parse('2030-11-01T07:00:00Z') },
        { start: Date.parse('2030-12-01T05:30:00Z'), end: Date.parse('2030-12-01T07:00:00Z') },
      ] });
    const result = await getCalendarReference('viewer-private-id', share, visible);
    expect(result).toMatchObject({ state: 'known', busy: [{ start: '2030-11-01T04:00:00.000Z', end: '2030-11-01T07:00:00.000Z' }] });
    expect(availability).toHaveBeenCalledWith('viewer-private-id', { start: Date.parse(visible.start), end: Date.parse(visible.end) });
    expect(status).toHaveBeenCalledWith('viewer-private-id');
    expect(Object.keys(result).sort()).toEqual(['busy', 'checkedAt', 'state']);
    expect(JSON.stringify(result)).not.toMatch(/viewer-private-id|private-calendar-id|Private Calendar Name|Private Meeting|private-token|memberId|calendarId/);
  });
  it('clips a partially overlapping visible week to the Venn rather than querying unrelated dates', async () => {
    await getCalendarReference('viewer-private-id', share, { start: '2030-10-28T04:00:00Z', end: visible.end });
    expect(availability).toHaveBeenCalledWith('viewer-private-id', { start: Date.parse(visible.start), end: Date.parse(visible.end) });
  });
  it('rejects missing identity, invalid/revoked share and malformed, disjoint or oversized windows before Google access', async () => {
    await expect(getCalendarReference('', share, visible)).rejects.toMatchObject({ status: 401, code: 'SIGN_IN_REQUIRED' });
    for (const invalid of [
      { start: '2030-11-01', end: visible.end }, { start: visible.end, end: visible.start },
      { start: '2030-12-01T00:00:00Z', end: '2030-12-02T00:00:00Z' },
      { start: '2030-10-01T00:00:00Z', end: '2030-11-20T00:00:00Z' },
      { ...visible, userId: 'organizer' },
    ]) await expect(getCalendarReference('viewer', share, invalid)).rejects.toMatchObject({ status: 422 });
    poll.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 410, code: 'VENN_EXPIRED' }));
    await expect(getCalendarReference('viewer', share, visible)).rejects.toMatchObject({ status: 410 });
    expect(status).not.toHaveBeenCalled(); expect(availability).not.toHaveBeenCalled();
  });
  it.each(['disconnected', 'reconnect'])('returns explicit %s state without treating the calendar as free', async state => {
    status.mockResolvedValue({ ...connected, state });
    expect(await getCalendarReference('viewer', share, visible)).toMatchObject({ state, busy: [] });
    expect(availability).not.toHaveBeenCalled();
  });
  it('distinguishes connected with no enabled calendars from connected with no busy events', async () => {
    status.mockResolvedValue({ ...connected, calendars: [{ ...connected.calendars[0], enabled: false }] });
    expect(await getCalendarReference('viewer', share, visible)).toMatchObject({ state: 'no_calendars', busy: [] });
    expect(availability).not.toHaveBeenCalled();
    status.mockResolvedValue(connected);
    expect(await getCalendarReference('viewer', share, visible)).toMatchObject({ state: 'known', busy: [] });
  });
  it('preserves unknown on provider failure, partial coverage or malformed busy data', async () => {
    for (const result of [
      { memberId: 'viewer', state: 'unknown', busy: [] },
      { memberId: 'viewer', state: 'known', busy: [{ start: Number.NaN, end: 3 }] },
    ]) {
      availability.mockResolvedValue(result);
      expect(await getCalendarReference('viewer', share, visible)).toMatchObject({ state: 'unknown', busy: [] });
    }
    availability.mockRejectedValue(new Error('private provider body'));
    expect(await getCalendarReference('viewer', share, visible)).toMatchObject({ state: 'unknown', busy: [] });
    status.mockRejectedValue(new Error('private db credentials'));
    expect(await getCalendarReference('viewer', share, visible)).toMatchObject({ state: 'unknown', busy: [] });
  });
  it('accepts a six-week date view across a daylight-saving transition', async () => {
    poll.mockResolvedValue({ ...view, scale: 'month', startDate: '2030-11-01', endDate: '2030-11-30' });
    await expect(getCalendarReference('viewer', share, { start: '2030-10-27T04:00:00Z', end: '2030-12-08T05:00:00Z' }))
      .resolves.toMatchObject({ state: 'known' });
  });
});

describe('private calendar reference route', () => {
  const request = () => new Request(`http://localhost:3000/api/venns/${share}/calendar?${new URLSearchParams(visible)}`);
  const context = { params: Promise.resolve({ share }) };
  beforeEach(() => {
    vi.clearAllMocks(); poll.mockResolvedValue(view); status.mockResolvedValue(connected);
    availability.mockResolvedValue({ memberId: 'viewer-private-id', state: 'known', busy: [] });
    userId.mockResolvedValue('viewer-private-id'); configured.mockReturnValue(true); rateLimit.mockResolvedValue(undefined);
  });
  it('requires viewer authentication and never exposes a calendar reference to a guest', async () => {
    userId.mockResolvedValue(null);
    const result = await GET(request(), context);
    expect(result.status).toBe(401); expect(await result.json()).toMatchObject({ error: { code: 'SIGN_IN_REQUIRED' } });
    expect(availability).not.toHaveBeenCalled(); expect(poll).not.toHaveBeenCalled();
  });
  it('returns private no-store data and ignores a query attempt to select another user', async () => {
    const query = request();
    const result = await GET(new Request(`${query.url}&userId=organizer`), context);
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(status).toHaveBeenCalledWith('viewer-private-id');
    expect(rateLimit).toHaveBeenCalledWith('venn-calendar:viewer-private-id', 20);
    expect(await result.json()).toMatchObject({ state: 'known', busy: [] });
  });
});
