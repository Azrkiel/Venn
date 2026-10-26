import Link from 'next/link';
import { currentUserId, loginConfigured } from '@/auth';
import { listGroups } from '@/features/groups/service';
import { getOwnerRequest } from '@/features/requests/service';
import { getDb } from '@/lib/db';
import { VennMark } from '@/components/venn-mark';
import { LiveClient } from './live-client';
import styles from './live.module.css';

export const dynamic = 'force-dynamic';

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const configured = loginConfigured();
  const userId = configured ? await currentUserId() : null;
  const params = await searchParams;
  let groups: Awaited<ReturnType<typeof listGroups>> = [];
  let initialRequest: Awaited<ReturnType<typeof getOwnerRequest>> | null = null;
  let timezone = 'America/New_York';
  let loadError = '';
  if (userId) {
    try {
      groups = await listGroups(userId);
      timezone = (await getDb().user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone ?? timezone;
      if (typeof params.request === 'string' && params.request.length <= 100) initialRequest = await getOwnerRequest(userId, params.request);
    } catch { loadError = 'That saved request or group could not be loaded. You can check again below.'; }
  }
  const modelReady = Boolean(process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_MODEL?.trim());
  return <main className={styles.shell}>
    <nav className={styles.nav} aria-label="Venn navigation">
      <Link className={styles.brand} href="/"><VennMark size={40} /><span>venn</span></Link>
      <Link className={styles.navLink} href="/venn">Make a Venn</Link>
      <Link className={styles.navLink} href="/setup">Your connections</Link>
    </nav>
    <p className={styles.eyebrow}>REAL CALENDARS · A LITTLE MORE TOGETHER</p>
    <h1 className={styles.title}>Let&apos;s find<br /><span className={styles.titleAccent}>a time that fits.</span></h1>
    <p className={styles.intro}>One plan, a few good windows, and a reply you send yourself.</p>
    {!userId ? <section className={styles.card}>
      <h2>{configured ? 'Start with your account' : 'Your live planner needs a connection'}</h2>
      <p className={styles.intro}>{configured
        ? 'Sign in, then choose which calendars Venn can check. Your event titles stay private.'
        : 'The sample planner is ready to explore. To check real calendars, finish setup and connect your calendars.'}</p>
      <div className={styles.buttonRow}><Link className={styles.button} href="/setup?returnTo=%2Flive">{configured ? 'Sign in and connect' : 'Open setup'}</Link>
        <Link className={`${styles.button} ${styles.secondary}`} href="/app">Explore sample calendars</Link></div>
      <p className={styles.subtle}>Live requests check your selected calendars and use Gemini to interpret your plan. This page never substitutes sample availability for your calendar.</p>
    </section> : <LiveClient initialGroups={groups} initialRequest={initialRequest} timezone={timezone}
      modelReady={modelReady} initialError={loadError} calendarResult={typeof params.calendar === 'string' ? params.calendar : ''} />}
    <p className={styles.footer}>Venn checks busy/free time on selected calendars. You choose what to share, send, or save.</p>
  </main>;
}
