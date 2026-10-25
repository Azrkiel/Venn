'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DateTime, IANAZone } from 'luxon';
import { ArrowUpRight, Check, Copy, Link2 } from 'lucide-react';
import type { AvailabilityPollView } from '@/features/availability/service';
import { parseWallTime, spanEndDate, type PlanningScale } from '@/app/r/[share]/selection';
import styles from './venn.module.css';

const scales: { value: PlanningScale; label: string; note: string }[] = [
  { value: 'day', label: 'One day', note: 'Pick times' },
  { value: 'week', label: 'One week', note: 'Dates + times' },
  { value: 'fortnight', label: 'Two weeks', note: 'Dates + times' },
  { value: 'month', label: 'One month', note: 'Whole dates' },
  { value: 'months', label: 'A few months', note: 'Whole dates' },
  { value: 'year', label: 'One year', note: 'Whole dates' },
];

function errorMessage(value: unknown) {
  if (typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'object'
    && value.error !== null && 'message' in value.error && typeof value.error.message === 'string') return value.error.message;
  return 'Could not save. Try again.';
}

export default function CreateVenn({ initialZone, initialDate, initialDeadline }: { initialZone: string; initialDate: string; initialDeadline: string }) {
  const [zone, setZone] = useState(initialZone);
  const [activity, setActivity] = useState('');
  const [scale, setScale] = useState<PlanningScale>('week');
  const [startDate, setStartDate] = useState(initialDate);
  const [monthCount, setMonthCount] = useState(2);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [today, setToday] = useState(initialDate);
  const [result, setResult] = useState<{ path: string; poll: AvailabilityPollView } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const endDate = spanEndDate(startDate, scale, monthCount);
  const wholeDates = ['month', 'months', 'year'].includes(scale);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || initialZone;
      const localNow = DateTime.now().setZone(localZone);
      setZone(localZone); setStartDate(localNow.toISODate()!); setToday(localNow.toISODate()!);
      setDeadline(localNow.plus({ days: 2 }).set({ minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm"));
    });
    return () => cancelAnimationFrame(frame);
  }, [initialZone]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    if (!IANAZone.isValidZone(zone)) { setError('Choose a valid timezone, such as America/New_York.'); return; }
    const [deadlineDate, deadlineTime] = deadline.split('T');
    const closesAt = parseWallTime(deadlineDate, deadlineTime, zone);
    const end = DateTime.fromISO(endDate, { zone }).plus({ days: 1 }).startOf('day');
    if (!closesAt) { setError('That time is skipped or repeated by a clock change. Choose another.'); return; }
    if (closesAt <= DateTime.utc() || closesAt > end) {
      setError('Choose a future deadline before the planning dates end.'); return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/venns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity: activity.trim(), timezone: zone, scale, startDate, endDate, closesAt: closesAt.toUTC().toISO() }) });
      const value = await response.json();
      if (!response.ok) throw new Error(errorMessage(value));
      setResult(value); setNotice('Ready to share.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create your Venn. Try again.'); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(`${activity.trim()} — when works for you? ${new URL(result.path, window.location.origin)}`);
      setNotice('Copied. Paste it into your group chat.'); setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); setNotice('Select the link above to copy it.'); }
  }

  async function close() {
    if (!result) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/venns/${encodeURIComponent(result.path.split('/').at(-1)!)}/close`, { method: 'POST' });
      const value = await response.json();
      if (!response.ok) throw new Error(errorMessage(value));
      setResult({ ...result, poll: value }); setNotice('Voting closed. Results stay available.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voting could not be closed.'); }
    finally { setBusy(false); }
  }

  return <section className={styles.card} aria-labelledby="create-heading">
    <div className={styles.cardHeading}><span className={`${styles.step} ${result ? styles.successStep : ''}`}>{result ? <Check size={18} aria-hidden="true" /> : '01'}</span>
      <div><p className="section-kicker">{result ? 'READY TO SHARE' : 'THE BASICS'}</p><h2 id="create-heading">{result ? activity : 'Make your Venn'}</h2></div></div>
    {result ? <div className={styles.result}>
      <div className={styles.linkIcon}><Link2 size={24} /></div>
      <p className={styles.copy}>Share this link with your group.</p>
      <label className={styles.field}><span>Your Venn link</span><input readOnly value={typeof window === 'undefined' ? result.path : new URL(result.path, window.location.origin).href} onFocus={event => event.target.select()} /></label>
      <div className={styles.actions}><button className={`${styles.primary} ${copied ? styles.copied : ''}`} type="button" onClick={copy} aria-label="Copy for the group">{copied ? <><Check size={16} key="copied" />Copied</> : <><Copy size={16} />Copy for the group</>}</button>
        <Link className={styles.secondary} href={result.path}>Open your Venn <ArrowUpRight size={16} /></Link></div>
      <p className={styles.hint}>Voting closes {DateTime.fromISO(result.poll.closesAt).setZone(result.poll.timezone).toFormat('MMM d, h:mm a')} ({result.poll.timezone.replaceAll('_', ' ')}).</p>
      <div className={styles.management}><span>{result.poll.closed ? 'Voting closed' : 'Enough answers?'}</span>
        {!result.poll.closed && <button type="button" className={styles.textButton} onClick={close} disabled={busy}>Close voting early</button>}</div>
      <button type="button" className={styles.textButton} onClick={() => { setResult(null); setNotice(''); setCopied(false); }}>Make another Venn</button>
    </div> : <form onSubmit={create} className={styles.form}>
      <label className={styles.field}><span>Activity</span><input required maxLength={100} value={activity} onChange={event => setActivity(event.target.value)} placeholder="Lunch, a trip, a day out…" /></label>
      <fieldset className={styles.fieldset}><legend>Planning span</legend><div className={styles.scales}>
        {scales.map(option => <label key={option.value} className={`${styles.scale} ${scale === option.value ? styles.selectedScale : ''}`}>
          <input type="radio" name="scale" value={option.value} checked={scale === option.value} onChange={() => {
            setScale(option.value);
            const windowEnd = DateTime.fromISO(spanEndDate(startDate, option.value, monthCount), { zone }).plus({ days: 1 }).startOf('day');
            if (DateTime.fromISO(deadline, { zone }) > windowEnd) setDeadline(windowEnd.minus({ minutes: 15 }).toFormat("yyyy-MM-dd'T'HH:mm"));
          }} /><strong>{option.label}</strong><span>{option.note}</span><span className={styles.scaleCheck} aria-hidden="true"><Check size={11} strokeWidth={3} /></span></label>)}
      </div></fieldset>
      <div className={styles.row}><label className={styles.field}><span>First date</span><input type="date" required value={startDate} min={today} onChange={event => setStartDate(event.target.value)} /></label>
        {scale === 'months' ? <label className={styles.field}><span>Number of months</span><select aria-label="Number of months" value={monthCount} onChange={event => setMonthCount(Number(event.target.value))}>{Array.from({ length: 11 }, (_, i) => i + 2).map(count => <option key={count} value={count}>{count} months</option>)}</select></label>
          : <div className={styles.dateSummary}><span>Through</span><strong>{DateTime.fromISO(endDate).toFormat('MMM d, yyyy')}</strong></div>}</div>
      <p className={styles.hint}>{wholeDates ? 'Friends pick dates. Exact times come later.' : 'Friends pick dates and times in 15-minute steps.'}</p>
      <div className={styles.row}><label className={styles.field}><span>Poll timezone</span><input required value={zone} onChange={event => setZone(event.target.value)} autoComplete="off" list="venn-timezones" /></label>
        <label className={styles.field}><span>Voting closes</span><input type="datetime-local" required value={deadline} onChange={event => setDeadline(event.target.value)} /></label></div>
      <datalist id="venn-timezones">{['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Zurich', 'Asia/Tokyo', 'Australia/Sydney'].map(value => <option key={value} value={value} />)}</datalist>
      <button className={styles.primary} disabled={busy} type="submit">{busy ? 'Making your Venn…' : 'Create Venn'}<ArrowUpRight size={17} /></button>
    </form>}
    <p role="status" aria-live="polite" className={styles.notice}>{notice}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
