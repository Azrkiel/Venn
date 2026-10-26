import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';
import { HttpError } from '@/lib/http';
import { pictureInputSchema } from '@/features/profile-pictures/schema';

export const availabilityScales = ['day', 'week', 'fortnight', 'month', 'months', 'year'] as const;
export type AvailabilityScale = typeof availabilityScales[number];
export type AvailabilityRange = { start: string; end: string };
export type AvailabilityWindow = { scale: AvailabilityScale; startDate: string; endDate: string; timezone: string };
export const isTimedScale = (scale: AvailabilityScale) => ['day', 'week', 'fortnight'].includes(scale);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && DateTime.fromISO(value, { zone: 'UTC' }).toISODate() === value;
const dateSchema = z.string().refine(validDate, 'Use a valid calendar date.');
const nameSchema = z.string().trim().min(1).max(40).regex(/^[^\p{C}]+$/u);

export function planningEndDate(startDate: string, scale: AvailabilityScale, monthCount = 2): string {
  const start = DateTime.fromISO(startDate, { zone: 'UTC' });
  const end = scale === 'day' ? start : scale === 'week' ? start.plus({ days: 6 })
    : scale === 'fortnight' ? start.plus({ days: 13 })
    : start.plus(scale === 'year' ? { years: 1 } : { months: scale === 'months' ? monthCount : 1 }).minus({ days: 1 });
  return (scale === 'month' || scale === 'months' ? end.endOf('month') : end).toISODate() ?? '';
}

export const availabilityPollSchema = z.object({
  activity: z.string().trim().min(1).max(100).regex(/^[^\p{C}]+$/u),
  timezone: z.string().max(80).refine(zone => IANAZone.isValidZone(zone)),
  scale: z.enum(availabilityScales), startDate: dateSchema, endDate: dateSchema,
  closesAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((input, context) => {
  const validEnd = input.scale === 'months'
    ? Array.from({ length: 11 }, (_, index) => planningEndDate(input.startDate, input.scale, index + 2)).includes(input.endDate)
    : planningEndDate(input.startDate, input.scale) === input.endDate;
  if (!validEnd) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Choose a date range matching the planning scale.' });
});
export type AvailabilityPollInput = z.infer<typeof availabilityPollSchema>;

export const availabilityInputSchema = z.object({
  name: nameSchema,
  picture: pictureInputSchema.optional(),
  ranges: z.array(z.object({ start: z.string().min(10).max(40), end: z.string().min(10).max(40) }).strict()).max(768),
}).strict();
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;

export function windowBounds(window: AvailabilityWindow) {
  const start = DateTime.fromISO(window.startDate, { zone: window.timezone }).startOf('day');
  const end = DateTime.fromISO(window.endDate, { zone: window.timezone }).plus({ days: 1 }).startOf('day');
  return { start, end };
}

/** Date ranges deliberately remain dates; a whole-day answer never asserts calendar availability. */
export function validateRanges(window: AvailabilityWindow, ranges: AvailabilityRange[]): AvailabilityRange[] {
  const invalid = () => new HttpError(422, 'INVALID_AVAILABILITY', 'Choose valid ranges inside this Venn. Times use 15-minute steps.');
  const timed = isTimedScale(window.scale);
  const bounds = windowBounds(window);
  return ranges.map(range => {
    if (!timed) {
      if (!validDate(range.start) || !validDate(range.end) || range.start >= range.end
        || range.start < window.startDate || range.end > bounds.end.toISODate()!) throw invalid();
      return { ...range };
    }
    // An explicit offset disambiguates repeated hours when clocks fall back.
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(range.start) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(range.end)) throw invalid();
    const start = DateTime.fromISO(range.start, { zone: window.timezone });
    const end = DateTime.fromISO(range.end, { zone: window.timezone });
    if (!start.isValid || !end.isValid || start >= end || start < bounds.start || end > bounds.end
      || [start, end].some(time => time.minute % 15 !== 0 || time.second !== 0 || time.millisecond !== 0)) throw invalid();
    return { start: start.toUTC().toISO({ suppressMilliseconds: true })!, end: end.toUTC().toISO({ suppressMilliseconds: true })! };
  });
}
