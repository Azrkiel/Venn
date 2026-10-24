import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { resolveWindow, resolveLocalWallTime } from '@/features/scheduling/windows';
import type { SchedulingIntent } from '@/features/scheduling/types';

const intent: SchedulingIntent = { activity: 'lunch', localDate: '2026-10-25', durationMinutes: 60,
  needsClarification: false, clarificationReason: null };
const zone = 'America/New_York';
const receivedAt = '2026-10-24T16:00:00Z';

describe('resolveWindow', () => {
  it('builds activity hours in the stored IANA zone and expands the query by one buffer', () => {
    const result = resolveWindow(intent, receivedAt, zone);
    expect(DateTime.fromMillis(result.window.start, { zone }).toFormat('HH:mm')).toBe('11:00');
    expect(DateTime.fromMillis(result.window.end, { zone }).toFormat('HH:mm')).toBe('14:00');
    expect(result.queryWindow.start).toBe(result.window.start - 15 * 60_000);
    expect(result.queryWindow.end).toBe(result.window.end + 15 * 60_000);
  });
  it('uses different UTC windows for different time zones', () => {
    expect(resolveWindow(intent, receivedAt, zone).window.start)
      .not.toBe(resolveWindow(intent, receivedAt, 'Europe/London').window.start);
  });
  it('rounds today forward to the next grid boundary and never offers past time', () => {
    const result = resolveWindow({ ...intent, localDate: '2026-10-24' }, '2026-10-24T16:07:30Z', zone);
    expect(DateTime.fromMillis(result.window.start, { zone }).toFormat('HH:mm:ss')).toBe('12:15:00');
  });
  it('does not unnecessarily round an exact grid boundary forward', () => {
    const result = resolveWindow({ ...intent, localDate: '2026-10-24' }, '2026-10-24T16:15:00Z', zone);
    expect(DateTime.fromMillis(result.window.start, { zone }).toFormat('HH:mm')).toBe('12:15');
  });
  it('does not silently move an exhausted today to tomorrow', () => {
    expect(() => resolveWindow({ ...intent, localDate: '2026-10-24' }, '2026-10-24T19:00:00Z', zone))
      .toThrowError(expect.objectContaining({ code: 'WINDOW_EXHAUSTED' }));
  });
  it('rejects a past date, impossible date, invalid timezone and unresolved intent', () => {
    expect(() => resolveWindow({ ...intent, localDate: '2026-10-23' }, receivedAt, zone)).toThrowError(expect.objectContaining({ code: 'WINDOW_EXHAUSTED' }));
    expect(() => resolveWindow({ ...intent, localDate: '2026-02-30' }, receivedAt, zone)).toThrowError(expect.objectContaining({ code: 'NEEDS_CLARIFICATION' }));
    expect(() => resolveWindow(intent, receivedAt, 'Bad/Zone')).toThrowError(expect.objectContaining({ code: 'NEEDS_CLARIFICATION' }));
    expect(() => resolveWindow({ ...intent, needsClarification: true }, receivedAt, zone)).toThrowError(expect.objectContaining({ code: 'NEEDS_CLARIFICATION' }));
  });
  it('keeps the intended local lunch time across the DST transition', () => {
    const result = resolveWindow({ ...intent, localDate: '2026-11-01' }, '2026-10-31T12:00:00Z', zone);
    expect(DateTime.fromMillis(result.window.start).toUTC().toISO()).toBe('2026-11-01T16:00:00.000Z');
  });
});

describe('resolveLocalWallTime', () => {
  it('rejects a nonexistent spring-forward wall time', () => {
    expect(() => resolveLocalWallTime('2026-03-08', '02:30', zone))
      .toThrowError(expect.objectContaining({ code: 'NEEDS_CLARIFICATION' }));
  });
  it('rejects an ambiguous fall-back wall time', () => {
    expect(() => resolveLocalWallTime('2026-11-01', '01:30', zone))
      .toThrowError(expect.objectContaining({ code: 'NEEDS_CLARIFICATION' }));
  });
  it('resolves an ordinary explicit wall time exactly', () => {
    expect(DateTime.fromMillis(resolveLocalWallTime('2026-10-25', '12:30', zone)).toUTC().toISO())
      .toBe('2026-10-25T16:30:00.000Z');
  });
});
