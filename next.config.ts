import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  // Keep `next dev` from writing an AGENTS.md into the repo.
  agentRules: false,
  outputFileTracingIncludes: { '/api/requests/*/card': ['./public/fonts/*'], '/api/webhooks/photon': ['./public/fonts/*'] },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
