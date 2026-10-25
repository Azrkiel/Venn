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
      <Link href="/live" className={styles.textLink}>Your calendar planner</Link>
    </nav>
    <header className={styles.intro}>
      <p className="eyebrow">PLAN SOMETHING GOOD</p>
      <h1>A plan <span>that fits.</span></h1>
      <p>Choose the dates. Share one link.</p>
    </header>
    {userId ? <CreateVenn initialZone={initialZone} initialDate={today.toISODate()!}
      initialDeadline={today.plus({ days: 2 }).set({ minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm")} /> : <section className={styles.card}>
      <h2>Make your Venn.</h2>
      <p className={styles.copy}>Sign up to create a plan. Friends can answer without an account.</p>
      <Link href="/signup" className={styles.primary}>Sign up to create a Venn</Link>
    </section>}
  </main>;
}
