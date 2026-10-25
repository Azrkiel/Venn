import { DateTime } from 'luxon';
import { isTimedScale, windowBounds, type AvailabilityRange, type AvailabilityWindow } from './schema';

export type AvailabilityBucket = AvailabilityRange & { count: number };

export function aggregateAvailability(window: AvailabilityWindow, responses: { ranges: AvailabilityRange[] }[]) {
  const timed = isTimedScale(window.scale);
  const bounds = windowBounds(window);
  const normalized = responses.map(response => response.ranges.map(range => ({
    start: timed ? DateTime.fromISO(range.start).toMillis() : range.start,
    end: timed ? DateTime.fromISO(range.end).toMillis() : range.end,
  })));
  const buckets: AvailabilityBucket[] = [];
  let cursor = bounds.start;
  while (cursor < bounds.end) {
    const next = timed ? cursor.plus({ minutes: 15 }) : cursor.plus({ days: 1 });
    const start = timed ? cursor.toUTC().toISO({ suppressMilliseconds: true })! : cursor.toISODate()!;
    const end = timed ? next.toUTC().toISO({ suppressMilliseconds: true })! : next.toISODate()!;
    const startValue = timed ? cursor.toMillis() : start;
    const endValue = timed ? next.toMillis() : end;
    const count = normalized.filter(ranges => ranges.some(range => range.start <= startValue && range.end >= endValue)).length;
    buckets.push({ start, end, count });
    cursor = next;
  }
  const merged: AvailabilityBucket[] = [];
  for (const bucket of buckets) {
    if (!bucket.count) continue;
    const previous = merged.at(-1);
    if (previous && previous.count === bucket.count && previous.end === bucket.start) previous.end = bucket.end;
    else merged.push({ ...bucket });
  }
  const duration = (range: AvailabilityRange) => timed
    ? DateTime.fromISO(range.end).toMillis() - DateTime.fromISO(range.start).toMillis()
    : DateTime.fromISO(range.end).diff(DateTime.fromISO(range.start), 'days').days;
  const best = merged.sort((a, b) => b.count - a.count || duration(b) - duration(a) || a.start.localeCompare(b.start)).slice(0, 3);
  return { buckets, best };
}
