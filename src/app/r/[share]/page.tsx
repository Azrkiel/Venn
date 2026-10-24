import type { Metadata } from 'next';
import Link from 'next/link';
import { VennMark } from '@/components/venn-mark';
import { getPublicPoll } from '@/features/polls/service';
import { HttpError } from '@/lib/http';
import PollVoting from './poll-voting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Find a time together · Venn', description: 'Respond to the proposed times. Only options and counts are shared here.',
  robots: { index: false, follow: false }, referrer: 'same-origin',
};

export default async function SharedPollPage({ params }: { params: Promise<{ share: string }> }) {
  const { share } = await params;
  let poll;
  let error = '';
  try { poll = await getPublicPoll(share); }
  catch (cause) {
    error = cause instanceof HttpError ? cause.message : 'Venn could not load this plan. Please try again in a moment.';
  }
  return <main style={{ width: 'min(680px, calc(100% - 40px))', margin: '0 auto', padding: '36px 0 60px' }}>
    <Link href="/" className="brand" aria-label="Venn home"><VennMark /><span>venn</span></Link>
    <p className="eyebrow" style={{ marginTop: 44 }}>LET&apos;S FIND A TIME, TOGETHER</p>
    <h1 style={{ marginBottom: 18, fontSize: 'clamp(35px, 7vw, 48px)' }}>A little time.<br /><span>A good overlap.</span></h1>
    <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 34 }}>A few possibilities from your organizer. Your response helps the group find a time that feels right.</p>
    {poll ? <PollVoting share={share} initial={poll} /> : <section role="alert" style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 24, background: 'var(--surface)' }}>
      <h2 style={{ marginBottom: 12 }}>This plan isn&apos;t available</h2><p style={{ lineHeight: 1.8, color: 'var(--muted)' }}>{error}</p>
      <Link href="/app" style={{ display: 'inline-block', marginTop: 20, color: 'var(--purple-ink)', textDecoration: 'underline' }}>Back to Venn</Link>
    </section>}
    <p style={{ borderTop: '1px solid var(--line)', marginTop: 35, paddingTop: 22, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
      This link shares options and response counts. Your private calendar timeline, event details and contact information stay off this page. Anyone with the link can see these options.
    </p>
  </main>;
}
