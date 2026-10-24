import { describe, expect, it } from 'vitest';
import { rankSlots, type RankInput, type Availability } from '@/features/scheduling/rank';

const minute = 60_000;
const hour = (n: number) => n * 60 * minute;
const owner: Availability = { memberId: 'owner', state: 'known', busy: [] };
const sam: Availability = { memberId: 'sam', state: 'known', busy: [] };
const base: RankInput = {
  window: { start: hour(11), end: hour(14) }, durationMs: hour(1),
  stepMs: 15 * minute, bufferMs: 15 * minute, preferredStart: hour(12),
  requiredIds: ['owner', 'sam'], members: [owner, sam],
};

describe('rankSlots', () => {
  it('requires the requester to be known', () => {
    expect(rankSlots({ ...base, members: [owner, { ...sam, state: 'unknown' }] })).toEqual([]);
  });
  it('requires the organizer to be free', () => {
    expect(rankSlots({ ...base, members: [{ ...owner, busy: [{ start: hour(10), end: hour(15) }] }, sam] })).toEqual([]);
  });
  it('permits exactly one buffer gap without doubling it', () => {
    expect(rankSlots({ ...base, window: { start: hour(12), end: hour(13) },
      members: [{ ...owner, busy: [{ start: hour(11), end: hour(11.75) }] }, sam] })[0]?.start).toBe(hour(12));
  });
  it('blocks a gap shorter than the buffer', () => {
    expect(rankSlots({ ...base, window: { start: hour(12), end: hour(13) },
      members: [{ ...owner, busy: [{ start: hour(11), end: hour(11.8) }] }, sam] })).toEqual([]);
  });
  it('rejects a busy requester even when everyone else is free', () => {
    expect(rankSlots({ ...base, members: [owner, { ...sam, busy: [{ start: hour(10), end: hour(15) }] }] })).toEqual([]);
  });
  it('ranks everyone-free above a closer partial-attendance option', () => {
    const slots = rankSlots({ ...base, members: [owner, sam, { memberId: 'jordan', state: 'known',
      busy: [{ start: hour(11.75), end: hour(12.5) }] }] });
    expect(slots[0].start).toBe(hour(12.75));
    expect(slots[0].freeIds).toHaveLength(3);
  });
  it('never counts an unconnected member as free', () => {
    const slots = rankSlots({ ...base, members: [owner, sam, { memberId: 'lee', state: 'unknown', busy: [] }] });
    expect(slots[0].freeIds).toHaveLength(2);
    expect(slots[0].unknownIds).toEqual(['lee']);
  });
  it('returns at most three non-overlapping alternatives', () => {
    const slots = rankSlots(base);
    expect(slots.length).toBeLessThanOrEqual(3);
    for (const [i, a] of slots.entries()) {
      expect(slots.slice(i + 1).every(b => a.end <= b.start || a.start >= b.end)).toBe(true);
    }
  });
  it('works when organizer and requester are the same member', () => {
    expect(rankSlots({ ...base, requiredIds: ['owner'], members: [owner] }).length).toBeGreaterThan(0);
  });
  it('does not fit a duration longer than the window', () => {
    expect(rankSlots({ ...base, durationMs: hour(4) })).toEqual([]);
  });
  it('rejects invalid steps, ranges, duplicate members and missing required members', () => {
    expect(() => rankSlots({ ...base, stepMs: 0 })).toThrow(RangeError);
    expect(() => rankSlots({ ...base, window: { start: 5, end: 1 } })).toThrow(RangeError);
    expect(() => rankSlots({ ...base, members: [owner, owner] })).toThrow(RangeError);
    expect(() => rankSlots({ ...base, requiredIds: ['missing'] })).toThrow(RangeError);
  });
  it('rejects malformed busy intervals instead of calling them free', () => {
    expect(() => rankSlots({ ...base, members: [{ ...owner, busy: [{ start: 2, end: 1 }] }, sam] })).toThrow(RangeError);
  });
});
