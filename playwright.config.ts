import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const baseURL = 'http://127.0.0.1:3000';
// `npm run verify` already builds in CI; only rebuild if no production build exists.
const ciCommand = existsSync('.next/BUILD_ID') ? 'npm run start' : 'npm run build && npm run start';

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
    command: CI ? ciCommand : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !CI,
    timeout: CI ? 300_000 : 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}) },
  },
});
