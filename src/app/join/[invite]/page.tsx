import Link from 'next/link';
import type { Metadata } from 'next';
import { currentUserId, loginConfigured } from '@/auth';
import { getDb } from '@/lib/db';
import { digestSecret } from '@/features/identity/secrets';
import { VennMark } from '@/components/venn-mark';
import { JoinClient } from './join-client';
import styles from '../../live/live.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join a group · Venn', robots: { index: false, follow: false } };

export default async function JoinPage({ params }: { params: Promise<{ invite: string }> }) {
  const { invite } = await params;
  let group: { name: string; count: number } | null = null;
  let userId: string | null = null;
  let unavailable = !loginConfigured();
  if (!unavailable && /^[A-Za-z0-9_-]{32,128}$/.test(invite)) {
    try {
      userId = await currentUserId();
      const saved = await getDb().invite.findUnique({ where: { tokenDigest: digestSecret(invite) },
        include: { group: { select: { name: true, _count: { select: { memberships: true } } } } } });
      if (saved && !saved.revokedAt && saved.expiresAt > new Date()) group = { name: saved.group.name, count: saved.group._count.memberships };
    } catch { unavailable = true; }
  }
  return <main className={styles.shell}>
    <nav className={styles.nav} aria-label="Venn navigation"><Link className={styles.brand} href="/app"><VennMark size={40} /><span>venn</span></Link><Link className={styles.navLink} href="/live">Your planner</Link></nav>
    <p className={styles.eyebrow}>A LITTLE MORE TOGETHER</p>
    <h1 className={styles.title}>{group ? <>You&apos;re invited to<br /><span className={styles.titleAccent}>{group.name}.</span></> : <>Good plans start<br /><span className={styles.titleAccent}>with good company.</span></>}</h1>
    {group ? <section className={styles.card}>
      <h2>Find where your free time overlaps</h2>
      <p className={styles.intro}>{group.count} {group.count === 1 ? 'person has' : 'people have'} joined. You can connect Google Calendar to contribute busy/free time, or leave your calendar unconnected and answer shared options yourself.</p>
      <p className={styles.subtle}>Venn does not read event titles or send messages to your friends. A name alone cannot grant access to anyone&apos;s calendar.</p>
      {userId ? <JoinClient invite={invite} /> : <div className={styles.buttonRow}><Link className={styles.button} href={`/setup?returnTo=${encodeURIComponent(`/join/${invite}`)}`}>Sign in to join</Link></div>}
    </section> : <section className={styles.card}>
      <h2>{unavailable ? 'This invitation needs Venn to be connected' : 'This invite is no longer available'}</h2>
      <p className={styles.intro}>{unavailable
        ? 'The server is not ready to check this invitation yet. Finish connection setup, then reopen the original invite.'
        : 'It may have expired or been revoked. Ask the organizer for a fresh invitation link.'}</p>
      <div className={styles.buttonRow}><Link className={styles.button} href={unavailable ? '/setup' : '/live'}>{unavailable ? 'Open connection setup' : 'Back to your planner'}</Link></div>
    </section>}
    <p className={styles.footer}>Your calendar connection is optional. Unconnected availability stays unknown until you choose to respond.</p>
  </main>;
}
