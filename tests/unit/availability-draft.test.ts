import { describe, expect, it } from 'vitest';
import { availabilityDraftKey, clearAvailabilityDraft, draftBaseFingerprint, readAvailabilityDraft, writeAvailabilityDraft } from '@/app/r/[share]/availability-draft';

const now = 1_800_000_000_000;
const cells = [{ start: '2030-01-15T17:00:00Z', end: '2030-01-15T17:15:00Z' }, { start: '2030-01-15T17:15:00Z', end: '2030-01-15T17:30:00Z' }];
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe('private manual availability drafts', () => {
  it('retains an optional goofy avatar, selfie draft, existing photo reference, and explicit removal', () => {
    const store = storage(), base = draftBaseFingerprint(null);
    const pictures = [{ kind: 'avatar', id: 'tongue' },
      { kind: 'photo', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' },
      { kind: 'photo', key: 'p'.repeat(43) }, null] as const;
    for (const picture of pictures) {
      expect(writeAvailabilityDraft(store, 'key', { name: 'Alex', selected: new Set(), base, picture }, now)).toBe(true);
      expect(readAvailabilityDraft(store, 'key', cells, base, now + 1)?.picture).toEqual(picture);
    }
  });
  it('does not restore a picture draft over a newly changed saved picture', () => {
    const store = storage();
    const first = { name: 'Alex', selected: new Set<string>(), picture: { kind: 'avatar' as const, id: 'tongue' as const } };
    const base = draftBaseFingerprint(first);
    writeAvailabilityDraft(store, 'key', { ...first, base }, now);
    const changed = draftBaseFingerprint({ ...first, picture: { kind: 'avatar', id: 'alien' } });
    expect(changed).not.toBe(base);
    expect(readAvailabilityDraft(store, 'key', cells, changed, now + 1)).toBeNull();
  });
  it('rejects corrupted picture drafts without restoring external image URLs or arbitrary avatar IDs', () => {
    const store = storage(), base = draftBaseFingerprint(null);
    for (const picture of [{ kind: 'avatar', id: 'unknown' }, { kind: 'photo', dataUrl: 'https://tracker.invalid/me.jpg' }]) {
      store.setItem('key', JSON.stringify({ version: 1, name: 'Alex', selected: [], base, updatedAt: now, picture }));
      expect(readAvailabilityDraft(store, 'key', cells, base, now + 1)).toBeNull();
    }
  });
  it('keys each Venn independently without retaining its raw join token', async () => {
    const token = 'private-share-token';
    const key = await availabilityDraftKey(token);
    expect(key).toMatch(/^venn-availability-draft:v1:[a-f0-9]{64}$/);
    expect(key).not.toContain(token);
    expect(await availabilityDraftKey('another-share-token')).not.toBe(key);
  });
  it('restores only manual name and selections newer than the observed saved-answer base', () => {
    const store = storage();
    const base = draftBaseFingerprint({ name: 'Alex', selected: new Set([cells[0].start]) });
    expect(writeAvailabilityDraft(store, 'key', { name: 'Alex edited', selected: new Set(cells.map(cell => cell.start)), base }, now)).toBe(true);
    expect(readAvailabilityDraft(store, 'key', cells, base, now + 1)).toMatchObject({ name: 'Alex edited', selected: cells.map(cell => cell.start), updatedAt: now });
    const serialized = store.getItem('key')!;
    expect(Object.keys(JSON.parse(serialized)).sort()).toEqual(['base', 'name', 'selected', 'updatedAt', 'version']);
    expect(serialized).not.toMatch(/busy|token|calendar|account/i);
  });
  it('keeps a changed saved answer instead of an older or uncertain local draft', () => {
    const store = storage();
    const base = draftBaseFingerprint(null);
    writeAvailabilityDraft(store, 'key', { name: 'Draft', selected: new Set([cells[0].start]), base }, now);
    const changed = draftBaseFingerprint({ name: 'New saved answer', selected: new Set([cells[1].start]) });
    expect(readAvailabilityDraft(store, 'key', cells, changed, now + 1)).toBeNull();
    expect(store.getItem('key')).toBeNull();
  });
  it('rejects expired, future-dated, out-of-window and malformed-name drafts', () => {
    const store = storage(), base = draftBaseFingerprint(null);
    const write = () => writeAvailabilityDraft(store, 'key', { name: 'Name', selected: new Set([cells[0].start]), base }, now);
    write(); expect(readAvailabilityDraft(store, 'key', cells, base, now + 86_400_001)).toBeNull();
    write(); expect(readAvailabilityDraft(store, 'key', cells, base, now - 600_001)).toBeNull();
    write(); expect(readAvailabilityDraft(store, 'key', [cells[1]], base, now + 1)).toBeNull();
    write(); store.setItem('key', store.getItem('key')!.replace('Name', 'N'.repeat(41)));
    expect(readAvailabilityDraft(store, 'key', cells, base, now + 1)).toBeNull();
  });
  it('preserves an explicit empty selection, clears after save, and tolerates blocked storage', () => {
    const store = storage(), base = draftBaseFingerprint(null);
    writeAvailabilityDraft(store, 'key', { name: '', selected: new Set(), base }, now);
    expect(readAvailabilityDraft(store, 'key', cells, base, now + 1)).toMatchObject({ name: '', selected: [] });
    clearAvailabilityDraft(store, 'key'); expect(store.getItem('key')).toBeNull();
    const blocked = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } };
    expect(writeAvailabilityDraft(blocked, 'key', { name: 'A', selected: new Set(), base }, now)).toBe(false);
    expect(readAvailabilityDraft(blocked, 'key', cells, base, now)).toBeNull();
    expect(() => clearAvailabilityDraft(blocked, 'key')).not.toThrow();
  });
});
