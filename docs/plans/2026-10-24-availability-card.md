# Availability card implementation

Goal: let a group choose a time or date through editable, account-free availability responses over a creator-selected planning span.

Architecture: add an independent AvailabilityPoll and AvailabilityResponse alongside the current calendar request/option system. Share `/r/[share]` by recognizing either poll type. Server aggregates self-reported ranges; calendar busy data never enters this feature. Owner session controls creation/closure and a browser cookie controls guest edits and post-response identity access.

Tech stack: Next.js App Router, React, TypeScript, Prisma/Postgres, Luxon, Zod, Vitest, Playwright, existing Photon transport.

```text
/venn (owner session) -> POST /api/venns -> poll + digest-only share grant
  -> /r/[share] -> GET /api/venns/[share] -> counts + own response
  -> PUT /api/venns/[share]/availability -> validate -> serializable upsert
       -> counts; own answer unlocks optional display-name list
       -> /signup -> Google identity -> /venn
  -> deadline / POST /api/venns/[share]/close (owner only)
       -> atomic notification claim -> paired organizer text
       -> readable closed results -> retention expiry -> purge
Errors: invalid range/name -> 422; no owner session -> 401;
        unauthorized close -> 404; closed write/revoked/expired -> 410;
        conflicting edit -> retry P2034 then 409; transport uncertainty -> no blind retry
```

## Files and contracts

- `prisma/schema.prisma`, `prisma/migrations/20261026000000_availability_polls/migration.sql`: `AvailabilityPoll` fields ownerId, activity, timezone, scale, startDate, endDate, closesAt, closedAt, expiresAt, tokenDigest, revokedAt, noticeState, createdAt; responses relation. `AvailabilityResponse`: pollId, voterKey, name, ranges Json, updatedAt; unique pollId/voterKey.
- `src/features/availability/schema.ts`: strict creation schema `{activity, timezone, scale: 'day'|'week'|'fortnight'|'month'|'months'|'year', startDate, endDate, closesAt}`; response schema `{name, ranges: {start:string,end:string}[]}`. Time mode uses ISO instants; date mode uses ISO calendar dates with exclusive end. Empty ranges explicitly means unavailable. Validate range bounds and local 15-minute steps.
- `src/features/availability/overlap.ts`: date/span resolution, range merging and counting; returned buckets `{start,end,count}`, `best` top three merged equal-count windows; counts include explicit respondents only. Export types for UI.
- `src/features/availability/service.ts`: creation, read with optional actor, serializable response save, owner close, expiry/revocation checks, own response restoration, names gated on saved response. Public contract `AvailabilityPollView`: activity, timezone, scale, startDate, endDate, closesAt, closed, respondentCount, buckets, best, ownResponse, names (only requested after submission), isOwner. No tokenDigest, voterKey, ownerId or individual ranges other than one's own.
- `src/features/availability/notices.ts`: atomic pending -> sending -> sent/uncertain/unpaired close-result notification, paired organizer only. Shared transport `sendPairedText` from existing delivery module.
- `src/app/api/venns/route.ts`, `src/app/api/venns/[share]/route.ts`, `availability/route.ts`, `close/route.ts`: creation/read/update/close with existing JSON, same-origin, rate-limit and cookie conventions. Cookie path `/`, duration supports year-scale edits. `GET` accepts `?names=1`; service enforces post-response gate.
- `src/app/venn/{page.tsx,create-venn.tsx,venn.module.css}`: authenticated creation form and share/copy/close controls. Provide discoverable links from `/live` and landing page.
- `src/app/r/[share]/{page.tsx,availability-voting.tsx,availability.module.css,opengraph-image.tsx}`: retain existing poll flow, add new availability flow, responsive day/week time controls, date grid, live overlap, optional respondents, CTA.
- `src/app/signup/page.tsx`: existing Google signup, redirect `/venn`, signed-in creation link.
- Maintenance endpoint/purge: process due notices before cleanup; purge expired availability polls.
- `tests/unit/availability.test.ts`, `tests/integration/availability.test.ts`, `tests/e2e/availability.spec.ts`: meaningful behavior coverage.

## Tasks

- [x] 1. Run `npx vitest run`: baseline should pass existing suite (handoff reports 145). Add schema/overlap tests for day/week/fortnight, month/year, DST, exclusive-end dates, bounds, disjoint ranges, duplicate ranges, no-answer vs explicit unavailable; run focused tests and observe missing-module failure before implementation. Implement schema and pure helpers; rerun to pass.
- [x] 2. Add independent models/migration, generate Prisma client with `npx prisma generate`. Add service tests first for single-browser upsert, two separate respondents, out-of-window rejection, name gating and response privacy, revoked/expired links, owner-only close, deadline rejection and concurrent last edits. Implement service/API; run `npx vitest run tests/integration/availability.test.ts`.
- [x] 3. Implement signup and creation form against the contract. Read bundled Next.js route/page guides before editing. Validate selected end date/scale/deadline before creation; display full share URL with copy action and owner-only early-close action. Week caps at seven days, fortnight at fourteen, month spans one calendar month, months up to twelve months, year one calendar year.
- [x] 4. Add shared response component and isolated CSS. Restore own saved response by cookie, allow clear/unavailable response, do not overwrite unsaved edits during five-second refresh. Offer local-view timezone for timed selection and poll-timezone label. Use selectable date grid for long spans and accessible time inputs plus draggable timed grid for short spans. After save render signup CTA; names remain optional and server-gated. Keep legacy polls working and render suitable OG preview for either mode.
- [x] 5. Test and implement close-result notification claims, connect protected maintenance endpoint and opportunistic poll calls, and add expiry cleanup. Concurrent claim test expects exactly one sender call; send failure must not trigger an automatic duplicate send.
- [x] 6. Migrate local test database only, seed new polls and run two-browser mobile/desktop Playwright journeys including drag, names hidden until answer, editing, deadline/early close and CTA target. `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`, `npx playwright test`: all must pass. Review final diff and document live-only verification still outstanding.

## Design decisions recorded during planning

The existing worktree is already isolated; work from `origin/main` on `feat/availability-card`. Preserve the local handoff files and checklist edits. Do not deploy or mutate production data as part of local verification. The user approved the product direction and said everything is good to go; execute in this session without another planning approval.

## Verification evidence

- Baseline: 145 existing Vitest tests passed before changes.
- Final automated checks: 178 Vitest tests passed, including opt-in real Postgres concurrent saves and save-versus-close tests. Typecheck, ESLint and production build passed.
- Production-server browser verification: 34 guest/legacy/preview tests and two separately configured authenticated creator tests passed across desktop and 390px mobile, with zero retries. The signed-in sessions were seeded only in an isolated local test database; Google and Photon credentials were replaced by test-only values or disabled in the test server.
- Browser checks cover actual touch/mouse drags, keyboard edits, two guests, two simultaneous first saves in one browser, own-answer restoration, name privacy, weekly date-and-time selection, early close, readable closed results, signup CTA, app-origin OG PNG and no horizontal overflow. Creator creation/sharing/early-close works without a calendar grant. Mobile and desktop creator screenshots were visually inspected.
- Review fixes: reject nonexistent/ambiguous DST wall times; initialize the guest identity in a serialized IndexedDB transaction before its first cookie; prevent stale refreshes from replacing saved answers; describe per-cell counts to screen readers; improve text contrast; resolve OG image URLs against APP_BASE_URL. Independent follow-up review found no remaining Important issues. Guest-key storage has no account/calendar permissions and is documented in the spec.
- Remaining live evidence: no production deployment, real Google signup for a new account, real iMessage card unfurl, or real organizer text was performed. Existing public-launch credential rotation and provider setup work from the handoff remains separate.
