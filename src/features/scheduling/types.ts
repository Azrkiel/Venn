export type Activity = 'lunch' | 'coffee' | 'dinner' | 'hangout' | 'other';
export type Busy = { start: number; end: number };
export type Availability = {
  memberId: string;
  state: 'known' | 'unknown';
  busy: Busy[];
};
export type Candidate = {
  start: number;
  end: number;
  freeIds: string[];
  busyIds: string[];
  unknownIds: string[];
};
export type RankInput = {
  window: Busy;
  durationMs: number;
  stepMs: number;
  bufferMs: number;
  preferredStart: number;
  requiredIds: string[];
  members: Availability[];
};
export type SchedulingIntent = {
  activity: Activity;
  localDate: string | null;
  durationMinutes: number;
  needsClarification: boolean;
  clarificationReason: 'date' | 'duration' | 'activity' | null;
};
