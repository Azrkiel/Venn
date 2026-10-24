import './env';
import { DateTime } from 'luxon';
import { getDb } from '../src/lib/db';
import { getUserAvailability, getCalendarStatus } from '../src/features/calendar/client';

try {
  const users = process.env.SMOKE_USER_ID
    ? await getDb().user.findMany({ where: { id: process.env.SMOKE_USER_ID }, select: { id: true, timezone: true } })
    : await getDb().user.findMany({ select: { id: true, timezone: true }, take: 2 });
  if (users.length !== 1) throw new Error('choose one consenting local user with SMOKE_USER_ID');
  const user = users[0];
  const day = DateTime.now().setZone(user.timezone);
  const status = await getCalendarStatus(user.id);
  const result = await getUserAvailability(user.id, { start: day.startOf('day').toMillis(), end: day.plus({ days: 1 }).startOf('day').toMillis() });
  if (result.state !== 'known') throw new Error('availability remains unknown');
  console.log(`PASS: ${status.calendars.filter(calendar => calendar.enabled).length} selected calendars checked; availability known. No titles, calendar IDs or tokens printed.`);
} catch {
  console.error('SETUP REQUIRED: sign in, connect Calendar, include your calendars and select one consenting local user. No live Calendar check passed.');
  process.exitCode = 1;
} finally {
  if (process.env.DATABASE_URL) await getDb().$disconnect().catch(() => undefined);
}
