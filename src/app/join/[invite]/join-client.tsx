'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../../live/live.module.css';

export function JoinClient({ invite }: { invite: string }) {
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState('');
  async function join() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(invite)}`, { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15_000) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setMessage(result?.error?.message ?? 'The invitation could not be accepted. Please try again.'); return; }
      setJoined(true);
    } catch { setMessage('Venn could not confirm the join. Try again; an existing membership will not be duplicated.'); }
    finally { setBusy(false); }
  }
  return <div>
    {message && <p className={`${styles.status} ${styles.error}`} role="alert">{message}</p>}
    {joined ? <>
      <p className={styles.status} role="status">You&apos;re in. Connecting your calendar is your choice.</p>
      <div className={styles.buttonRow}><Link className={styles.button} href="/setup">Choose calendar access</Link>
        <Link className={`${styles.button} ${styles.secondary}`} href="/live">Continue without a calendar</Link></div>
    </> : <div className={styles.buttonRow}><button type="button" className={styles.button} disabled={busy} onClick={() => void join()}>{busy ? 'Joining…' : 'Join this group'}</button></div>}
  </div>;
}
