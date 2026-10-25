import Link from 'next/link';
import { currentUserId, loginConfigured, signIn } from '@/auth';
import { VennMark } from '@/components/venn-mark';
import styles from '@/app/venn/venn.module.css';
import { safeSignupReturnPath } from '@/features/identity/return-path';

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await currentUserId();
  const configured = loginConfigured();
  const returnTo = safeSignupReturnPath((await searchParams).returnTo);
  const returning = returnTo !== '/venn';
  return <main className={styles.shell}>
    <Link href="/" className="brand"><VennMark /><span>venn</span></Link>
    <header className={styles.intro}>
      <p className="eyebrow">A LITTLE OVERLAP GOES A LONG WAY</p>
      <h1>Your <span>next plan.</span></h1>
      <p>{returning ? 'See your busy times as you choose.' : 'One link. A plan for your people.'}</p>
    </header>
    <section className={styles.card}>
      <h2>{returning ? 'Your calendar, for your eyes.' : userId ? 'Your next Venn is waiting.' : 'Make your own Venn.'}</h2>
      <p className={styles.copy}>{returning ? 'Your busy times stay private. Your group sees only the availability you save.' : 'Create a Venn. Friends answer without an account.'}</p>
      {userId ? <Link href={returnTo} className={styles.primary}>{returning ? 'Continue to your Venn' : 'Create a Venn'}</Link>
        : <form action={async () => { 'use server'; if (loginConfigured()) await signIn('google', { redirectTo: returnTo }); }}>
          <button className={styles.primary} disabled={!configured}>Continue with Google</button>
        </form>}
      {!userId && !configured && <p className={styles.hint} style={{ marginTop: 16 }}>Sign-up is unavailable. Try again later.</p>}
      <p className={styles.hint} style={{ marginTop: 20 }}>Calendar access is optional.</p>
    </section>
  </main>;
}
