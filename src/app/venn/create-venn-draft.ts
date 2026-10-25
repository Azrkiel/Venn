import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';

export const CREATE_VENN_DRAFT_KEY = 'venn-create-draft-v1';
const draftSchema = z.object({
  activity: z.string().max(100),
  scale: z.enum(['day', 'week', 'fortnight', 'month', 'months', 'year']),
  zone: z.string().max(80).refine(value => IANAZone.isValidZone(value)),
  startDate: z.string().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value, { zone: 'UTC' }).toISODate() === value),
  monthCount: z.number().int().min(2).max(12),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .refine(value => DateTime.fromISO(value, { zone: 'UTC' }).toFormat("yyyy-MM-dd'T'HH:mm") === value),
}).strict();
const storedSchema = draftSchema.extend({ savedAt: z.number().finite() });
export type CreateVennDraft = z.infer<typeof draftSchema>;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveCreateVennDraft(storage: DraftStorage, draft: CreateVennDraft, now = Date.now()) {
  storage.setItem(CREATE_VENN_DRAFT_KEY, JSON.stringify({ ...draftSchema.parse(draft), savedAt: now }));
}

export function clearCreateVennDraft(storage: DraftStorage) { storage.removeItem(CREATE_VENN_DRAFT_KEY); }

export function readCreateVennDraft(storage: DraftStorage, now = Date.now()): CreateVennDraft | null {
  const raw = storage.getItem(CREATE_VENN_DRAFT_KEY);
  if (!raw) return null;
  try {
    const { savedAt, ...draft } = storedSchema.parse(JSON.parse(raw));
    if (savedAt > now || now - savedAt >= 86_400_000) { clearCreateVennDraft(storage); return null; }
    return draft;
  } catch { clearCreateVennDraft(storage); return null; }
}
