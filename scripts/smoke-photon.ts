import './env';
import { getDb } from '../src/lib/db';
import { sendPairedText } from '../src/features/messaging/delivery';

try {
  const links = process.env.SMOKE_USER_ID
    ? await getDb().phoneLink.findMany({ where: { userId: process.env.SMOKE_USER_ID }, select: { userId: true } })
    : await getDb().phoneLink.findMany({ select: { userId: true }, take: 2 });
  if (links.length !== 1) throw new Error('choose one paired organizer with SMOKE_USER_ID');
  await sendPairedText(links[0].userId, 'Venn smoke check: your paired phone path works. Nothing was sent to anyone else.');
  console.log('PASS: Photon accepted one deliberate DM to the paired organizer. Confirm it arrived on the phone. No phone numbers or thread IDs printed.');
} catch {
  console.error('SETUP REQUIRED: configure Photon, pair your phone with "pair <code>", and select one paired organizer with SMOKE_USER_ID. No live phone check passed.');
  process.exitCode = 1;
} finally {
  if (process.env.DATABASE_URL) await getDb().$disconnect().catch(() => undefined);
}
