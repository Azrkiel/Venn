type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type SavedAnswer = { name: string; selected: Iterable<string> } | null;
type DraftInput = { name: string; selected: Iterable<string>; base: string };
export type AvailabilityDraft = { version: 1; name: string; selected: string[]; base: string; updatedAt: number };
const TTL_MS = 24 * 60 * 60_000;
const MAX_BYTES = 160_000;

export async function availabilityDraftKey(share: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(share));
  return `venn-availability-draft:v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Compare to the answer observed before editing; never overwrite a subsequently changed server answer. */
export function draftBaseFingerprint(answer: SavedAnswer): string {
  return answer ? JSON.stringify([answer.name, [...answer.selected].sort()]) : 'null';
}

export function writeAvailabilityDraft(storage: DraftStorage, key: string, input: DraftInput, now = Date.now()): boolean {
  try {
    const selected = [...input.selected];
    if (input.name.length > 40 || /\p{C}/u.test(input.name) || selected.length > 1600) return false;
    const value: AvailabilityDraft = { version: 1, name: input.name, selected, base: input.base, updatedAt: now };
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_BYTES) return false;
    storage.setItem(key, serialized);
    return true;
  } catch { return false; }
}

export function clearAvailabilityDraft(storage: DraftStorage, key: string): void {
  try { storage.removeItem(key); } catch { /* Storage is an optional convenience. */ }
}

export function readAvailabilityDraft(storage: DraftStorage, key: string, allowedCells: { start: string }[], currentBase: string, now = Date.now()): AvailabilityDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > MAX_BYTES) { clearAvailabilityDraft(storage, key); return null; }
    const value: unknown = JSON.parse(raw);
    const discard = () => { clearAvailabilityDraft(storage, key); return null; };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return discard();
    const entry = value as Partial<AvailabilityDraft>;
    const allowed = new Set(allowedCells.map(cell => cell.start));
    if (Object.keys(value).some(field => !['version', 'name', 'selected', 'base', 'updatedAt'].includes(field))
      || entry.version !== 1 || typeof entry.name !== 'string' || entry.name.length > 40 || /\p{C}/u.test(entry.name)
      || !Array.isArray(entry.selected) || entry.selected.length > 1600 || entry.selected.some(start => typeof start !== 'string' || !allowed.has(start))
      || typeof entry.base !== 'string' || entry.base !== currentBase || typeof entry.updatedAt !== 'number' || !Number.isSafeInteger(entry.updatedAt)
      || now - entry.updatedAt > TTL_MS || entry.updatedAt > now + 5 * 60_000) return discard();
    if (draftBaseFingerprint({ name: entry.name.trim(), selected: entry.selected }) === currentBase) return discard();
    return entry as AvailabilityDraft;
  } catch { return null; }
}
