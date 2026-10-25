import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), view: vi.fn(), status: vi.fn(), availability: vi.fn(), insert: vi.fn(), lookup: vi.fn(),
  actionFind: vi.fn(), actionCreate: vi.fn(), actionUpdate: vi.fn(), actionUpdateMany: vi.fn(),
  requestUpdateMany: vi.fn(), requestUpdate: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@/features/requests/service', () => ({ loadOwnerRequest: mocks.load, getOwnerRequest: mocks.view }));
vi.mock('@/features/calendar/client', () => ({ getCalendarStatus: mocks.status, getUserAvailability: mocks.availability,
  addOwnerEvent: mocks.insert, lookupOwnerEvent: mocks.lookup }));
vi.mock('@/lib/db', () => ({ getDb: () => ({
  eventAction: { findUnique: mocks.actionFind, create: mocks.actionCreate, update: mocks.actionUpdate, updateMany: mocks.actionUpdateMany },
  schedulingRequest: { updateMany: mocks.requestUpdateMany, update: mocks.requestUpdate },
  $transaction: mocks.transaction,
}), isPrismaError: (error: unknown, code: string) => typeof error === 'object' && error !== null && 'code' in error && error.code === code }));
import { addSelectedEvent } from '@/features/requests/add';
import { CalendarError } from '@/features/calendar/errors';
import { getDb } from '@/lib/db';

const start = new Date(Date.now() + 86_400_000);
const saved = { id: 'r', ownerId: 'owner', state: 'selected', selectedSlotId: 's', slotVersion: 1, eventAction: null,
  activity: 'lunch', timezone: 'America/New_York', requesterMemberId: 'sam-member',
  participants: [{ participantId: 'sam-member', userId: 'sam' }],
  slots: [{ id: 's', start, end: new Date(start.getTime() + 3_600_000) }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue(saved); mocks.view.mockResolvedValue({ id: 'r', state: 'added' });
  mocks.status.mockResolvedValue({ canWrite: true, calendars: [{ id: 'primary', enabled: true, writable: true }] });
  mocks.actionFind.mockResolvedValue(null);
  mocks.actionCreate.mockImplementation(async ({ data }) => data);
  mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
  mocks.actionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async work => typeof work === 'function' ? work(getDb()) : Promise.all(work));
  mocks.availability.mockImplementation(async memberId => ({ memberId, state: 'known', busy: [] }));
  mocks.insert.mockResolvedValue({ id: 'event', calendarId: 'primary' });
});

describe('booking state guards', () => {
  it('does not book if cancellation wins before the booking claim', async () => {
    mocks.requestUpdateMany.mockResolvedValue({ count: 0 });
    await expect(addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 })).rejects.toMatchObject({ code: 'STALE_OPTION' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('does not mark an added action failed if fetching the final view fails', async () => {
    mocks.view.mockRejectedValue(new Error('view unavailable'));
    await expect(addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 })).rejects.toThrow();
    const destructive = mocks.actionUpdate.mock.calls.some(([input]) => input.data?.state === 'failed' || input.data?.state === 'uncertain');
    expect(destructive).toBe(false);
  });
  it('marks a definitive calendar refusal failed so the owner can choose again', async () => {
    mocks.insert.mockRejectedValue(new CalendarError('CALENDAR_WRITE_CONSENT_REQUIRED', 403));
    await expect(addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 })).rejects.toMatchObject({ code: 'CALENDAR_WRITE_CONSENT_REQUIRED' });
    expect(mocks.actionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'failed' } }));
  });
  it('keeps an ambiguous write uncertain', async () => {
    mocks.insert.mockRejectedValue(new CalendarError('CALENDAR_WRITE_UNCERTAIN'));
    await expect(addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 })).rejects.toMatchObject({ code: 'CALENDAR_WRITE_UNCERTAIN' });
    expect(mocks.actionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'uncertain' } }));
  });
  it('keeps a prior uncertain action uncertain when reconciliation cannot run', async () => {
    mocks.load.mockResolvedValue({ ...saved, eventAction: { state: 'uncertain', slotId: 's' } });
    mocks.actionFind.mockResolvedValue({ state: 'uncertain', slotId: 's', createdAt: new Date(0) });
    mocks.actionUpdate.mockImplementation(async ({ data }) => ({ calendarId: 'primary', ...data }));
    mocks.lookup.mockRejectedValue(new CalendarError('CALENDAR_RECONNECT_REQUIRED', 401));
    await expect(addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 })).rejects.toMatchObject({ code: 'CALENDAR_RECONNECT_REQUIRED' });
    expect(mocks.actionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'uncertain' } }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('reports a concurrent claim as in progress instead of a server error', async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error('serialization'), { code: 'P2034' }));
    await expect(addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 })).rejects.toMatchObject({ code: 'ADD_IN_PROGRESS' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('solo requests (no requester) re-check only the owner and still book', async () => {
    mocks.load.mockResolvedValue({ ...saved, requesterMemberId: null, participants: [{ participantId: 'self', userId: 'owner' }] });
    await addSelectedEvent('owner', 'r', { slotId: 's', slotVersion: 1 });
    expect(mocks.availability.mock.calls.map(call => call[0])).toEqual(['owner']);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
