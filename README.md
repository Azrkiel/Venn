# Venn

Let's find a time, together.

Venn turns a group's "when is everyone free?" into a shared plan. Create a Venn, choose its dates and closing deadline, and share one link. Friends mark their availability without an account; everyone sees the overlap. Day, week and two-week plans collect times, while longer plans collect whole dates.

The separate calendar planner at `/live` helps answer "are you free?" texts using selected Google, Microsoft Outlook, and Apple iCloud calendars, Gemini interpretation and a reply you choose to send. Solo requests check your calendar; connected groups compare consenting members. Calendar details are never stored or shared with friends.

## Status

The availability and calendar-planner flows are implemented. Historical pilot checks on October 24–25, 2026 recorded Google sign-in, a live Gemini request, phone pairing and solo iMessage replies. Those checks do not establish that every integration works today or that the full group flow has passed on real phones.

The remaining live acceptance checks cover two phones answering the same Venn, real Google busy overlays and new-account consent, Messages link previews and organizer close summaries, explicit calendar writes, and the iPhone Shortcut. See the [phone acceptance record](docs/phone-spike.md) and [build checklist](devpost/checklist.md). Run the checks below against the exact revision being released; historical test counts are not a current release result.

Without credentials the app runs a clearly labelled sample planner at `/app` that uses the real ranking code on invented calendars.

## What's in the box

| Area | Where |
| --- | --- |
| Group creation and signup draft | `src/app/venn/`, `src/app/signup/` |
| Availability responses, overlap and close summaries | `src/features/availability/`, `src/app/r/[share]/` |
| Overlap ranking (pure, deterministic) | `src/features/scheduling/rank.ts`, `windows.ts` |
| Ask interpretation (Gemini structured output) | `src/features/scheduling/intent.ts` |
| Google/Microsoft sign-in, Google/Outlook/iCloud calendars, encrypted grants | `src/auth.ts`, `src/features/calendar/` |
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

Mocks, sample calendars and a passing build are not live evidence. The provider smoke scripts exercise real integrations; phone delivery still needs receipt confirmed on the actual device. `smoke:photon` sends one deliberate message to the paired organizer.

For a reproducible walkthrough, use the [demo guide](docs/demo.md). The offline [app map](devpost/app-map.html) connects a saved response to its UI, API, database and overlap calculation.

## Planning documents

- [Original product plan](plan.md)
- [Implementation plan](docs/plans/2026-10-24-venn-implementation.md)
- [Platform research](docs/research/2026-10-24-platform-checks.md)
- [Scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md), [build checklist](devpost/checklist.md)
