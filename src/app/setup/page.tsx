import Link from 'next/link';
import { currentUserId, loginConfigured, signIn, signOut } from '@/auth';
import { getCalendarStatus } from '@/features/calendar/client';

export const dynamic = 'force-dynamic';

const messages: Record<string, string> = {
  connected: 'Calendar connected. Choose which calendars Venn should check below.',
  updated: 'Calendar coverage updated. Previous options will need a fresh check.',
  declined: 'Calendar access was declined. You can still explore the labelled sample calendars.',
  revoked: 'Calendar access revoked and removed from Venn.',
  'locally-revoked': 'Venn has removed its local calendar access. Google could not confirm revocation; you can also remove Venn from your Google Account permissions.',
  'write-granted': 'Write permission granted. Return to your chosen request and confirm Add. No event has been created.',
  'write-declined': 'Write permission was not granted. Your editable reply remains available.',
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const configured = loginConfigured();
  const userId = await currentUserId();
  let calendar: Awaited<ReturnType<typeof getCalendarStatus>> | null = null;
  let unavailable = false;
  if (userId) {
    try { calendar = await getCalendarStatus(userId); } catch { unavailable = true; }
  }
  const params = await searchParams;
  const proposedReturn = typeof params.returnTo === 'string' ? params.returnTo : '';
  const returnTo = proposedReturn === '/live' || /^\/join\/[A-Za-z0-9_-]{32,128}$/.test(proposedReturn) ? proposedReturn : '/setup';
  const message = typeof params.calendar === 'string' ? messages[params.calendar] : undefined;
  const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderTop: '1px solid var(--line)' } as const;
  const buttonStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '11px 18px', borderRadius: 24, border: '1px solid var(--purple-ink)', color: 'var(--purple-ink)', background: 'transparent', fontWeight: 500 } as const;
  return <main className="main-wrap" style={{ maxWidth: 820, paddingTop: 40, paddingBottom: 70 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Link href="/app" style={buttonStyle}>← Back to Venn</Link>
      <Link href="/live" style={buttonStyle}>Open live planner →</Link>
    </div>
    <div className="page-intro" style={{ paddingBottom: 25 }}><div>
      <p className="eyebrow">YOUR CALENDARS, YOUR CHOICE</p>
      <h1>A little setup.<br /><span>Then, a little more together.</span></h1>
      <p className="intro-copy">Connect the calendars you want Venn to check. Friends see proposed times, never your event details.</p>
    </div></div>
    {message && <p role="status" className="sample-banner" style={{ marginBottom: 20, lineHeight: 1.6 }}>{message}</p>}
    {!configured && <section className="plan-card" style={{ marginBottom: 20 }}>
      <h2>Live connections need server setup</h2>
      <p className="intro-copy">The app is currently using clearly labelled sample calendars. Real Google sign-in needs the database, Google OAuth client, and authentication secret configured on the server.</p>
      <p className="intro-copy">Calendar access also needs a token encryption key. Add these through your local environment file or hosting settings, never in chat. See the repository&apos;s setup guide for the exact variable names.</p>
      <Link href="/app" style={{ ...buttonStyle, marginTop: 20 }}>Explore sample calendars</Link>
    </section>}
    <section className="plan-card" style={{ marginBottom: 20 }}>
      <p className="section-kicker">01 · YOUR IDENTITY</p><h2 style={{ marginTop: 8 }}>Sign in with Google</h2>
      <p className="intro-copy">Sign-in identifies you in your groups. Calendar permission is a separate choice.</p>
      {userId ? <div style={rowStyle}><span>Signed in</span><form action={async () => { 'use server'; await signOut({ redirectTo: '/setup' }); }}><button style={buttonStyle}>Sign out</button></form></div>
        : <form action={async () => { 'use server'; if (loginConfigured()) await signIn('google', { redirectTo: returnTo }); }} style={{ marginTop: 20 }}>
          <button style={buttonStyle} disabled={!configured}>Continue with Google</button>
        </form>}
    </section>
    <section className="plan-card">
      <p className="section-kicker">02 · FREE &amp; BUSY ONLY</p><h2 style={{ marginTop: 8 }}>Choose your calendar coverage</h2>
      <p className="intro-copy">Venn reads calendar names so you can choose them, and busy/free time ranges for scheduling. It does not request event titles or descriptions. A failed calendar check is shown as unknown.</p>
      {unavailable && <p role="status" className="intro-copy">The connection could not be checked. Try again after server setup is complete.</p>}
      {calendar?.state === 'reconnect' && <p role="status" className="intro-copy">Google needs you to reconnect. Your calendar will stay unknown until you do.</p>}
      {calendar?.calendars.map(item => <div key={item.id} style={rowStyle}>
        <div><strong>{item.name}</strong><p className="intro-copy" style={{ marginTop: 4 }}>{item.enabled ? 'Included in checks' : 'Not included'}{item.writable ? ' · Your calendar' : ''}</p></div>
        <form action="/api/calendar/selection" method="post">
          <input type="hidden" name="calendarId" value={item.id} /><input type="hidden" name="enabled" value={String(!item.enabled)} />
          <button style={buttonStyle}>{item.enabled ? 'Exclude' : 'Include'}</button>
        </form>
      </div>)}
      <div style={{ ...rowStyle, marginTop: 20 }}>
        <form action="/api/calendar/connect" method="post"><button style={buttonStyle} disabled={!userId}>{calendar ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</button></form>
        {calendar && <form action="/api/calendar/revoke" method="post"><button style={{ ...buttonStyle, borderColor: 'var(--line)', color: 'var(--muted)' }}>Revoke calendar access</button></form>}
      </div>
      <p className="intro-copy">Adding an event later requires a separate permission and your explicit confirmation. Venn will only add to your own calendar and will not invite or message your friends.</p>
    </section>
    <p className="intro-copy" style={{ marginTop: 22 }}>Live request interpretation: {process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_MODEL?.trim()
      ? 'Gemini is configured on the server.' : 'Gemini needs GEMINI_API_KEY and GEMINI_MODEL in your server environment.'} Calendar and message content is never shown here.</p>
  </main>;
}
