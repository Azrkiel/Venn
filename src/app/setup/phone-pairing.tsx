'use client';

import { useState } from 'react';

type Pairing = { command: string; expiresAt: string };
const buttonStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '11px 18px', borderRadius: 24, border: '1px solid var(--purple-ink)', color: 'var(--purple-ink)', background: 'transparent', fontWeight: 500 } as const;

async function call<T>(method: 'POST' | 'DELETE'): Promise<T> {
  const response = await fetch('/api/phone-link', { method, credentials: 'same-origin', signal: AbortSignal.timeout(15_000) });
  const result = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !result) throw new Error(result?.error?.message ?? 'That did not go through. Please try again.');
  return result;
}

export function PhonePairing({ initiallyPaired }: { initiallyPaired: boolean }) {
  const [paired, setPaired] = useState(initiallyPaired);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true); setNotice('');
    try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : 'That did not go through. Please try again.'); }
    finally { setBusy(false); }
  }

  return <div>
    {paired && !pairing && <p role="status" className="intro-copy">Your phone is paired. Results arrive only in that private chat.</p>}
    {pairing && <div style={{ padding: '18px 0', borderTop: '1px solid var(--line)' }}>
      <p className="intro-copy">From your iPhone, send this exact text as a direct message to your Venn number. It expires at {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
      <code style={{ display: 'block', margin: '12px 0', padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--line)', wordBreak: 'break-all' }}>{pairing.command}</code>
      <button style={buttonStyle} onClick={() => run(async () => { await navigator.clipboard.writeText(pairing.command); setNotice('Copied. Send it from your own phone.'); })}>Copy pairing text</button>
    </div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
      <button style={buttonStyle} disabled={busy} onClick={() => run(async () => { setPairing(await call<Pairing>('POST')); })}>{paired ? 'Pair a different phone' : 'Get a pairing code'}</button>
      {paired && <button style={{ ...buttonStyle, borderColor: 'var(--line)', color: 'var(--muted)' }} disabled={busy}
        onClick={() => run(async () => { await call('DELETE'); setPaired(false); setPairing(null); setNotice('Phone unlinked.'); })}>Unlink phone</button>}
    </div>
    {notice && <p role="status" className="intro-copy" style={{ marginTop: 12 }}>{notice}</p>}
  </div>;
}
