import Link from 'next/link';
import { currentUserId } from '@/auth';
import { VennMark } from '@/components/venn-mark';
import { DateTime } from 'luxon';
import CreateVenn from './create-venn';
import styles from './venn.module.css';

export const dynamic = 'force-dynamic';

export default async function VennPage() {
  const userId = await currentUserId();
  const initialZone = 'America/New_York';
  const today = DateTime.now().setZone(initialZone);
  return <main className={styles.shell}>
    <nav className={styles.nav} aria-label="Venn navigation">
      <Link href="/" className="brand"><VennMark /><span>venn</span></Link>
      {!userId && <Link href="/signup" className={styles.textLink}>Sign in</Link>}
    </nav>
    <header className={styles.intro}>
      <h1>Find a time <span>together.</span></h1>
    </header>
    <CreateVenn signedIn={Boolean(userId)} initialZone={initialZone} initialDate={today.toISODate()!}
      initialDeadline={today.plus({ days: 2 }).set({ minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm")} />
    <footer className={styles.footer}><Link href="/live">Calendar planner</Link><Link href="/app">Try a sample</Link></footer>
  </main>;
}
