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
import { BrandLogo, identityLogos } from '@/components/brand-logos';
import { safeSharedReturnPath, setupReturnPath } from '@/features/identity/return-path';

export const dynamic = 'force-dynamic';

const calendarLogos = { google: 'google', outlook: 'microsoft', apple: 'apple' } as const;
const providerBlurbs = { google: 'Personal, work, and shared calendars', outlook: 'Outlook.com and Microsoft 365', apple: 'Calendars stored in iCloud' } as const;

const messages: Record<string, string> = {
  disconnected: 'Calendar disconnected from Venn. You can also revoke its access in your provider account.',
  'apple-failed': 'iCloud could not connect. Check your Apple Account email and app-specific password, then try again.',
  'outlook-failed': 'Outlook could not connect. Please try again in a moment.',
  'outlook-no-mailbox': 'This Microsoft account has no Outlook calendar. Use an Outlook.com or Microsoft 365 account, or connect Google or iCloud instead.',
  'apple-password':'Use your Apple Account email and an app-specific password from your Apple Account settings.',
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
      <h2>Sign in to Venn</h2>
      {userId ? <div style={rowStyle}><span>Signed in</span><form action={async () => { 'use server'; await signOut({ redirectTo: '/setup' }); }}><button style={buttonStyle}>Sign out</button></form></div>
        : <div className={styles.signInOptions}>{[...identityProviders(), { id: 'apple', name: 'Apple', configured: false }].map(provider => provider.configured || provider.id === 'google'
          ? <form key={provider.id} action={async () => { 'use server';
            if (loginConfigured() && identityProviders().some(item => item.id === provider.id && item.configured)) await signIn(provider.id, { redirectTo: returnTo }); }}>
            <button className={styles.signInButton} disabled={!configured || !provider.configured}><BrandLogo id={identityLogos[provider.id] ?? 'google'} />Continue with {provider.name}</button>
          </form>
          : <div key={provider.id} className={`${styles.signInButton} ${styles.soon}`}><BrandLogo id={identityLogos[provider.id] ?? 'google'} />{provider.name}<span className={styles.soonPill}>Coming soon</span></div>)}</div>}
    </section>
    <section className="plan-card">
      <h2>Connect your calendars</h2>
      <p className="intro-copy">Venn only sees when you&apos;re busy, never what you&apos;re doing.</p>
      {!userId && <p className={styles.signInHint}>Sign in first, then connect with one tap.</p>}
      {unavailable && <p role="status" className="intro-copy">Your connections could not be checked. Try again shortly.</p>}
      <div className={styles.providers}>{(['google', 'outlook', 'apple'] as const).map(provider => {
        const state = calendar?.providers?.find(item => item.provider === provider)?.state
          ?? (provider === 'google' ? calendar?.state : 'disconnected') ?? 'disconnected';
        const items = calendar?.calendars.filter(item => (item.provider ?? 'google') === provider) ?? [];
        const ready = provider === 'google' ? googleReady : provider === 'outlook' ? outlookReady : encryptionReady;
        const verb = state === 'disconnected' ? 'Connect' : 'Reconnect';
        const heading = <><span className={styles.providerIcon} aria-hidden="true"><BrandLogo id={calendarLogos[provider]} size={22} /></span>
          <div className={styles.providerText}><h3>{providerNames[provider]}</h3><p>{providerBlurbs[provider]}</p></div></>;
        return <section key={provider} className={styles.provider} aria-label={providerNames[provider]}>
          {provider === 'apple' && ready && state !== 'connected' ? <details className={styles.appleForm}>
            <summary className={styles.providerRow} aria-label={`${verb} Apple iCloud`}>{heading}<span className={styles.connect}>{verb}</span></summary>
            <form action="/api/calendar/apple/connect" method="post">
              {sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <p>Use an <a href="https://account.apple.com/" target="_blank" rel="noopener noreferrer">app-specific password</a>, not your regular Apple password. It&apos;s encrypted, and you can revoke it anytime.</p>
              <label>Apple Account email<input type="email" name="email" required maxLength={254} autoComplete="username" disabled={!userId} /></label>
              <label>App-specific password<input type="password" name="password" required maxLength={32} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" disabled={!userId} /></label>
              <button className={styles.connect} disabled={!userId}>Connect iCloud calendars</button>
            </form>
          </details> : <div className={styles.providerRow}>{heading}
            {state === 'connected' ? <span className={styles.connectedPill}>Connected</span>
              : !ready && provider !== 'google' ? <span className={styles.soonPill}>Coming soon</span>
              : <form action="/api/calendar/connect" method="post">
                <input type="hidden" name="provider" value={provider} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
                <button className={styles.connect} disabled={!userId || !ready} aria-label={`${verb} ${providerNames[provider]}`}>{verb}</button>
              </form>}
          </div>}
          {items.map(item => <div key={item.id} className={styles.calendarRow}>
            <div><strong>{item.name}</strong><p>{item.enabled ? 'Included in checks' : 'Not included'}</p></div>
            <form action="/api/calendar/selection" method="post">
              <input type="hidden" name="provider" value={provider} /><input type="hidden" name="calendarId" value={item.id} />
              <input type="hidden" name="enabled" value={String(!item.enabled)} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <button className={item.enabled ? styles.quiet : styles.connect} aria-label={`${item.enabled ? 'Exclude' : 'Include'} ${item.name} from ${providerNames[provider]}`}>{item.enabled ? 'Exclude' : 'Include'}</button>
            </form>
          </div>)}
          {state !== 'disconnected' && <div className={styles.manage}>
            {state === 'connected' && provider !== 'apple' && ready && <form action="/api/calendar/connect" method="post">
              <input type="hidden" name="provider" value={provider} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <button className={styles.disconnect}>Reconnect {providerNames[provider]}</button>
            </form>}
            <form action="/api/calendar/revoke" method="post">
              <input type="hidden" name="provider" value={provider} />{sharedReturn && <input type="hidden" name="returnTo" value={sharedReturn} />}
              <button className={styles.disconnect}>Disconnect {providerNames[provider]}</button>
            </form>
          </div>}
        </section>;
      })}
        <section className={`${styles.provider} ${styles.comingSoon}`} aria-label="Email">
          <div className={styles.providerRow}><span className={styles.providerIcon} aria-hidden="true"><BrandLogo id="email" size={22} /></span>
            <div className={styles.providerText}><h3>Email</h3><p>Finds free times in the plans already in your inbox.</p></div>
            <span className={styles.soonPill}>Coming soon</span></div>
        </section>
      </div>
      <p className={styles.footnote}>Venn never adds events or messages your friends without asking you first.</p>
    </section>
    {phone && <section className="plan-card" style={{ marginTop: 20 }}>
      <h2>Pair your phone</h2>
      <p className="intro-copy">Pairing links your own Messages thread to Venn so results and replies like &ldquo;lemme check&rdquo; reach only you. Venn never messages your friends.</p>
      <PhonePairing initiallyPaired={phone.paired} />
    </section>}
  </main>;
}
