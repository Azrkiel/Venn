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
}) }));
import { addSelectedEvent } from '@/features/requests/add';
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
});
