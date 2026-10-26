import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const authenticated = process.env.VENN_AUTH_E2E === '1';
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Use a valid PLAYWRIGHT_PORT.');
const baseURL = `http://127.0.0.1:${port}`;
// `npm run verify` already builds in CI; only rebuild if no production build exists.
const startCommand = `npm run start -- --port ${port}`;
const ciCommand = existsSync('.next/BUILD_ID') ? startCommand : `npm run build && ${startCommand}`;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 2,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
        isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
  webServer: {
    // CI serves the production bundle. Locally, `npm run dev` is reused when already running.
    command: CI ? ciCommand : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !CI,
    timeout: CI ? 300_000 : 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      APP_BASE_URL: baseURL, AUTH_URL: baseURL,
      // Node passes explicit empty values on Windows; PowerShell `$env:NAME=''` removes the variable.
      // Never let Next reload real OAuth/Photon credentials from .env.local during browser tests.
      AUTH_GOOGLE_ID: authenticated ? 'venn-e2e-google-client' : '',
      AUTH_GOOGLE_SECRET: authenticated ? 'venn-e2e-google-secret' : '',
      AUTH_SECRET: 'venn-playwright-local-only-session-secret',
      IMESSAGE_PROJECT_ID: '', IMESSAGE_PROJECT_SECRET: '', IMESSAGE_WEBHOOK_SECRET: '',
    },
  },
});
