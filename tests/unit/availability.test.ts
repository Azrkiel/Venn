import { describe, expect, it } from 'vitest';
import { availabilityInputSchema, availabilityPollSchema, planningEndDate, validateRanges } from '@/features/availability/schema';
import { aggregateAvailability } from '@/features/availability/overlap';

const poll = { activity: 'Lunch', timezone: 'America/New_York', scale: 'week' as const,
  startDate: '2026-11-01', endDate: '2026-11-07', closesAt: '2026-10-31T12:00:00Z' };

describe('availability planning windows', () => {
  it('uses local calendar spans instead of fixed milliseconds', () => {
    expect(planningEndDate('2026-11-01', 'day')).toBe('2026-11-01');
    expect(planningEndDate('2026-11-01', 'week')).toBe('2026-11-07');
    expect(planningEndDate('2026-11-01', 'fortnight')).toBe('2026-11-14');
    expect(planningEndDate('2026-01-31', 'month')).toBe('2026-02-28');
    expect(planningEndDate('2026-01-31', 'months', 3)).toBe('2026-04-30');
    expect(planningEndDate('2028-02-29', 'year')).toBe('2029-02-27');
  });
  it('includes the rest of the last month without marking it automatically free', () => {
    expect(planningEndDate('2026-10-24', 'month')).toBe('2026-11-30');
    expect(planningEndDate('2026-10-24', 'months', 3)).toBe('2027-01-31');
    const window = { ...poll, scale: 'month' as const, startDate: '2026-10-24', endDate: '2026-11-30' };
    const result = aggregateAvailability(window, []);
    expect(result.buckets.at(-1)).toEqual({ start: '2026-11-30', end: '2026-12-01', count: 0 });
    expect(result.best).toEqual([]);
  });
  it('rejects invalid dates, zones, oversized windows and identity injection', () => {
    expect(availabilityPollSchema.safeParse(poll).success).toBe(true);
    for (const change of [{ startDate: '2026-02-30' }, { timezone: 'Made/Up' },
      { endDate: '2026-11-21' }, { ownerId: 'someone' }, { scale: 'months', endDate: '2028-11-01' }]) {
      expect(availabilityPollSchema.safeParse({ ...poll, ...change }).success).toBe(false);
    }
    expect(availabilityInputSchema.safeParse({ name: 'Sam', ranges: [], userId: 'owner' }).success).toBe(false);
    expect(availabilityInputSchema.safeParse({ name: ' ', ranges: [] }).success).toBe(false);
    expect(availabilityInputSchema.safeParse({ name: 'Sam', ranges: [] }).success).toBe(true);
  });
  it('requires quarter-hour instants inside the local window including DST boundaries', () => {
    const valid = [{ start: '2026-11-01T05:00:00Z', end: '2026-11-01T06:30:00Z' }];
    expect(validateRanges(poll, valid)).toEqual(valid);
    for (const ranges of [
      [{ start: '2026-11-01T03:45:00Z', end: '2026-11-01T04:15:00Z' }],
      [{ start: '2026-11-01T05:07:00Z', end: '2026-11-01T06:30:00Z' }],
      [{ start: '2026-11-01T05:00:00Z', end: '2026-11-01T05:00:00Z' }],
      [{ start: '2026-11-01', end: '2026-11-02' }],
    ]) expect(() => validateRanges(poll, ranges)).toThrow();
  });
  it('keeps long-scale dates as dates with an exclusive end, rejecting instants', () => {
    const month = { ...poll, scale: 'month' as const, endDate: '2026-11-30' };
    expect(validateRanges(month, [{ start: '2026-11-30', end: '2026-12-01' }])).toEqual([{ start: '2026-11-30', end: '2026-12-01' }]);
    expect(() => validateRanges(month, [{ start: '2026-11-30', end: '2026-12-02' }])).toThrow();
    expect(() => validateRanges(month, [{ start: '2026-11-01T00:00:00Z', end: '2026-11-02T00:00:00Z' }])).toThrow();
  });
});

describe('self-reported availability overlap', () => {
  it('counts each person once even for duplicate overlapping ranges and preserves disjoint choices', () => {
    const input = { ...poll, scale: 'day' as const, endDate: poll.startDate };
    const range = { start: '2026-11-01T17:00:00Z', end: '2026-11-01T18:00:00Z' };
    const result = aggregateAvailability(input, [
      { ranges: [range, range, { start: '2026-11-01T19:00:00Z', end: '2026-11-01T19:15:00Z' }] },
      { ranges: [{ start: '2026-11-01T17:30:00Z', end: '2026-11-01T18:30:00Z' }] },
      { ranges: [] },
    ]);
    expect(result.buckets).toHaveLength(100); // Fall-back day is 25 hours.
    expect(result.buckets.find(bucket => bucket.start === '2026-11-01T17:30:00Z')?.count).toBe(2);
    expect(result.best[0]).toEqual({ start: '2026-11-01T17:30:00Z', end: '2026-11-01T18:00:00Z', count: 2 });
    expect(result.buckets.find(bucket => bucket.start === '2026-11-01T19:00:00Z')?.count).toBe(1);
  });
  it('never treats an empty or missing answer as free', () => {
    const input = { ...poll, scale: 'month' as const, endDate: '2026-11-30' };
    expect(aggregateAvailability(input, []).best).toEqual([]);
    const result = aggregateAvailability(input, [{ ranges: [] }, { ranges: [{ start: '2026-11-02', end: '2026-11-04' }] }]);
    expect(result.buckets).toHaveLength(30);
    expect(result.buckets.slice(0, 4).map(bucket => bucket.count)).toEqual([0, 1, 1, 0]);
    expect(result.best).toEqual([{ start: '2026-11-02', end: '2026-11-04', count: 1 }]);
  });
});
