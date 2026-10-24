import type { Candidate, RankInput } from './types';
export type { Availability, Busy, Candidate, RankInput } from './types';

export function rankSlots(input: RankInput): Candidate[] {
  const { window, durationMs, stepMs, bufferMs, preferredStart, members } = input;
  if (![window.start, window.end, durationMs, stepMs, bufferMs, preferredStart].every(Number.isFinite)
    || window.start >= window.end || durationMs <= 0 || stepMs <= 0 || bufferMs < 0
    || window.end - window.start > 48 * 60 * 60 * 1000
    || (window.end - window.start) / stepMs > 1_000 || members.length > 10) {
    throw new RangeError('Invalid scheduling range');
  }
  const ids = new Set(members.map(member => member.memberId));
  if (ids.size !== members.length || input.requiredIds.length === 0
    || input.requiredIds.some(id => !ids.has(id))) {
    throw new RangeError('Invalid required participants');
  }
  for (const member of members) {
    for (const busy of member.busy) {
      if (!Number.isFinite(busy.start) || !Number.isFinite(busy.end) || busy.start >= busy.end) {
        throw new RangeError('Invalid busy interval');
      }
    }
  }
  const candidates: Candidate[] = [];
  for (let start = window.start; start + durationMs <= window.end; start += stepMs) {
    const end = start + durationMs;
    const slot: Candidate = { start, end, freeIds: [], busyIds: [], unknownIds: [] };
    for (const member of members) {
      if (member.state === 'unknown') slot.unknownIds.push(member.memberId);
      else if (member.busy.some(busy => start < busy.end + bufferMs && end > busy.start - bufferMs)) {
        slot.busyIds.push(member.memberId);
      } else slot.freeIds.push(member.memberId);
    }
    if (input.requiredIds.every(id => slot.freeIds.includes(id))) candidates.push(slot);
  }
  candidates.sort((a, b) => b.freeIds.length - a.freeIds.length
    || Math.abs(a.start - preferredStart) - Math.abs(b.start - preferredStart) || a.start - b.start);
  const result: Candidate[] = [];
  for (const slot of candidates) {
    if (result.every(other => slot.end <= other.start || slot.start >= other.end)) {
      result.push(slot);
      if (result.length === 3) break;
    }
  }
  return result;
}
