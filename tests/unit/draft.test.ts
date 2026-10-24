import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildDraft, formatSlot } from '@/features/scheduling/draft';
import type { Candidate } from '@/features/scheduling/types';

const zone = 'America/New_York';
const start = DateTime.fromISO('2026-10-25T12:30', { zone }).toMillis();
const slot: Candidate = { start, end: start + 60 * 60_000, freeIds: ['owner','sam'], busyIds: [], unknownIds: ['lee'] };

describe('draft replies', () => {
  it('formats only the supplied slot times in the organizer zone', () => {
    expect(formatSlot(slot.start, slot.end, zone)).toBe('12:30–1:30 pm');
    expect(formatSlot(slot.start, slot.end, 'Europe/London')).toBe('4:30–5:30 pm');
  });
  it('builds a warm reply without claiming everyone is free', () => {
    const result = buildDraft([slot], zone, 'lunch');
    expect(result).toContain('12:30–1:30 pm');
    expect(result).not.toMatch(/everyone|all free|booked|sent/i);
  });
  it('offers at most three supplied alternatives and never invents tomorrow', () => {
    const result = buildDraft([slot, { ...slot, start: start + 3_600_000, end: start + 7_200_000 }], zone, 'lunch');
    expect(result).toContain('12:30–1:30 pm'); expect(result).toContain('1:30–2:30 pm');
    expect(result).not.toMatch(/tomorrow/i);
  });
  it('has an honest no-fit reply without inventing a new time', () => {
    expect(buildDraft([], zone, 'coffee')).toBe("i can't find a time that works in that window. could we try another day?");
  });
  it('rejects invalid times rather than drafting invalid dates', () => {
    expect(() => formatSlot(0, -1, zone)).toThrow(RangeError);
    expect(() => formatSlot(start, start + 1000, 'Bad/Zone')).toThrow(RangeError);
  });
});
