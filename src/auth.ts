import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { identityProviders } from '@/features/identity/providers';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { AdapterAccount } from '@auth/core/adapters';
import { getDb } from '@/lib/db';

export function loginConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET
    && identityProviders().some(provider => provider.configured));
}

/** Identity login does not need to retain OAuth bearer credentials. */
export function stripLoginTokens(account: AdapterAccount): AdapterAccount {
  const excluded = new Set(['access_token', 'refresh_token', 'id_token']);
  return Object.fromEntries(Object.entries(account).filter(([key]) => !excluded.has(key))) as AdapterAccount;
}

export const { auth, handlers, signIn, signOut } = NextAuth(() => {
  const configured = loginConfigured();
  const adapter = configured ? PrismaAdapter(getDb()) : undefined;
  const originalLink = adapter?.linkAccount;
  return {
    adapter: adapter ? { ...adapter, linkAccount: originalLink ? account => originalLink(stripLoginTokens(account)) : undefined } : undefined,
    providers: configured ? [
      ...(identityProviders().find(provider => provider.id === 'google')?.configured ? [Google({ authorization: { params: { scope: 'openid email profile' } } })] : []),
      ...(identityProviders().find(provider => provider.id === 'microsoft-entra-id')?.configured ? [MicrosoftEntraID({
        issuer: 'https://login.microsoftonline.com/common/v2.0', authorization: { params: { scope: 'openid email profile' } },
        profile(profile) { return { id: profile.sub, name: profile.name, email: profile.email ?? profile.preferred_username, image: null }; },
      })] : []),
    ] : [],
    session: { strategy: 'database' as const },
    pages: { signIn: '/setup' },
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    logger: {
      error() { /* Auth errors must not serialize provider payloads or credentials. */ },
      warn() { /* Surface actionable setup state through the setup page. */ },
      debug() { /* Never log authentication payloads. */ },
    },
  };
});

export async function currentUserId(): Promise<string | null> {
  if (!loginConfigured()) return null;
  const session = await auth();
  return session?.user?.id ?? null;
}
