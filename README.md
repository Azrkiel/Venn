# Venn

Let's find a time, together.

Venn helps you answer "are you free?" texts. It checks free/busy time on the Google calendars you and your friends choose to connect, finds a few windows that fit the activity with some breathing room, and hands you a warm reply that you send yourself. It never messages your friends for you and never reads event titles or descriptions.

## Status

The app code for the core flow is written and passes its mechanical checks: typecheck, lint, unit and integration tests (mocked providers), production build, a Playwright browser suite, and the Prisma migration against a real Postgres. It has **not** been verified against live Google, Gemini or Photon accounts yet, and the iPhone path has not been tested on a device. See [the build checklist](devpost/checklist.md) for what each slice still needs.

Without credentials the app runs a clearly labelled sample planner at `/app` that uses the real ranking code on invented calendars.

## What's in the box

| Area | Where |
| --- | --- |
| Overlap ranking (pure, deterministic) | `src/features/scheduling/rank.ts`, `windows.ts` |
| Ask interpretation (Gemini structured output) | `src/features/scheduling/intent.ts` |
| Google sign-in and Calendar OAuth, encrypted grants | `src/auth.ts`, `src/features/calendar/` |
| Groups, invites, live requests | `src/features/groups/`, `src/features/requests/` |
| Shared options and votes | `src/features/polls/`, `src/app/r/[share]/` |
| Add the chosen event once | `src/features/requests/add.ts`, `booking.ts` |
| iMessage via Photon, iPhone Shortcut endpoints | `src/features/messaging/`, `src/app/api/shortcut/`, [docs/shortcuts.md](docs/shortcuts.md) |
| Expiry cleanup | `src/features/maintenance/`, `scripts/purge-expired.ts` |

Stack: Next.js 16 (App Router), React 19, Prisma 7 on Postgres, Auth.js v5, Tailwind 4, Luxon, Zod, Vitest, Playwright.

## Run it locally

Node 22.12 or newer.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. On machines that report `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, set `$env:NODE_USE_SYSTEM_CA = '1'` in that terminal first.

For a local database, any Postgres works. With Docker:

```powershell
docker run -d --name venn-pg -e POSTGRES_USER=venn -e POSTGRES_PASSWORD=venn -e POSTGRES_DB=venn -p 55432:5432 postgres:17-alpine
```

Then set `DATABASE_URL=postgresql://venn:venn@127.0.0.1:55432/venn` in `.env.local` and run `npm run db:migrate`.

Connecting Google, Gemini and Photon is covered step by step in [docs/setup.md](docs/setup.md).

## Checks

| Command | What it proves |
| --- | --- |
| `npm run verify` | typecheck, lint, all Vitest suites, production build |
| `npm run test:e2e` | Playwright on desktop and mobile; the shared-poll journey runs when `DATABASE_URL` is set |
| `npm run db:check` | the configured Postgres is reachable |
| `npm run smoke:calendar` / `smoke:gemini` / `smoke:photon` | one live, read-only (or single deliberate DM) check against each real provider |

Mocks, sample calendars and a passing build are not live evidence. The smoke scripts are.

## Planning documents

- [Original product plan](plan.md)
- [Implementation plan](docs/plans/2026-10-24-venn-implementation.md)
- [Platform research](docs/research/2026-10-24-platform-checks.md)
- [Scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md), [build checklist](devpost/checklist.md)
