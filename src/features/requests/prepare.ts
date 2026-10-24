import { HttpError } from '@/lib/http';
import { rankSlots } from '@/features/scheduling/rank';
import { resolveWindow, WindowError } from '@/features/scheduling/windows';
import { buildDraft } from '@/features/scheduling/draft';
import type { Availability, Busy, Candidate, SchedulingIntent } from '@/features/scheduling/types';

export type RequestContext = {
  id: string; name: string; ownerId: string;
  members: { id: string; userId: string | null; displayName: string }[];
};
type Input = {
  ownerId: string; requesterMemberId: string; group: RequestContext;
  text: string; receivedAt: string; timezone: string;
};
type Dependencies = {
  parse: (text: string, receivedAt: string, zone: string) => Promise<SchedulingIntent>;
  availability: (userId: string, window: Busy) => Promise<Availability>;
};
export type PreparedRequest = {
  state: 'ready' | 'no_slots' | 'retry_required' | 'needs_clarification';
  intent: SchedulingIntent; timezone: string; slots: Candidate[];
  participants: RequestContext['members']; draft: string; checkedAt: string;
};

export async function prepareRequest(input: Input, services: Dependencies): Promise<PreparedRequest> {
  if (input.group.ownerId !== input.ownerId) throw new HttpError(403, 'FORBIDDEN', 'This group belongs to another organizer.');
  const organizer = input.group.members.find(member => member.userId === input.ownerId);
  const requester = input.group.members.find(member => member.id === input.requesterMemberId && member.userId);
  if (!organizer || !requester) throw new HttpError(422, 'REQUESTER_REQUIRED', 'Choose the connected group member who is asking.');
  const intent = await services.parse(input.text, input.receivedAt, input.timezone);
  const base = { intent, timezone: input.timezone, participants: input.group.members, slots: [] as Candidate[],
    draft: '', checkedAt: input.receivedAt };
  if (intent.needsClarification) return { ...base, state: 'needs_clarification' };
  let resolved;
  try { resolved = resolveWindow(intent, input.receivedAt, input.timezone); }
  catch (error) {
    if (error instanceof WindowError && error.code === 'WINDOW_EXHAUSTED') return { ...base, state: 'no_slots' };
    throw error;
  }
  const members: Availability[] = [];
  for (let offset = 0; offset < input.group.members.length; offset += 4) {
    const batch = input.group.members.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map(async member => member.userId
      ? services.availability(member.userId, resolved.queryWindow)
      : { memberId: member.id, state: 'unknown' as const, busy: [] }));
    results.forEach((result, index) => members.push(result.status === 'fulfilled'
      ? { ...result.value, memberId: batch[index].id }
      : { memberId: batch[index].id, state: 'unknown', busy: [] }));
  }
  const required = [organizer.id, requester.id];
  if (required.some(id => members.find(member => member.memberId === id)?.state !== 'known')) {
    return { ...base, state: 'retry_required' };
  }
  const slots = rankSlots({ window: resolved.window, durationMs: intent.durationMinutes * 60_000,
    stepMs: 15 * 60_000, bufferMs: 15 * 60_000, preferredStart: resolved.preferredStart,
    requiredIds: required, members });
  return { ...base, slots, state: slots.length ? 'ready' : 'no_slots',
    draft: buildDraft(slots, input.timezone, intent.activity) };
}
