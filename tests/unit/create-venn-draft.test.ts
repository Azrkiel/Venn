import { describe, expect, it } from 'vitest';
import { CREATE_VENN_DRAFT_KEY, readCreateVennDraft, saveCreateVennDraft, clearCreateVennDraft } from '@/app/venn/create-venn-draft';

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
}

const draft = { activity: 'Beach weekend', scale: 'months' as const, zone: 'America/New_York',
  startDate: '2030-05-11', monthCount: 3, deadline: '2030-05-10T17:00' };
const now = Date.parse('2030-05-01T12:00:00Z');

describe('creation draft for signup', () => {
  it('retains the whole plan and clears it only when requested', () => {
    const store = storage();
    saveCreateVennDraft(store, draft, now);
    expect(readCreateVennDraft(store, now + 60_000)).toEqual(draft);
    clearCreateVennDraft(store);
    expect(readCreateVennDraft(store, now + 60_000)).toBeNull();
  });
  it('expires drafts after a day and rejects corrupted or invalid fields', () => {
    const store = storage();
    saveCreateVennDraft(store, draft, now);
    expect(readCreateVennDraft(store, now + 86_400_000)).toBeNull();
    expect(store.getItem(CREATE_VENN_DRAFT_KEY)).toBeNull();
    for (const value of ['{', JSON.stringify({ ...draft, savedAt: now, monthCount: 999 }),
      JSON.stringify({ ...draft, savedAt: now, zone: 'invalid' }), JSON.stringify({ ...draft, savedAt: now, startDate: '2030-02-30' }),
      JSON.stringify({ ...draft, savedAt: now, deadline: '2030-02-30T17:00' }),
      JSON.stringify({ ...draft, savedAt: now, deadline: '2030-05-10T99:99' })]) {
      store.setItem(CREATE_VENN_DRAFT_KEY, value);
      expect(readCreateVennDraft(store, now)).toBeNull();
    }
  });
});
