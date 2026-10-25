'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, RefreshCw } from 'lucide-react';
import type { CalendarReference } from '@/features/availability/calendar-reference';
import type { SelectionRange } from './selection';
import styles from './availability.module.css';

type Props = {
  share: string; window: SelectionRange | null; signedIn: boolean;
  onChange: (busy: SelectionRange[], known: boolean) => void;
};

export default function CalendarReferencePanel({ share, window, signedIn, onChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<CalendarReference | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const setup = `/setup?${new URLSearchParams({ returnTo: `/r/${share}` })}`;
  const signup = `/signup?${new URLSearchParams({ returnTo: setup })}`;
  const start = window?.start, end = window?.end;

  useEffect(() => {
    onChange([], false);
    if (!signedIn || !enabled || !start || !end) return;
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/venns/${encodeURIComponent(share)}/calendar?${new URLSearchParams({ start, end })}`, {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Calendar unavailable');
        const value = await response.json() as CalendarReference;
        if (!active) return;
        setResult(value);
        onChange(value.state === 'known' ? value.busy : [], value.state === 'known');
      } catch {
        if (active) { setFailed(true); onChange([], false); }
      } finally { if (active) setLoading(false); }
    };
    const frame = requestAnimationFrame(() => {
      if (!active) return;
      setLoading(true); setFailed(false); setResult(null);
      void load();
    });
    return () => { active = false; cancelAnimationFrame(frame); controller.abort(); };
  }, [share, signedIn, enabled, start, end, refresh, onChange]);

  const unknown = failed || result?.state === 'unknown';
  return <section className={styles.calendarReference} aria-label="Your private calendar reference">
    <div className={styles.referenceBar}><div className={styles.referenceHeading}><CalendarDays size={16} aria-hidden="true" /><strong>Your calendar</strong><span>Only you</span></div>
      {!signedIn ? <Link href={signup} aria-label="Sign up to sync your calendar" className={styles.referenceLink}>Sync calendar</Link> : <div className={styles.referenceActions}>
        <button type="button" className={styles.referenceToggle} aria-label={enabled ? 'Hide my calendar' : 'Show my calendar'} aria-pressed={enabled}
          onClick={() => { setEnabled(previous => !previous); onChange([], false); }}>{enabled ? 'Hide' : 'Show'}</button>
        {enabled && <button type="button" className={styles.refreshButton} aria-label="Refresh calendar" title="Refresh calendar" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} aria-hidden="true" /></button>}
      </div>}</div>
    {signedIn && <>
      {enabled && <div role="status" aria-live="polite" className={styles.referenceStatus}>
        {loading ? 'Checking…' : unknown ? 'Couldn’t check your calendar. Busy times unknown.'
          : result?.state === 'known' ? result.busy.length ? 'Busy times shown in grey.' : 'No busy times in this view.'
            : result?.state === 'no_calendars' ? 'Choose calendars to continue.'
              : result?.state === 'reconnect' ? 'Reconnect to check busy times.'
                : result?.state === 'disconnected' ? 'Connect Google Calendar to continue.' : 'Choose a date to check.'}
      </div>}
      {enabled && result && ['disconnected', 'reconnect', 'no_calendars'].includes(result.state) && <Link href={setup} className={styles.referenceLink}>
        {result.state === 'no_calendars' ? 'Choose calendars' : result.state === 'reconnect' ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
      </Link>}
      {enabled && unknown && <Link href={setup} className={styles.referenceLink}>Check your calendar connection</Link>}
    </>}
  </section>;
}
