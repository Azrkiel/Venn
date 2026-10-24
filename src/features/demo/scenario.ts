import { DateTime } from 'luxon';
import { rankSlots, type Availability, type Busy, type Candidate } from '@/features/scheduling/rank';

export type DemoActivity = 'lunch' | 'coffee' | 'dinner';
export type DemoGroupId = 'lunch-crew' | 'roommates';
export type DemoPerson = {
  id: string;
  name: string;
  initials: string;
  color: 'blue' | 'peach' | 'purple' | 'sage';
  connected: boolean;
};

export const DEMO_GROUPS: { id: DemoGroupId; name: string; people: DemoPerson[] }[] = [
  { id: 'lunch-crew', name: 'Lunch crew', people: [
    { id: 'you', name: 'You', initials: 'Y', color: 'blue', connected: true },
    { id: 'sam', name: 'Sam', initials: 'S', color: 'peach', connected: true },
    { id: 'jordan', name: 'Jordan', initials: 'J', color: 'purple', connected: true },
    { id: 'lee', name: 'Lee', initials: 'L', color: 'sage', connected: false },
  ] },
  { id: 'roommates', name: 'Roommates', people: [
    { id: 'you', name: 'You', initials: 'Y', color: 'blue', connected: true },
    { id: 'maya', name: 'Maya', initials: 'M', color: 'peach', connected: true },
    { id: 'theo', name: 'Theo', initials: 'T', color: 'purple', connected: true },
  ] },
];

export const DEMO_ACTIVITIES: Record<DemoActivity, {
  label: string; duration: number; startHour: number; endHour: number; preferredHour: number;
}> = {
  lunch: { label: 'Lunch', duration: 60, startHour: 11, endHour: 14, preferredHour: 12 },
  coffee: { label: 'Coffee', duration: 30, startHour: 9, endHour: 17, preferredHour: 10 },
  dinner: { label: 'Dinner', duration: 90, startHour: 17, endHour: 21, preferredHour: 18.5 },
};

export type DemoScenarioInput = {
  date: string;
  timeZone: string;
  activity: DemoActivity;
  groupId: DemoGroupId;
  requesterId: string;
  friendBusy: boolean;
  ownerBooked?: boolean;
};

export type DemoScenario = {
  people: DemoPerson[];
  members: Availability[];
  slots: Candidate[];
  window: Busy;
  day: DateTime;
  groupName: string;
  activity: typeof DEMO_ACTIVITIES[DemoActivity];
};

export function createDemoScenario(input: DemoScenarioInput): DemoScenario {
  const group = DEMO_GROUPS.find(group => group.id === input.groupId) ?? DEMO_GROUPS[0];
  const activity = DEMO_ACTIVITIES[input.activity];
  const day = DateTime.fromISO(input.date, { zone: input.timeZone }).startOf('day');
  if (!day.isValid) throw new RangeError('Choose a valid date and time zone.');
  const at = (hour: number) => day.set({ hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) }).toMillis();
  const interval = (start: number, end: number): Busy => ({ start: at(start), end: at(end) });
  const window = interval(activity.startHour, activity.endHour);
  const members: Availability[] = group.people.map((person, index) => {
    const busy = index === 0
      ? [interval(9, 10.5), interval(15, 16), interval(19.5, 20.25)]
      : index === 1
        ? [interval(9.5, 10), interval(14.5, 15.5), interval(17, 17.5)]
        : [interval(9.75, 10.5), interval(15.25, 16.25), interval(20.5, 21)];
    if (input.friendBusy && index === 2) {
      const center = activity.preferredHour;
      busy.push(interval(center + 0.25, center + 0.75));
    }
    if (input.ownerBooked && index === 0) busy.push({ ...window });
    return { memberId: person.id, state: person.connected ? 'known' : 'unknown', busy };
  });
  return {
    people: group.people, members, window, day, groupName: group.name, activity,
    slots: rankSlots({ window, members, requiredIds: ['you', input.requesterId],
      durationMs: activity.duration * 60_000, stepMs: 15 * 60_000,
      bufferMs: 15 * 60_000, preferredStart: at(activity.preferredHour) }),
  };
}

export function formatDemoTime(milliseconds: number, timeZone: string) {
  return DateTime.fromMillis(milliseconds, { zone: timeZone }).toFormat('h:mm');
}

export function formatDemoRange(slot: Busy, timeZone: string) {
  const start = DateTime.fromMillis(slot.start, { zone: timeZone });
  const end = DateTime.fromMillis(slot.end, { zone: timeZone });
  return `${start.toFormat('h:mm')}–${end.toFormat('h:mm a').toLowerCase()}`;
}

export function makeDemoDraft(slots: Candidate[], selectedIndex: number, timeZone: string) {
  const selected = slots[selectedIndex];
  if (!selected) return '';
  const alternative = slots.find((_, index) => index !== selectedIndex);
  return `yes! i can do ${formatDemoRange(selected, timeZone)}${alternative ? `, or ${formatDemoRange(alternative, timeZone)} if that's easier` : ` if that works for you`}.`;
}
