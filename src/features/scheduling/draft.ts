import { DateTime, IANAZone } from 'luxon';
import type { Activity, Candidate } from './types';

export function formatSlot(start: number, end: number, zone: string): string {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !IANAZone.isValidZone(zone)) {
    throw new RangeError('Invalid slot time');
  }
  const a = DateTime.fromMillis(start, { zone }).setLocale('en-US');
  const b = DateTime.fromMillis(end, { zone }).setLocale('en-US');
  if (!a.isValid || !b.isValid) throw new RangeError('Invalid slot time');
  const sameMeridiem = (a.hour < 12) === (b.hour < 12);
  const first = a.toFormat(sameMeridiem ? 'h:mm' : 'h:mm a').toLowerCase();
  return `${first}–${b.toFormat('h:mm a').toLowerCase()}`;
}

export function buildDraft(slots: Candidate[], zone: string, activity: Activity): string {
  if (slots.length === 0) return "i can't find a time that works in that window. could we try another day?";
  const options = slots.slice(0, 3).map(slot => formatSlot(slot.start, slot.end, zone));
  const phrase = options.length === 1 ? options[0]
    : `${options.slice(0, -1).join(', ')} or ${options[options.length - 1]}`;
  const activityPhrase = activity === 'other' || activity === 'hangout' ? '' : ` for ${activity}`;
  return options.length === 1 ? `yes! i can do ${phrase}${activityPhrase} if that works?`
    : `yes! i can do ${phrase}${activityPhrase} if any of those work?`;
}
