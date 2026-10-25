import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { currentUserId } from '@/auth';
import { VennMark } from '@/components/venn-mark';
import { loadSharedPoll } from '@/features/polls/shared';
import { HttpError } from '@/lib/http';
import PollVoting from './poll-voting';
import AvailabilityVoting from './availability-voting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Find a time together · Venn', description: 'Share when you are free and find your group’s overlap.',
  robots: { index: false, follow: false }, referrer: 'same-origin',
};

export default async function SharedPollPage({ params }: { params: Promise<{ share: string }> }) {
  const { share } = await params;
  let shared;
  let signedIn = false;
  let error = '';
  try {
    const guestKey = (await cookies()).get('venn-availability-guest')?.value;
    const userId = await currentUserId() ?? undefined;
    signedIn = Boolean(userId);
    shared = await loadSharedPoll(share, { guestKey, userId });
  }
  catch (cause) {
    error = cause instanceof HttpError ? cause.message : 'Venn could not load this plan. Please try again in a moment.';
  }
  const availability = shared?.kind === 'availability' ? shared.poll : null;
  const weekly = availability !== null && ['week', 'fortnight'].includes(availability.scale);
  return <main style={{ width: `min(${weekly ? '1100px' : '680px'}, calc(100% - 40px))`, margin: '0 auto', padding: '36px 0 60px' }}>
    <Link href="/" className="brand" aria-label="Venn home"><VennMark /><span>venn</span></Link>
    <p className="eyebrow" style={{ marginTop: weekly ? 26 : 40 }}>LET&apos;S FIND A TIME, TOGETHER</p>
    <h1 style={{ marginBottom: 16, fontSize: 'clamp(33px, 7vw, 48px)', overflowWrap: 'anywhere' }}>{availability
      ? <>{availability.activity}{!/[.!?…]$/.test(availability.activity) && <span>.</span>}</> : <>A little time.<br /><span>A good overlap.</span></>}</h1>
    {shared ? shared.kind === 'availability'
      ? <AvailabilityVoting key={share} share={share} initial={shared.poll} signedIn={signedIn} />
      : <PollVoting key={share} share={share} initial={shared.poll} />
      : <section role="alert" style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 24, background: 'var(--surface)' }}>
      <h2 style={{ marginBottom: 12 }}>This plan isn&apos;t available</h2><p style={{ lineHeight: 1.8, color: 'var(--muted)' }}>{error}</p>
      <Link href="/app" style={{ display: 'inline-block', marginTop: 20, color: 'var(--purple-ink)', textDecoration: 'underline' }}>Back to Venn</Link>
    </section>}
    <details className="page-disclosure">
      <summary>Who sees what</summary>
      <p>{shared?.kind === 'availability'
        ? 'Anyone with this link can join and see overlap counts. After answering, you can choose to see who else answered. Your calendar, event details and contact information stay private.'
        : 'This link shares options and response counts. Your calendar timeline, event details and contact information stay off this page.'}</p>
    </details>
  </main>;
}
