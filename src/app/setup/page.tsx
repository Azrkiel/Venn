import Link from 'next/link';
import { identityProviders } from '@/features/identity/providers';
import { providerNames } from '@/features/calendar/provider-store';
import { outlookOAuthConfig } from '@/features/calendar/outlook';
import { calendarOAuthConfig } from '@/features/calendar/oauth';
import styles from './providers.module.css';
import { currentUserId, loginConfigured, signIn, signOut } from '@/auth';
import { getCalendarStatus } from '@/features/calendar/client';
import { phoneLinkState } from '@/features/identity/phone-link';
import { photonConfigured } from '@/features/messaging/transport';
import { PhonePairing } from './phone-pairing';
import { safeSharedReturnPath, setupReturnPath } from '@/features/identity/return-path';

export const dynamic = 'force-dynamic';

const messages: Record<string, string> = {
  disconnected: 'Calendar disconnected from Venn. You can also revoke its access in your provider account.',
  'apple-failed': 'iCloud could not connect. Check your Apple Account email and app-specific password, then try again.',
  'apple-password': 'Use your Apple Account email and an app-specific password from your Apple Account settings.',
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
  const encryptionReady = Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim());
  let googleReady = false, outlookReady = false;
  try { calendarOAuthConfig(); googleReady = encryptionReady; } catch {}
  try { outlookOAuthConfig(); outlookReady = encryptionReady; } catch {}
  const userId = await currentUserId();
  let calendar: Awaited<ReturnType<typeof getCalendarStatus>> | null = null;
  let unavailable = false;
  if (userId) {
    try { calendar = await getCalendarStatus(userId); } catch { unavailable = true; }
  }
  const phone = userId && photonConfigured() ? await phoneLinkState(userId).catch(() => null) : null;
  const params = await searchParams;
  const proposedReturn = typeof params.returnTo === 'string' ? params.returnTo : '';
  const sharedReturn = safeSharedReturnPath(proposedReturn);
  const returnTo = sharedReturn ? setupReturnPath(sharedReturn)
    : proposedReturn === '/live' || /^\/join\/[A-Za-z0-9_-]{32,128}$/.test(proposedReturn) ? proposedReturn : '/setup';
  const message = typeof params.calendar === 'string' ? messages[params.calendar] : undefined;
  const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderTop: '1px solid var(--line)' } as const;
  const buttonStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '11px 18px', borderRadius: 24, border: '1px solid var(--purple-ink)', color: 'var(--purple-ink)', background: 'transparent', fontWeight: 500 } as const;
  return <main className="main-wrap" style={{ maxWidth: 820, paddingTop: 40, paddingBottom: 70 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Link href={sharedReturn ?? '/'} style={buttonStyle}>{sharedReturn ? 'Back to your Venn' : '← Back to Venn'}</Link>
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
      <p className="intro-copy">The app is currently using clearly labelled sample calendars. Live sign-in is unavailable until the server connection is configured.</p>
      <p className="intro-copy">Calendar access also needs a token encryption key. Add these through your local environment file or hosting settings, never in chat. See the repository&apos;s setup guide for the exact variable names.</p>
      <Link href="/app" style={{ ...buttonStyle, marginTop: 20 }}>Explore sample calendars</Link>
    </section>}
    <section className="plan-card" style={{ marginBottom: 20 }}>
      <p className="section-kicker">01 · YOUR IDENTITY</p><h2 style={{ marginTop: 8 }}>Sign in to Venn</h2>
      <p className="intro-copy">Sign-in identifies you in your groups. Calendar permission is a separate choice.</p>
      {userId ? <div style={rowStyle}><span>Signed in</span><form action={async () => { 'use server'; await signOut({ redirectTo: '/setup' }); }}><button style={buttonStyle}>Sign out</button></form></div>
        : <div className={styles.signInOptions}>{identityProviders().map(provider => <form key={provider.id} action={async () => { 'use server';
          if (loginConfigured() && identityProviders().some(item => item.id === provider.id && item.configured)) await signIn(provider.id, { redirectTo: returnTo }); }}>
          <button style={buttonStyle} disabled={!configured || !provider.configured}>Continue with {provider.name}</button>
        </form>)}</div>}

    </section>
    <section className="plan-card">
      <p className="section-kicker">02 · FREE &amp; BUSY ONLY</p><h2 style={{ marginTop: 8 }}>Choose your calendar coverage</h2>
      <p className="intro-copy">Connect Google, Outlook, or Apple iCloud, then include every calendar you want checked. Busy times stay private; your group sees only the availability you save.</p>
      {!userId && <p className={styles.signInHint}>Sign in above to connect your calendars.</p>}
      {unavailable && <p role="status" className="intro-copy">Your connections could not be checked. Try again shortly.</p>}
      <div className={styles.providers}>{(['google', 'outlook', 'apple'] as const).map(provider => {
        const state = calendar?.providers?.find(item => item.provider === provider)?.state
          ?? (provider === 'google' ? calendar?.state : 'disconnected') ?? 'disconnected';
        const items = calendar?.calendars.filter(item => (item.provider ?? 'google') === provider) ?? [];
        const ready = provider === 'google' ? googleReady : provider === 'outlook' ? outlookReady : encryptionReady;
        return <section key={provider} className={styles.provider} aria-label={providerNames[provider]}>
          <div className={styles.providerHeading}><span className={`${styles.providerIcon} ${styles[provider]}`} aria-hidden="true">{provider === 'google' ? 'G' : provider === 'outlook' ? 'O' : 'a'}</span>
            <div><h3>{providerNames[provider]}</h3><p>{provider === 'google' ? 'Personal, work, and shared calendars' : provider === 'outlook' ? 'Outlook.com, Microsoft 365, work or school' : 'Calendars stored in your iCloud account'}</p></div>
            {state !== 'disconnected' && <span className={styles.connectionState}>{state === 'reconnect' ? 'Reconnect needed' : 'Connected'}</span>}
          </div>
          {items.map(item => <div key={item.id} className={styles.calendarRow}>
            <div><strong>{item.name}</strong><p>{item.enabled ? 'Included in checks' : 'Not included'}</p></div>
            <form action="/api/calendar/selection" method="post">
              <input type="hidden" name="provider" value={provider} /><input type="hidden" name="calendarId" value={item.id} />
              <input type="hidden" name="enabled" value={String(!item.enabled)} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <button style={buttonStyle} aria-label={`${item.enabled ? 'Exclude' : 'Include'} ${item.name} from ${providerNames[provider]}`}>{item.enabled ? 'Exclude' : 'Include'}</button>
            </form>
          </div>)}
          <div className={styles.providerActions}>
            {provider !== 'apple' ? <form action="/api/calendar/connect" method="post">
              <input type="hidden" name="provider" value={provider} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <button style={buttonStyle} disabled={!userId || !ready}>{state === 'disconnected' ? 'Connect' : 'Reconnect'} {providerNames[provider]}</button>
            </form> : <details className={styles.appleForm}>
              <summary>{state === 'disconnected' ? 'Connect' : 'Reconnect'} Apple iCloud</summary>
              <p>Use an app-specific password from your <a href="https://account.apple.com/" target="_blank" rel="noopener noreferrer">Apple Account settings</a>. Your regular Apple Account password will not work.</p>
              <form action="/api/calendar/apple/connect" method="post">
                {sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
                <label>Apple Account email<input type="email" name="email" required maxLength={254} autoComplete="username" disabled={!userId || !ready} /></label>
                <label>App-specific password<input type="password" name="password" required maxLength={32} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" disabled={!userId || !ready} /></label>
                <button style={buttonStyle} disabled={!userId || !ready}>Connect iCloud calendars</button>
              </form>
              <p>Venn encrypts this password on the server. Disconnect here and revoke the app-specific password in your Apple Account to remove access.</p>
            </details>}
            {state !== 'disconnected' && <form action="/api/calendar/revoke" method="post">
              <input type="hidden" name="provider" value={provider} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <button className={styles.disconnect}>Disconnect {providerNames[provider]}</button>
            </form>}
          </div>
          {!ready && <p className={styles.unavailable}>This connection is currently unavailable.</p>}
        </section>;
      })}</div>
      <p className="intro-copy">Venn uses selected calendars to check busy times. Event details stay out of shared Venns and are not stored. Adding an event is a separate Google Calendar permission and always needs your confirmation.</p>

    </section>
    {phone && <section className="plan-card" style={{ marginTop: 20 }}>
      <p className="section-kicker">03 · YOUR IPHONE</p><h2 style={{ marginTop: 8 }}>Pair your phone</h2>
      <p className="intro-copy">Pairing links your own Messages thread to Venn so results and replies like &ldquo;lemme check&rdquo; reach only you. Venn never messages your friends.</p>
      <PhonePairing initiallyPaired={phone.paired} />
    </section>}
    <p className="intro-copy" style={{ marginTop: 22 }}>Live request interpretation: {process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_MODEL?.trim()
      ? 'Gemini is configured on the server.' : 'Gemini needs GEMINI_API_KEY and GEMINI_MODEL in your server environment.'} Calendar and message content is never shown here.</p>
  </main>;
}
