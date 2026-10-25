'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { Check, CircleHelp, RefreshCw, X } from 'lucide-react';
import type { PublicPoll } from '@/features/polls/service';
import { formatSlot } from '@/features/scheduling/draft';

type Choice = 'works' | 'cant';
const readableError = (value: unknown) => typeof value === 'object' && value !== null && 'error' in value
  && typeof value.error === 'object' && value.error !== null && 'message' in value.error && typeof value.error.message === 'string'
  ? value.error.message : 'Your response could not be saved. Please try again.';

export default function PollVoting({ share, initial }: { share: string; initial: PublicPoll }) {
  const [poll, setPoll] = useState(initial);
  const [guestName, setGuestName] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || saving || expired) return;
      try {
        const response = await fetch(`/api/polls/${encodeURIComponent(share)}`, { cache: 'no-store' });
        const value: unknown = await response.json();
        if (!active) return;
        if (response.status === 410 || response.status === 404) { setExpired(true); setError(readableError(value)); }
        else if (response.ok) setPoll(value as PublicPoll);
      } catch { /* Keep the last observed counts; a vote attempt reports its own network error. */ }
    };
    const timer = setInterval(refresh, 5_000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [share, saving, expired]);

  async function respond(slotId: string, choice: Choice) {
    setSaving(slotId); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/polls/${encodeURIComponent(share)}/votes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, choice, slotVersion: poll.slotVersion, ...(guestName.trim() ? { guestName: guestName.trim() } : {}) }),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 410 || response.status === 404) setExpired(true);
        throw new Error(readableError(value));
      }
      setPoll(value as PublicPoll); setChoices(previous => ({ ...previous, [slotId]: choice }));
      setMessage('Saved. You can change your response whenever you need to.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your response could not be saved. Please try again.'); }
    finally { setSaving(null); }
  }

  return <section aria-labelledby="options-heading">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
      <h2 id="options-heading">Which times work for you?</h2>
      <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>{poll.answeredMembers} of {poll.expectedMembers} members answered</span>
    </div>
    <p style={{ lineHeight: 1.7, color: 'var(--muted)', marginBottom: 20 }}>All times are in {poll.timezone.replaceAll('_', ' ')}. A calendar check and a person&apos;s response are shown separately.</p>
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, maxWidth: 350 }}>
      <span style={{ fontSize: '1rem', fontWeight: 600 }}>Guest name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></span>
      <input value={guestName} onChange={event => setGuestName(event.target.value)} maxLength={40}
        autoComplete="given-name" placeholder="What should we call you?" disabled={expired}
        style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', padding: '10px 12px' }} />
    </label>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {poll.options.map(option => <article key={option.id} style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 16, padding: 22 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ color: 'var(--purple-ink)', fontSize: '1rem', fontWeight: 600 }}>OPTION {option.ordinal}</span>
          <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: '1.75rem' }}>{formatSlot(Date.parse(option.start), Date.parse(option.end), poll.timezone)}</h3>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.8 }}>
          {option.freeCount} of {option.totalCount} calendars show free{option.unknownCount > 0 ? ` · ${option.unknownCount} unknown` : ''}<br />
          Members: {option.memberWorks ?? 0} works · {option.memberCant ?? 0} can&apos;t<br />
          Guests (self-reported): {option.guestWorks ?? 0} works · {option.guestCant ?? 0} can&apos;t
        </p>
        <div role="group" aria-label={`Your response to option ${option.ordinal}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          {([{ value: 'works', label: 'works', Icon: Check }, { value: 'cant', label: "can't", Icon: X }] as const).map(({ value, label, Icon }) =>
            <button key={value} type="button" aria-pressed={choices[option.id] === value}
              disabled={saving !== null || expired} onClick={() => respond(option.id, value)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 20px', minHeight: 44,
                border: '1px solid', borderColor: choices[option.id] === value ? 'var(--purple-ink)' : 'var(--line)', borderRadius: 24,
                background: choices[option.id] === value ? 'var(--soft-purple)' : 'transparent', color: 'var(--ink)' }}>
              {saving === option.id ? <RefreshCw size={14} aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}{label}
            </button>)}
        </div>
      </article>)}
    </div>
    {poll.options.length === 0 && <p>No options are available. Ask the organizer to find another window.</p>}
    <p role="status" aria-live="polite" style={{ minHeight: 22, marginTop: 18, color: 'var(--purple-ink)', lineHeight: 1.7 }}>{message}</p>
    {error && <p role="alert" style={{ color: '#923c3c', marginBottom: 16, lineHeight: 1.7 }}>{error}</p>}
    <p style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.8, marginTop: 16 }}>
      <CircleHelp size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
      <span>Guests can respond without connecting a calendar. Guest names do not identify a group member. Sign in with your invited Google account to have a response count as an expected member. No event is booked by responding.</span>
    </p>
    <p style={{ marginTop: 18, fontSize: '1rem' }}><a href="/setup" style={{ textDecoration: 'underline', color: 'var(--purple-ink)' }}>Sign in to Venn</a>
      <span style={{ color: 'var(--muted)' }}> · {poll.guestRespondents} guest {poll.guestRespondents === 1 ? 'browser has' : 'browsers have'} responded</span></p>
    {poll.complete && <p style={{ marginTop: 18, background: 'var(--soft-purple)', borderRadius: 10, padding: 15, lineHeight: 1.7 }}>
      Everyone in the expected group has answered. {poll.winningSlotId ? 'The organizer can review the leading option and choose what to do next.' : 'No option works for both required people. The organizer can try another window.'}
    </p>}
    {poll.options.length > 0 && poll.options.every(option => choices[option.id]) && <aside style={{ marginTop: 24, padding: 24, borderRadius: 16, background: 'var(--soft-purple)' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: '1.75rem', fontWeight: 400 }}>Love using Venn?</h3>
      <p style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.7 }}>Bring your people together for the next one.</p>
      <Link href="/signup" className="primary-button" style={{ marginTop: 16 }}>Make your own Venn</Link>
    </aside>}
    <p style={{ marginTop: 22, fontSize: '1rem', color: 'var(--muted)' }}>Plan date: {DateTime.fromISO(poll.localDate).setLocale('en-US').toFormat('EEEE, MMMM d')}</p>
  </section>;
}
