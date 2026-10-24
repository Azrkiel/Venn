import { DateTime, IANAZone } from 'luxon';
import type { Activity, Busy, SchedulingIntent } from './types';

export class WindowError extends Error {
  constructor(public readonly code: 'NEEDS_CLARIFICATION' | 'WINDOW_EXHAUSTED', message: string) {
    super(message); this.name = 'WindowError';
  }
}

export type ResolvedWindow = {
  window: Busy;
  queryWindow: Busy;
  preferredStart: number;
  zone: string;
  localDate: string;
};

const activityHours: Record<Activity, { start: number; end: number; preferred: number }> = {
  lunch: { start: 11, end: 14, preferred: 12 },
  dinner: { start: 17, end: 21, preferred: 18 },
  coffee: { start: 9, end: 17, preferred: 10 },
  hangout: { start: 9, end: 21, preferred: 14 },
  other: { start: 9, end: 21, preferred: 14 },
};

/** Luxon can shift DST gaps forward; compare the requested wall time to reject that shift. */
export function resolveLocalWallTime(localDate: string, time: string, zone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(time) || !IANAZone.isValidZone(zone)) {
    throw new WindowError('NEEDS_CLARIFICATION', 'Please confirm the date, time and time zone.');
  }
  const value = DateTime.fromISO(`${localDate}T${time}`, { zone });
  if (!value.isValid || value.toFormat('yyyy-MM-dd HH:mm') !== `${localDate} ${time}`
    || value.getPossibleOffsets().length !== 1) {
    throw new WindowError('NEEDS_CLARIFICATION', 'That local time is invalid or ambiguous. Please choose another time.');
  }
  return value.toMillis();
}

export function resolveWindow(intent: SchedulingIntent, receivedAt: string, zone: string): ResolvedWindow {
  if (intent.needsClarification || !intent.localDate || !IANAZone.isValidZone(zone)
    || !/(Z|[+-]\d{2}:\d{2})$/i.test(receivedAt)
    || !Number.isInteger(intent.durationMinutes) || intent.durationMinutes < 15
    || intent.durationMinutes > 240 || intent.durationMinutes % 15 !== 0) {
    throw new WindowError('NEEDS_CLARIFICATION', 'Please confirm the activity, date and duration.');
  }
  const received = DateTime.fromISO(receivedAt, { zone });
  const hours = activityHours[intent.activity];
  if (!received.isValid || !hours) {
    throw new WindowError('NEEDS_CLARIFICATION', 'Please confirm the activity, date and time zone.');
  }
  const wallTime = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  const dayStart = resolveLocalWallTime(intent.localDate, wallTime(hours.start), zone);
  const end = resolveLocalWallTime(intent.localDate, wallTime(hours.end), zone);
  const current = received.toMillis();
  let start = dayStart;
  if (current > start) {
    const nextQuarter = received.startOf('hour').plus({ minutes: Math.ceil(
      (received.minute * 60_000 + received.second * 1_000 + received.millisecond) / (15 * 60_000),
    ) * 15 });
    start = Math.max(start, nextQuarter.toMillis());
  }
  if (start + intent.durationMinutes * 60_000 > end) {
    throw new WindowError('WINDOW_EXHAUSTED', 'No time remains in that window. Please choose another date or activity.');
  }
  const preferred = resolveLocalWallTime(intent.localDate, wallTime(hours.preferred), zone);
  return {
    window: { start, end }, queryWindow: { start: start - 15 * 60_000, end: end + 15 * 60_000 },
    preferredStart: Math.max(start, Math.min(preferred, end - intent.durationMinutes * 60_000)),
    zone, localDate: intent.localDate,
  };
}
