---
status: approved
source: ../../plan.md
date: 2026-10-24
---

# Venn implementation plan

**Goal:** Build Venn end to end so a small friend group can find real shared free time, choose a warm reply, and keep using the flow after the hackathon.

**Architecture:** One Next.js application serves the mobile web surfaces, Shortcut API, calendar integration, and Photon webhook. Gemini interprets scheduling language; deterministic code calculates availability and ranks options. A single Postgres database stores identity, permissions, groups, normalized requests, and votes, with the same database supporting persistent bot state.

**Proposed stack:** TypeScript, Next.js App Router, React, Tailwind CSS, Auth.js with its Prisma adapter, Prisma/Postgres on Neon, Google Calendar API, Google GenAI SDK, Luxon, Photon through Chat SDK, Vitest, and Playwright. Vercel hosts the live integration.

The learner approved this scope, stack, and build order with "yea, looks great, continue". This document describes implementation work, not completed application code. `plan.md` remains the original product source. New choices are labelled below; clear approval of the relevant displayed design is required before application implementation under the installed planning workflows.

## 1. File ownership map

All application paths below are planned, not existing. Organize by feature; thin route handlers call services and do not contain calendar math or model prompts.

```text
Venn/
  plan.md                              Original product intent; preserve
  .agents/skills/                      Installed Devpost curriculum; not app runtime
  devpost/                             Learner-approved planning and build progress
  docs/plans/                          Engineering roadmap and implementation details
  docs/research/                       Documentation evidence and device-test findings
  prisma/
    schema.prisma                      App relations plus Auth.js models
    migrations/                        Versioned app constraints/indexes
  prisma.config.ts                      Prisma connection/migration configuration
  src/
    auth.ts                            Google sign-in and server-side sessions
    app/
      layout.tsx                       Fonts, metadata, base accessibility
      globals.css                      Original Venn design tokens
      page.tsx                         Setup entry, existing session -> /app
      app/page.tsx                     Private organizer request/connection screen
      app/groups/[groupId]/page.tsx     Group membership, invites, leave/revoke
      join/[invite]/page.tsx            Join consent and Google connection
      r/[share]/page.tsx                Public option page; no private timeline
      r/[share]/opengraph-image.tsx     Sanitized preview of proposed options
      api/auth/[...nextauth]/route.ts   Auth.js handlers
      api/groups/route.ts              Authenticated group creation
      api/groups/[groupId]/route.ts    Authenticated membership/leave operations
      api/invites/[invite]/route.ts    Invite redemption; no arbitrary groupId join
      api/calendar/connect/route.ts    Incremental Calendar OAuth start
      api/calendar/callback/route.ts   Validate OAuth state; encrypt grants
      api/calendar/revoke/route.ts     Revoke/delete Calendar grants
      api/device-tokens/route.ts       Pair/revoke organizer Shortcut credential
      api/phone-link/route.ts          Start/finish verified DM pairing
      api/requests/route.ts            Create request from organizer web session
      api/requests/[id]/route.ts       Owner result/status and cancellation
      api/requests/[id]/select/route.ts Select an existing numbered slot
      api/requests/[id]/add/route.ts    Recheck and explicitly add owner event
      api/shortcut/route.ts            Scoped, authenticated Shortcut intake
      api/shortcut/latest/route.ts     Latest request for paired organizer
      api/webhooks/photon/route.ts     Verified inbound DM handling
      api/polls/[share]/route.ts       Read sanitized options and vote totals
      api/polls/[share]/votes/route.ts Submit/update member or guest vote
      api/internal/maintenance/route.ts Secret-checked expiry cleanup trigger
    components/
      venn-mark.tsx                    Two outlined circles, accent overlap
      slot-option.tsx                  Shared accessible option row
      day-card.tsx                     Private owner timeline
      group-avatars.tsx                Attendance with text alternatives
      connection-state.tsx             Connected/reconnect/unknown status
    features/
      identity/permissions.ts          Owner/member checks and scoped link checks
      identity/device-token.ts         Random token issuance, digest lookup, revoke
      identity/phone-link.ts           Pair signed-in owner with observed Photon DM
      groups/service.ts               Membership and invite lifecycle
      calendar/oauth.ts               Calendar grants, scopes, refresh lock/reconnect
      calendar/client.ts              calendarList, freeBusy, explicit events.insert
      calendar/token-vault.ts          Authenticated encryption for grant secrets
      scheduling/types.ts             Inputs, intervals, result/state types
      scheduling/intent.ts            Gemini extraction + semantic validation
      scheduling/windows.ts           Zoned date/window -> UTC, DST ambiguity checks
      scheduling/rank.ts              Pure slot generation and ranking
      scheduling/draft.ts             Warm replies from validated slot IDs/times
      requests/service.ts             Shared orchestration for web/phone requests
      requests/state.ts               Allowed transitions and active request pointer
      polls/service.ts                Vote upsert, completion, deterministic winner
      messaging/bot.ts                Photon/Chat SDK wiring; never contact friends
      messaging/delivery.ts           Owner-only routing and delivery state
      cards/render.tsx                Private 1080x1350 card / public option preview
    lib/
      db.ts                            Shared bounded connection pool/client
      env.ts                           Validate required server configuration
      log.ts                           Allowlisted metadata only, no payload logging
  tests/
    unit/rank.test.ts                  Scheduling invariants and edge cases
    unit/windows.test.ts               Time zones, relative dates, DST
    unit/intent.test.ts                Parse validation and clarification states
    integration/requests.test.ts       Live-path orchestration with provider stubs
    integration/permissions.test.ts    Request/group/credential boundaries
    integration/calendar.test.ts       Partial failures, refresh, recheck, idempotency
    integration/polls.test.ts          Concurrent votes and completion semantics
    integration/photon.test.ts         Signatures, replay, routing, retention audit
    e2e/core.spec.ts                    Real rendered mobile flow with labelled fixtures
  scripts/
    smoke-calendar.ts                  Read-only live multi-calendar check
    smoke-photon.ts                    Deliberate test DM to paired organizer only
    migrate-chat-state.ts              Versioned setup for Chat SDK Postgres tables
    purge-expired.ts                   Idempotent expiration cleanup; no message jobs
  .env.example                          Variable names and dummy values only
  package.json                          Explicit verify/test/build scripts
  package-lock.json                     Exact resolved dependency versions
  .github/workflows/verify.yml          Typecheck, focused tests, build, browser smoke
  vercel.json                           Approved deployment/runtime and cleanup schedule
```

Use a supported stable release set at scaffold time and commit the lockfile. Do not invent compatibility pins in this document; verify the chosen Next.js/Auth.js/Prisma/Chat SDK versions together in slice 1 and record exact versions in `devpost/spec.md` before subsequent slices depend on them.

## 2. Scope: demo first, daily-use pilot next

The learner wants an app friends actually use. A hackathon-sized proof of concept is the first release checkpoint, not a claim that the full nine-feature vision fits the curriculum's suggested 2–4 hours. External provisioning and phone validation can dominate the schedule; do not promise a completion time before those checks.

| Release | Included | Evidence required |
| --- | --- | --- |
| D: real core demo | One small group, consented Google calendars, activity/date parsing, organizer + requester hard constraint, buffers, ranked options, private day card, warm manual-send reply, at least one verified phone path | A live calendar conflict changes the suggested slots; results reach the organizer on their phone; unknowns remain unknown |
| P: daily-use pilot | D plus friend invitations, secure Google/phone linking, works/can't voting, explicit owner event creation, multi-group clarification, Lemme check, reconnect/revoke/delete, recoverable provider failures | The same group repeats the journey on another day; duplicate callbacks do not duplicate votes/events; leave/revoke takes effect |
| Later | Email, semantic duplicate detection, Outlook/iCloud, native app, bot group participation, broader public onboarding | Start only after the small-group pilot shows repeat use |

Retain the original product identity and the rule that Venn never sends the organizer's reply to friends. Event creation is a separate explicit action. Retry deduplication is required now even though semantic duplicate-event detection remains later.

### Three viable build approaches

1. **Recommended: shared core, early phone feasibility check.** Prove live overlap through a small private request screen, then connect the verified phone path to the same service. This avoids tying scheduling correctness to an untested automation. The private screen is a proposed addition to the original plan, not a replacement for iMessage.
2. **Phone-first as written.** Shortcut and Photon before any request screen. Closer to the original sequence; more of the initial work depends on device behavior and provider setup. Choose this if the phone path is already verified.
3. **Web-only hackathon cut.** Keep live group overlap and voting, defer iMessage. Smallest integration surface but weakens the distinctive intended experience. Do not make this substitution without the learner choosing it.

## 3. Stack and service boundaries

| Layer | Choice | Why / boundary |
| --- | --- | --- |
| Frontend | Next.js + React + TypeScript | Small mobile pages and server routes in one project; no separate frontend deployment |
| Styling | Tailwind + CSS custom properties | Implement the existing design directly; no dashboard UI kit needed |
| Sessions | Auth.js Google provider + Prisma adapter | Identity and server sessions; Calendar grants use a separate explicit flow |
| Database | Neon Postgres + Prisma | Relational constraints for members/votes and transactions for state changes |
| Bot state | `@chat-adapter/state-pg` | Reuse Postgres; avoid an additional Redis service |
| Calendar | Google Calendar REST APIs via Google's Node client | Availability from selected calendars; incremental permission for owner writes |
| Language parsing | `@google/genai` with supported structured output | Interpret the ask only; no tools, calendar access, auth decisions, or slot generation |
| Time | Luxon | Interpret local dates in explicit IANA zones and convert to UTC |
| Messages | `chat` + `@photon-ai/chat-adapter-imessage` | Cloud DM adapter behind a narrow delivery interface |
| Cards | `next/og` ImageResponse | Server-generated PNG, shared result data, no screenshot ingestion |
| Checks | Vitest + Playwright + TypeScript/ESLint | Domain correctness, API boundaries, and one mobile browser journey |
| Hosting | Vercel Node runtime | HTTPS callbacks and webhooks; no continuously running Mac/server |

**Change proposed from `plan.md`:** Postgres replaces the optional Upstash key-value store. It adds schema migrations but gives clear uniqueness and transaction boundaries. Keep all Google, model, database, and Photon credentials on the server. Use one database for app and bot state, with separate tables and retention policies.

No vector database, RAG, autonomous agent loop, microservices, or durable raw-message queue is needed for this product.

## 4. Core flow and failure paths

```text
[friend's text on organizer's iPhone]
        |
        +-- tested automation available --> [on-device keyword filter]
        |                                      |
        |                               relevant text only
        |                                      v
        +-- manual Shortcut/forward --> [authenticated request intake]
                                                |
                     bad token / oversized input +--> [401/413; no provider call]
                                                v
                                   [resolve owner + group + requester]
                                                |
                          ambiguous / unmatched +--> [ask; no calendar guess]
                                                v
                                  [Gemini: activity + date + duration]
                                                |
                       vague / refused / timeout +--> [clarify / retry visibly]
                                                v
                                  [resolve local date, zone, UTC range]
                                                |
                       nonexistent/ambiguous time +--> [clarify]
                                                v
                              [live Google free/busy per connected member]
                                                |
                   required member unknown/error +--> [reconnect / clarify]
                    optional member error/unjoined --> [mark unknown; continue]
                                                v
                            [buffer + generate candidates + rank in code]
                                                |
                                        no slots +--> [no fit; ask another window]
                                                v
                          [persist normalized result; discard original text]
                                                |
                     Photon unavailable/unpaired +--> [private result + manual retry]
                                                v
                             [private day card + numbered warm reply]
                                                |
                         organizer selects option --> [draft / compose manually]
                                                |
                          organizer shares poll --> [scoped option-only group page]
                                                |
                                   members/guests vote --> [counts; completion rule]
                                                |
                                  owner chooses Add --> [fresh conflict check]
                                                |
                         conflict / write denied +--> [explain; no silent booking]
                                                v
                                  [idempotent owner-only calendar event]
```

The private owner result and the public shared result are different views. The public preview never contains the owner's complete busy timeline, phone numbers, calendar IDs, grant state, or event details.

### Request states

Persist only normalized state: `needs_group`, `needs_requester`, `ready`, `no_slots`, `selected`, `added`, `cancelled`, `expired`, `retry_required`. Parsing and calendar fetch happen within a bounded request and are not durable message jobs. A crash before normalization is recovered by resubmitting, not by recovering stored text.

`ready -> selected -> added` requires the owner. Selection includes request ID and slot ID; a bare `1` applies only to that owner's single active, unexpired request. Otherwise ask which request. `no` cancels that active request. `add` cannot choose a slot implicitly or create events for friends.

Delivery state is separate: `not_requested`, `pending`, `sent`, `failed`, `uncertain`. A provider timeout after send may be uncertain; show that state and require deliberate resend rather than claiming exactly-once network delivery.

## 5. Frontend behavior and visual implementation

Carry the supplied design into CSS variables: paper `#FBF9F6`, ink `#1D1B24`, overlap `#7B5CFF`, most `#C9BCFF`, you `#8EC5FF`, friend `#FFB894`, busy `#E4E1DB`, buffer `#F1EEE8`. Fraunces headings; Inter body/time text. Rounded pills, 16px card corners, generous whitespace, no gradients/shadows.

| Surface | User action and result | Required alternate states |
| --- | --- | --- |
| Setup / private `/app` | Sign in, connect calendars, create/select group, pair Shortcut/DM; request input and latest result | No group, consent declined, reconnect required, phone not paired, first request, retryable failure |
| Group management | Invite friends, see connected/unknown statuses, leave, revoke/delete own access | Invite expired, already joined, member removed, owner cannot silently orphan group |
| Join link | See group and precise consent text, identify self, optionally connect calendar | Calendar connection optional; existing identity cannot be replaced by a typed name |
| Private day card | See interpreted ask, timezone, 2–3 options, attendees/unknowns, choose/copy draft | No slots, required requester unavailable, expired result, calendar data changed |
| Shared `/r/[share]` | See proposed options and counts, respond works/can't | Expired/revoked link, guest clearly labelled, votes saving/error, no one has answered |
| Lemme check | Show latest card and native menu, open chosen draft for manual sending | No active request, missing connection, unavailable endpoint; preserve draft for copying |

Use text labels in addition to colors; verify small-text contrast rather than assuming the brand purple is valid everywhere. Controls are keyboard reachable with visible focus, labelled status updates, and at least 44px touch targets. Test at 390px width. Bundle fonts for server image rendering; do not assume every browser CSS feature works in ImageResponse.

The private portrait PNG is 1080x1350. The public OG preview is option-only, in a landscape layout tested in Messages. A browser-readable option page must work if preview fetching fails. Link previews may remain cached: never imply that a previously shared preview can be remotely erased.

## 6. Backend contracts

### Authentication, identity, and permissions

Google's stable account subject identifies a connected user; typed names do not. Use secure HttpOnly SameSite cookies and CSRF/origin validation for cookie-authenticated writes. Check ownership/membership inside every service, not only in page navigation.

A Shortcut credential is a random 256-bit bearer token. Display it once, store only its digest, scope it to one user/device and Shortcut request/latest endpoints, rate-limit it, and allow revocation. A Venn ID alone is not authentication. Never put credentials in URLs.

For DM pairing, an authenticated owner obtains a short-lived random code and sends it to Venn. Bind their account to the sender/routing identity observed in the signed Photon delivery. Do not send results to an arbitrary phone in an incoming request. Preserve provider routing identifiers for managed/shared numbers; do not assume one global Venn number.

Invites and share links use independently generated random secrets with at least 128 bits of entropy. Persist digests, expiry, and revocation; rotate a share link without changing the private request ID. Public share grants can read sanitized options and submit guest votes, never read the private request record.

### Calendar permissions and coverage

Login uses `openid email profile`. The separate Calendar connection flow requests `calendar.events.freebusy` and `calendar.calendarlist.readonly` using their full Google scope URLs. The second scope reads calendar-list metadata, so consent wording must disclose that; it is not access to event titles. Confirm selected calendars' actual free/busy permissions in the live spike. Unsupported/inaccessible calendars are shown as excluded or unknown, never silently omitted from an "all clear" claim.

Enumerate calendar-list pages, let the user choose accessible calendars, then query all selected IDs. Query each person using their own grant. A calendar omitted from the response or carrying an error makes that person's status unknown. Do not request `calendar.readonly` to solve this by reading event details.

Request offline access; encrypt both access and refresh tokens in the server-side grant vault. Initial Google sign-in accounts do not carry Calendar grants. Handle token refresh under a per-grant lock, preserve an existing refresh token when Google returns none, and turn `invalid_grant` into reconnect required. Never return grants in session JSON or browser props.

On explicit Add, request incremental `calendar.events.owned` permission if missing, with state bound to the owner/request/action. If Google's consent is broader than creating one event, explain that accurately. Only insert into the owner's selected writable calendar, with no attendees and no invitation emails. Read availability again immediately before insertion.

### Normalized request contract

This is the intended application contract, with raw text present only at intake and model inference:

```ts
type Activity = 'lunch' | 'dinner' | 'coffee' | 'hangout' | 'other';
type Intent = {
  activity: Activity;
  localDate: string | null;
  durationMinutes: number;
  needsClarification: boolean;
  clarificationReason: 'date' | 'duration' | 'activity' | null;
};
type Intake = {
  text: string;
  receivedAt: string;
  groupId?: string;
  requesterMemberId?: string;
};
type Busy = { start: number; end: number };
type Availability = {
  memberId: string;
  state: 'known' | 'unknown';
  busy: Busy[];
};
type Candidate = {
  start: number;
  end: number;
  freeIds: string[];
  busyIds: string[];
  unknownIds: string[];
};
```

Validate Intake with Zod: UTF-8 body <= 8KB, text 1–2000 characters, ISO timestamp, bounded group/member IDs. The server supplies receipt time for forwarded messages and validates Shortcut times against a sensible skew. Resolve user identity from auth, never from JSON. Activity is an enum, not an unrestricted string that could retain the original message.

Gemini sees the message, receipt date/time, and organizer timezone. It does not receive contact lists, OAuth tokens, event names, or calendar busy intervals. Treat the text as data, use schema-constrained extraction, and validate date/duration after decoding. Configure a supported model through `GEMINI_MODEL`; choose and smoke-test it before recording the exact model in the spec.

Permit only 15–240 minute durations in 15-minute increments. Proposed defaults: coffee 30, lunch 60, dinner 90, hangout 60. Unknown activity without explicit duration asks a question. Vague dates ask a question. Never resolve a group or person's identity from model guesses.

For warm replies, start with small templates rendered from validated slots: `yes! i can do {option1} or {option2} if either works`. This preserves the supplied tone without a second model inventing times. If model-written wording is later enabled, it receives slot IDs/placeholders only, and final times are rendered by code. Personalized voice learning is outside this pilot.

### Relative dates, buffers, and ranking

Proposed defaults for approval: 15-minute gap from existing events, 15-minute candidate grid, 09:00–21:00 organizer-local planning window. Lunch prefers 11:00–14:00; dinner 17:00–21:00; coffee 09:00–17:00. Ask before widening the day or changing an explicit activity window. An explicit date remains that date even late at night; "today" uses receipt date in the organizer's zone, and an exhausted window gives no slots rather than rolling silently to tomorrow.

UTC milliseconds are used for comparison and persistence. Local day boundaries come from Luxon in the stored IANA timezone, not `new Date('YYYY-MM-DD')` or a fixed UTC offset. Nonexistent/ambiguous explicit wall times require clarification. Duration is elapsed minutes across DST transitions. Expand the query beyond the activity window by the buffer so just-outside conflicts are not missed.

Intervals are half-open `[start, end)`. Pad existing busy intervals once by the configured gap; do not also pad the candidate and accidentally double it. For every candidate, compute free/busy/unknown per member. Owner and requester must be known and free; optional unknowns stay visible and reduce the certainty of attendance.

Rank by number known-free descending, then activity preference distance ascending, then start time ascending. "Everyone" means every expected member is known-free, never only everyone who connected. Return at most three distinct, non-overlapping options. The counts include expected members without connected calendars as unknown.

### Storage model

| Record | Fields / invariant | Retention |
| --- | --- | --- |
| Auth.js User/Account/Session | Stable identity and login sessions; no Calendar grant tokens | Until account removal; sessions expire |
| CalendarGrant | userId unique, encrypted access/refresh, scope set, expiry, key version | Until disconnect/account delete |
| SelectedCalendar | grantId + calendarId unique, metadata needed for selection, enabled | Until deselected/disconnected |
| Group | id, ownerId, name, createdAt | Until owner deletes group |
| Membership | groupId + userId unique, display name, timezone, optional connected grant | Until leave/removal |
| InvitedPerson | owner-controlled expected participant label, groupId, optional claimed membership | Until claimed/deleted; no auth inferred from label |
| Invite | groupId, tokenDigest unique, expiresAt, revokedAt | 7-day proposed expiry; delete expired rows |
| DeviceToken | digest unique, ownerId, scope, expiresAt, revokedAt | 30-day proposed expiry; revoke anytime |
| PhoneLink | userId, verified provider sender/routing identity | Until unlink/account deletion |
| SchedulingRequest | ownerId, groupId, requesterId, normalized intent, state, slotVersion, expiry | 48h or sooner on delete |
| RequestParticipant | requestId + participantId unique; snapshot of expected people | Same as request; remove on access revocation |
| Slot | requestId + slotId unique, UTC start/end, private attendance status | Same as request |
| ShareGrant | tokenDigest unique, requestId, scope, expiry/revokedAt | At most request expiry |
| Vote | requestId + voterKey + slotId unique, choice works/cant | Same as request |
| ProcessedDelivery | owner/project + provider message ID unique; state/result reference, no message body | 7-day proposed dedupe window |
| EventAction | ownerId + requestId unique, selected slot/version, deterministic event ID, state | Retain receipt until deletion or explicit retention limit |

Membership for an unconnected friend is not fabricated from a phone string. Expected-participant snapshots are explicit so poll completion is well-defined even if the live group later changes. Disconnection invalidates affected active results and prevents future checks; historical public previews may already be cached externally.

Exclude raw incoming text, complete conversation history, calendar event titles/descriptions, full busy intervals, and provider payloads from persistent storage. Persist normalized slots/attendance only. Render a private timeline from in-memory busy data, or re-fetch it for the owner later. Do not durably cache that private image.

### API outcomes

All JSON errors use `{ error: { code, message }, requestId }`; logs contain only the correlation ID, route, error code, elapsed time, and non-sensitive counts. No request bodies, authorization headers, raw provider responses, or model text.

| Endpoint | Auth and success | Explicit failures |
| --- | --- | --- |
| `POST /api/requests` | Owner session -> 201 normalized result or clarification | 401, 403 group access, 413, 422 validation, 429, 503 provider unavailable |
| `POST /api/shortcut` | Scoped device bearer -> 201 result/clarification | Same failures; recipient cannot be supplied in body |
| `GET /api/shortcut/latest` | Scoped device bearer -> 200 owner latest | 404 no active request; no other user's request |
| `POST /api/webhooks/photon` | Adapter signature validation -> fast acknowledgement | Reject invalid/stale signature; dedupe verified deliveries before side effects |
| `POST /api/requests/[id]/select` | Owner + existing slot/version -> 200 draft | 403, 409 stale/cancelled result, 410 expired |
| `POST /api/requests/[id]/add` | Owner + explicit choice + write consent -> event receipt | 409 new conflict/version mismatch, reconnect/write consent required, 503 uncertain provider outcome |
| `GET /api/polls/[share]` | Valid scoped share token -> sanitized options/counts | 404 invalid token; 410 expired/revoked |
| `PUT /api/polls/[share]/votes` | Share token + member session or guest cookie -> upsert | 400 invalid choice, 409 obsolete slot version, 410, 429 |

Group/invite/credential mutations require an authenticated session, resource permission checks, and origin/CSRF protection. A share token never authorizes group administration. Request and poll lookups reject expired data on read even if cleanup has not yet deleted rows.

### Poll completion and event idempotency

Expected members authenticate with Google to cast identified votes. Guests may vote with a display name and opaque browser voter cookie; label their answers self-reported. Guest votes cannot claim an expected member's identity, change calendar facts, or satisfy "everyone answered." The UI reports member and guest counts separately.

Completion requires a works/can't response to every current option from every expected member in the request snapshot. Partial answers show progress. The winning slot must still satisfy required owner/requester constraints and ranks by member works votes, calendar attendance, then original slot order. If no viable candidate remains, say so rather than forcing a winner. Guests can inform the organizer but do not silently select a winner on behalf of members.

Use a transaction for vote upsert and a one-time completion transition per slot version. A normalized completion notification contains only the request reference, never the input message. Do not promise exactly-once external DM delivery; preserve uncertain delivery state.

Before adding an event: verify current ownership and consent, acquire the EventAction uniqueness guard, re-fetch required calendars, compare the selected slot/version, insert with a deterministic Google event ID derived from owner/request ID, and persist the receipt. On timeout, look up that same event ID before retrying. A retry cannot create a second event. Concurrency with unrelated calendar writers is still possible; Google free/busy and event creation are not one atomic transaction.

## 7. Reference implementation of the scheduling kernel

These are proposed code contents for the first application slice. They are included here for review; they have not been installed or executed as app code. The internal function accepts validated UTC inputs; parsing/timezone normalization belong in `windows.ts` and `intent.ts`.

`src/features/scheduling/rank.ts`:

```ts
export type Busy = { start: number; end: number };
export type Availability = {
  memberId: string;
  state: 'known' | 'unknown';
  busy: Busy[];
};
export type Candidate = {
  start: number;
  end: number;
  freeIds: string[];
  busyIds: string[];
  unknownIds: string[];
};
export type RankInput = {
  window: Busy;
  durationMs: number;
  stepMs: number;
  bufferMs: number;
  preferredStart: number;
  requiredIds: string[];
  members: Availability[];
};

export function rankSlots(input: RankInput): Candidate[] {
  const { window, durationMs, stepMs, bufferMs, preferredStart, members } = input;
  const numbers = [window.start, window.end, durationMs, stepMs, bufferMs, preferredStart];
  if (!numbers.every(Number.isFinite) || window.start >= window.end ||
      durationMs <= 0 || stepMs <= 0 || bufferMs < 0 ||
      window.end - window.start > 48 * 60 * 60 * 1000) {
    throw new RangeError('Invalid scheduling range');
  }
  const ids = new Set(members.map(member => member.memberId));
  if (ids.size !== members.length || input.requiredIds.length === 0 ||
      input.requiredIds.some(id => !ids.has(id))) {
    throw new RangeError('Invalid required participants');
  }
  for (const member of members) {
    for (const interval of member.busy) {
      if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) ||
          interval.start >= interval.end) throw new RangeError('Invalid busy interval');
    }
  }
  const required = new Set(input.requiredIds);
  const candidates: Candidate[] = [];
  for (let start = window.start; start + durationMs <= window.end; start += stepMs) {
    const end = start + durationMs;
    const candidate: Candidate = { start, end, freeIds: [], busyIds: [], unknownIds: [] };
    for (const member of members) {
      if (member.state === 'unknown') {
        candidate.unknownIds.push(member.memberId);
      } else if (member.busy.some(busy =>
        start < busy.end + bufferMs && end > busy.start - bufferMs)) {
        candidate.busyIds.push(member.memberId);
      } else {
        candidate.freeIds.push(member.memberId);
      }
    }
    if ([...required].every(id => candidate.freeIds.includes(id))) candidates.push(candidate);
  }
  candidates.sort((a, b) =>
    b.freeIds.length - a.freeIds.length ||
    Math.abs(a.start - preferredStart) - Math.abs(b.start - preferredStart) ||
    a.start - b.start);
  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    if (selected.every(slot => candidate.end <= slot.start || candidate.start >= slot.end)) {
      selected.push(candidate);
      if (selected.length === 3) break;
    }
  }
  return selected;
}
```

Move shared types to `types.ts` when other modules consume them; preserve one canonical definition. Intake validation bounds step to 15 minutes and group size to the pilot limit, preventing unbounded iteration from arbitrary API input.

`tests/unit/rank.test.ts` starts with actual boundary cases:

```ts
import { describe, expect, it } from 'vitest';
import { rankSlots, type Availability, type RankInput } from '../../src/features/scheduling/rank';

const minute = 60_000;
const hour = (value: number) => value * 60 * minute;
const owner: Availability = { memberId: 'owner', state: 'known', busy: [] };
const requester: Availability = { memberId: 'sam', state: 'known', busy: [] };
const base: RankInput = {
  window: { start: hour(11), end: hour(14) }, durationMs: hour(1),
  stepMs: 15 * minute, bufferMs: 15 * minute, preferredStart: hour(12),
  requiredIds: ['owner', 'sam'], members: [owner, requester],
};

describe('rankSlots', () => {
  it('requires the requester to be known', () => {
    expect(rankSlots({ ...base, members: [owner, { ...requester, state: 'unknown' }] })).toEqual([]);
  });
  it('permits exactly the configured gap without doubling it', () => {
    const slots = rankSlots({ ...base, window: { start: hour(12), end: hour(13) },
      members: [{ ...owner, busy: [{ start: hour(11), end: hour(11.75) }] }, requester] });
    expect(slots[0]?.start).toBe(hour(12));
  });
  it('rejects a busy requester even when others are free', () => {
    expect(rankSlots({ ...base, members: [owner,
      { ...requester, busy: [{ start: hour(10), end: hour(15) }] }] })).toEqual([]);
  });
  it('ranks everyone-free before a closer but partial slot', () => {
    const jordan: Availability = { memberId: 'jordan', state: 'known',
      busy: [{ start: hour(11.75), end: hour(12.5) }] };
    const slots = rankSlots({ ...base, members: [owner, requester, jordan] });
    expect(slots[0]?.freeIds).toHaveLength(3);
    expect(slots[0]?.start).toBe(hour(12.75));
  });
  it('keeps unknown people out of free counts', () => {
    const slots = rankSlots({ ...base, members: [owner, requester,
      { memberId: 'lee', state: 'unknown', busy: [] }] });
    expect(slots[0]?.freeIds).toHaveLength(2);
    expect(slots[0]?.unknownIds).toEqual(['lee']);
  });
  it('never returns overlapping alternatives or more than three', () => {
    const slots = rankSlots(base);
    expect(slots.length).toBeLessThanOrEqual(3);
    for (const [index, slot] of slots.entries()) {
      expect(slots.slice(index + 1).every(other =>
        slot.end <= other.start || slot.start >= other.end)).toBe(true);
    }
  });
});
```

Add tests for required owner busy, same owner/requester identity, overlapping calendars, all-day busy, exact end boundaries, malformed intervals, empty results, and timezone/DST normalization before connecting live providers. The model never replaces this kernel.

## 8. Ordered implementation slices

The future `devpost/checklist.md` will carry approved PRD/spec section references and exact slice labels. Do not generate invented approval or completion boxes now. Each slice below produces usable evidence; meaningful domain/API checks precede implementation, while cosmetic edits receive browser inspection rather than mirrored unit tests. The short substeps are work units, not completion-time promises.

### Slice 0 — agree on the boundary and prove platform feasibility

- [ ] Review this draft and `devpost/scope.md`; record accepted/rejected proposals. Complete PRD and spec in curriculum order without re-interviewing settled design choices.
- [ ] On the actual iPhone, create a test Message automation with selected sender and scheduling phrase. Record iOS version, lock state, run-immediately setting, message text availability, sender identity availability, and group versus DM results in `docs/research/phone-spike.md`. Use invented test texts, not private conversations.
- [ ] In Photon dashboard, confirm free project availability, actual routing identity, signing secret, and recipient pairing. Read current SDK routing before writing `smoke-photon.ts`; API names must come from the installed version.
- [ ] Decide the verified primary path: automatic intake if proved, otherwise explicit Shortcut/manual forwarding plus organizer result screen. Do not advertise automatic group detection without evidence.

**Pass:** A device evidence table and one chosen phone path; unmet platform assumptions are visible. The scheduler can be built independently, but release D cannot be called complete without a live phone path.

### Slice 1 — see the actual overlap algorithm on a phone-sized page

- [ ] In the existing checkout, scaffold Next.js without overwriting `plan.md`, `LICENSE`, installed skills, or docs. If the generator refuses a nonempty directory, generate in a temporary child directory and copy only reviewed application scaffold files. Choose TypeScript/App Router/Tailwind and Node runtime; commit exact dependencies.
- [ ] Add `rank.test.ts` above, run `npx vitest run tests/unit/rank.test.ts`, and observe import failure before creating `rank.ts`.
- [ ] Add the reference kernel and remaining boundary tests. Rerun; expect all assertions passing, including 12:00 allowed after an 11:45 end with 15-minute gap.
- [ ] Add a labelled fixture-only organizer screen with three named sample members and a busy toggle. Render slots from `rankSlots`; toggling a sample conflict changes the result. This is local development evidence, not the finished kernel demonstration.
- [ ] Use original tokens/fonts and accessible option rows. Inspect mobile width, empty state, and the “unknown” label.

**Files:** `package.json`, lockfile, Next/TS/test configs, `src/app/{layout.tsx,globals.css,app/page.tsx}`, scheduling types/rank, shared slot components, rank tests.

**Check:** `npm run typecheck` -> exit 0; focused Vitest -> all pass; `npm run dev` -> ready at `http://localhost:3000`; browser shows labelled sample results. Checkpoint commit: `Build visible group overlap with deterministic scheduling`.

### Slice 2 — connect your real Google calendars and change the result

- [ ] Add Prisma/Auth.js models and CalendarGrant/SelectedCalendar tables. Write permission and vault tests before connecting tokens; round-trip encryption and wrong-key rejection must pass.
- [ ] Implement Google login, separate Calendar connection with state/PKCE, server-only encrypted grants, calendar-list pagination/selection, token refresh, and reconnect state. Keep credentials out of Account/session serialization and logs.
- [ ] Implement `getAvailability(userId, window)` in `calendar/client.ts`: return known intervals only if every enabled calendar returns valid free/busy; otherwise return unknown with a safe reconnect/status code. Never return raw Google responses to the browser.
- [ ] Feed live owner availability and clearly labelled sample optional members into the same page. Use `scripts/smoke-calendar.ts` read-only: report calendar count, time range, and known/unknown status without printing IDs/tokens/events.
- [ ] Create or use a deliberate test calendar conflict, refresh, and observe the slot disappear. The learner verifies consent wording and reconnect behavior.

**Files:** auth routes/config, Prisma schema/migration/config, db/env, calendar feature, setup/connection UI, calendar and permissions tests, live smoke script.

**Check:** `npx prisma validate` -> valid schema; `npm run test:integration -- tests/integration/calendar.test.ts tests/integration/permissions.test.ts` -> pass; `npm run smoke:calendar` -> expected coverage and known status. Checkpoint: `Connect consented Google calendars without reading event details`.

### Slice 3 — a friend joins and the live group kernel works

- [ ] Add Group/Membership/InvitedPerson/Invite constraints and group/invite services. Start with tests: unauthorized group read/write -> 403; duplicate join -> one membership; expired invite -> 410.
- [ ] Implement create/invite/join/leave routes and mobile pages. Invite redemption checks group state and binds Google identity. A person can join without connecting Calendar and remains unknown.
- [ ] In request intake, choose group/requester explicitly until a verified sender mapping exists. Reject nonmembers or unresolved requester identity; do not guess from names.
- [ ] Fetch all connected members with bounded parallelism (at most four in flight), calculate live overlap, render everyone/partial/unknown counts, and show checked-at time and selected-calendar coverage.
- [ ] Have two or three consenting accounts connect. Change one real conflict and re-run the same request. This is the first full proof of Venn's distinctive kernel.

**Files:** group/invite routes/pages, identity permissions, groups service, requests service, relations/migrations, integration request/permission tests.

**Check:** focused integration suite -> passes required-user and partial-failure cases; actual phones show changed real overlap. Checkpoint: `Find live overlap across an invited friend group`.

### Slice 4 — interpret a real ask and choose a warm reply

- [ ] Define the structured Intent schema and tests for explicit lunch tomorrow, vague day, no scheduling intent, model refusal/timeout, out-of-range duration, malformed output, and text containing instructions to ignore the schema.
- [ ] Implement `parseIntent(text, receivedAt, zone)` using the installed Google GenAI SDK's supported structured-output interface. Semantic validation produces a typed clarification rather than a fabricated date.
- [ ] Implement `resolveWindow(intent, receivedAt, zone)` in `windows.ts`, with tests for New York/London date differences, midnight receipts, spring-forward gaps, fall-back ambiguity, and activity-window exhaustion.
- [ ] Implement `createRequest(ownerId, intake)` around the already-working group/calendar/rank services. Store only normalized intent, expected participants, slots and expiry. Implement warm template drafts from selected slot IDs.
- [ ] Render the private 1080x1350 card plus an accessible HTML equivalent. Choose/copy a draft and cancel a request. Inspect logs/database to verify original text was not retained.

**Files:** intent/windows/draft, requests state/service/routes, card renderer/private UI, unit intent/windows and integration request tests.

**Check:** `npx vitest run tests/unit tests/integration/requests.test.ts` -> pass; live ask -> correct interpreted date/duration and real slots; deliberately vague ask -> clarification. Checkpoint: `Turn scheduling texts into live options and manual-send drafts`.

### Slice 5 — receive the result through a verified phone path

- [ ] Add device-token issuance/revocation and phone pairing. Tests reject a Venn ID without bearer auth, spoofed owner/recipient, invalid/stale webhook signatures, repeated delivery, and another owner's request IDs.
- [ ] Wire the Photon cloud adapter with Postgres state and a payload-safe logger. Use the adapter for its documented signature verification rather than reimplementing its signing format.
- [ ] Audit the pinned Chat SDK/adapter for history, automatic caches, deduplication, concurrency queues, and logger defaults. Do not use history APIs or durable raw-message queue/debounce. Run a unique synthetic-message canary and inspect app/SDK tables and logs for it. If raw text is persisted automatically, configure it off or change the adapter boundary before claiming the no-message-storage promise.
- [ ] Implement bounded processing with serverless lifecycle support. Acknowledge only according to adapter semantics; persist normalized outcomes and delivery IDs, never raw-message jobs. A crash before normalization requires user resend. No promise of durable processing is made for this pilot.
- [ ] Write the exact manual Shortcut recipe in `docs/shortcuts.md`: text/dictionary input -> scoped HTTPS POST -> show returned card/menu -> choose draft -> copy/open compose with explicit user action. Derive the recipient from the user's action/verified routing, never from model output. Do not put Send Message in an unattended automation.
- [ ] Exercise the chosen path from slice 0. If automatic intake works, add it around this same manual action. If it does not, demonstrate the explicit action and label the limitation.

**Files:** device/phone routes/features, bot/delivery/webhook, Shortcut endpoints, state migration script, Photon integration tests, Shortcut instructions.

**Check:** `npm run test:integration -- tests/integration/photon.test.ts tests/integration/permissions.test.ts` -> pass; `npm run smoke:photon` -> a deliberate DM reaches only the paired organizer; real Shortcut/forwarded ask -> card and manual-send draft. Checkpoint: `Deliver private scheduling help through the verified phone flow`.

**Release D gate:** real live group overlap, phone delivery, visible interpretation, no automatic friend message, no raw text in persistence, unknown calendar case, learner hands-on check. A recording of this functioning journey supports the hackathon milestone.

### Slice 6 — share options and collect honest votes

- [ ] Add ShareGrant/RequestParticipant/Vote models and uniqueness constraints. First test expiry, unauthorized member impersonation, vote update without double count, concurrent upserts, member/guest separation, and incomplete expected roster.
- [ ] Implement `/r/[share]` and sanitized poll GET/PUT routes. Member votes use the signed-in identity; guest votes use a scoped opaque cookie and display name without claiming roster identity. Rate-limit writes and validate origin.
- [ ] Implement option-only OG preview using the same slot view model. The owner shares this link deliberately. Never expose the private timeline through metadata, card URLs, props, or API JSON.
- [ ] Implement completion and winner semantics from section 6 under a transaction. Notify the paired organizer only once per completion transition; record failed/uncertain send state separately.
- [ ] Poll updated counts at a modest five-second interval only while visible, or refresh on focus. No realtime subscription service is required for a tiny group.

**Files:** poll/share relations, service/routes/page/metadata, vote UI, integration polls/permissions tests.

**Check:** `npx vitest run tests/integration/polls.test.ts tests/integration/permissions.test.ts` -> pass; two member browsers and one guest update counts without a sign-in requirement for the guest; guest cannot trigger “everyone answered.” Checkpoint: `Let friends respond to scoped group options`.

### Slice 7 — deliberately add the chosen event once

- [ ] Add EventAction with uniqueness on owner/request and deterministic Google-compatible event ID. Test two concurrent Add calls and a provider timeout after a successful insert.
- [ ] Implement incremental owner write consent with the normalized pending action in OAuth state. Returning from consent does not auto-send messages; show the selected event details and require explicit Add confirmation.
- [ ] Re-fetch required calendars before insert. New conflict -> 409 with refresh options. No conflict -> insert into owner's chosen writable calendar, no attendees, no friend invitations.
- [ ] On timeout, reconcile by deterministic event ID before retry. If an event ID already exists, verify it matches the intended action before returning a receipt.

**Files:** calendar OAuth/client, EventAction model, add route, owner selected-state UI, calendar integration tests.

**Check:** calendar integration tests -> pass; one deliberate live Add creates one owner event; repeated tap/callback creates no second event; declining write permission leaves the draft usable. Checkpoint: `Save the chosen owner event with conflict checks and idempotency`.

### Slice 8 — make repeated daily use recoverable

- [ ] Add multi-group disambiguation: shared requester in two groups -> `needs_group`; owner selects without the model guessing. Use normalized request fields only; if missing parsing context was discarded, request explicit input again.
- [ ] Add `/api/shortcut/latest` and the Lemme check recipe for latest unexpired request. Document Siri/Back Tap setup and the manual automation creation separately; only claim a shareable iCloud Shortcut once it has been created and tested on-device.
- [ ] Add token revoke, Google disconnect, leave, account deletion, and group deletion. Disconnection clears grants/selected calendars, invalidates affected active results, and blocks further provider calls. Members can remove their data without removing other people's accounts.
- [ ] Add `purge-expired.ts` and a maintenance endpoint guarded by `CRON_SECRET`; configure a daily cleanup invocation for the approved Vercel deployment. Check expiry on every read regardless of cleanup timing. Purge requests/slots/votes/share grants and expired credentials/dedupe rows. No cleanup job stores or reconstructs texts.
- [ ] Handle provider timeouts with bounded retries: reads may retry once with jitter; writes reconcile first; unknown data remains unknown; outbound ambiguity remains visible. Never attach raw payloads to exceptions/telemetry.

**Files:** affected group/calendar/identity/request services and routes, latest Shortcut path, cleanup script, recovery UI, integration cases.

**Check:** integration suite -> pass revoke/expiry/stale-slot/disambiguation cases; a friend can reconnect and use it on another day; explicit revoke prevents subsequent calendar calls. Checkpoint: `Support repeated use, clarification, reconnect, and revocation`.

### Slice 9 — verify the pilot and prepare the hackathon handoff

- [ ] Configure scripts: `typecheck` = `tsc --noEmit`; `lint` = `eslint .`; `test:unit` = `vitest run tests/unit`; `test:integration` = `vitest run tests/integration`; `test:e2e` = `playwright test`; `smoke:calendar` = `tsx scripts/smoke-calendar.ts`; `smoke:photon` = `tsx scripts/smoke-photon.ts`; `purge:expired` = `tsx scripts/purge-expired.ts`.
- [ ] Add browser checks for consent refusal, group join, real rendered option selection, guest votes, stale result, and no slots. Use deterministic provider stubs in CI; external live checks remain explicit and separate.
- [ ] Run typecheck/lint/unit/integration/build plus one mobile browser journey. Verify a fresh-clone setup from README using secret-free `.env.example`. Inspect intended files/history for secrets before any publication.
- [ ] Deploy the same app to HTTPS for the live flow after the learner selects hosting/account setup. Configure exact Google redirect URLs and Photon callback URL per environment; register only test users/paired recipients in the pilot. Verify production callback URLs, not localhost assumptions.
- [ ] Have the learner try the full core loop, resolve feedback, and explicitly confirm the final behavior. Record actual findings and revisions in the curriculum checklist.
- [ ] Generate `devpost/app-map.html` from the finished code, showing request -> parser -> calendar -> rank -> response. Give a brief project-grounded tour or learning wrap-up aligned with the learner's end-to-end goal; do not fabricate a completed learning activity.
- [ ] Prepare technical recording steps and verify video/public repo accessibility. The learner supplies narration and submission answers. Check the actual event form for exact video constraints and deadline before submission.

**Check:** `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run build`, `npm run test:e2e` -> exit 0; live phone checks and learner feedback recorded separately. Checkpoint: `Verify the daily-use pilot and document its real boundaries`.

**Release P gate:** all D requirements plus member/guest vote boundaries, explicit one-time Add, reconnect/revoke/delete, expiry, multi-group handling, duplicate-safe side effects, a repeat-day trial, resolved learner feedback, and finished app map. Public rollout remains a separate decision after pilot evidence.

## 9. Configuration and operating limits

Plan these server-only variables in `.env.example`: `DATABASE_URL`, migration connection configuration required by the chosen Prisma release, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `IMESSAGE_LOCAL=false`, `IMESSAGE_PROJECT_ID`, `IMESSAGE_PROJECT_SECRET`, `IMESSAGE_WEBHOOK_SECRET`, and `APP_BASE_URL`. The Calendar OAuth flow may reuse the same Google client registration while retaining separate routes/state/scopes. None of these secrets goes in a `NEXT_PUBLIC_` variable.

Add `CRON_SECRET` when enabling deployed cleanup. Logical expiry blocks reads at 48 hours; daily physical cleanup may lag by up to another 24 hours under normal operation. Failed cleanup is monitored and retried. Provider backups have their own lifecycle. Do not describe this as guaranteed erasure at exactly 48 hours.

Create accounts/consent configuration in Google Cloud, Photon, Neon, and Vercel using their normal authenticated setup. Do not ask the learner to paste secrets in chat. Stay within chosen free allowances; model API use and provider limits must be checked in the actual accounts. This document authorizes no purchase.

Pilot bounds proposed: at most 10 connected users, groups at most 10 expected people, one calendar account per person, one-day request windows, three options, 2,000-character asks. Apply per-owner/device/IP rate limits and a model-spend budget. Choose timeout limits from the measured provider smoke checks and the actual Vercel runtime limit; do not rely on detached background promises surviving function termination.

For privacy-safe operations, collect request counts, latency buckets, connection failure codes, clarification/no-slot frequency, and delivery states. Exclude message contents, calendar IDs, phone numbers, event text, and generated drafts from telemetry. Audit third-party SDK logging defaults and database query logs before the pilot.

Data deletion is application-side removal and revocation; hosting/provider backups and previously fetched link previews have separate lifecycles. Describe this honestly in consent/privacy copy.

## 10. Coverage and acceptance matrix

| Original requirement | Owning slices | Acceptance evidence |
| --- | --- | --- |
| Group overlap / requester first | 1–4 | Real conflict changes result; required owner/requester busy/unknown blocks option |
| Multiple calendars | 2–3 | Two enabled calendars both affect availability; one failed response yields unknown |
| Message awareness / no screenshots | 0, 4–5 | Verified Shortcut or forwarding path; no screenshot ingestion; no raw persistence |
| Lemme check | 5, 8 | Device retrieves latest owner result, menu opens an editable draft |
| Activity-sized slots | 1, 4 | Validated duration/date drive deterministic window and candidate sizes |
| Breathing room | 1, 4 | Exact buffer boundary and outside-window conflict tests |
| Warm replies | 4–5 | Friendly draft contains only times from selected valid slots |
| User control / add / no | 4–5, 7 | Selection/cancel affect only active owner request; Add is explicit, owner-only |
| Visual availability | 4–6 | Private card readable on phone; public preview reveals only options |
| Join, votes, unknowns | 3, 6 | Unconnected member stays unknown; guest can vote without impersonation |
| Timezones / multiple groups | 4, 8 | Zoned-date and DST tests; ambiguous group asks instead of choosing |
| Privacy / revoke / provider errors | 2, 5, 8–9 | Retention canary, access tests, reconnect and deletion checks |
| Real daily usefulness | 8–9 | Repeat-day small-group use and learner-reported friction resolved |
| Devpost curriculum | Planning through 9 | Approved artifacts, verified slices, hands-on feedback, app map, video, human-authored submission |

## 11. Decisions for the review

Already supplied by the learner/product plan: Venn's group-overlap purpose; iPhone/no Mac; Google first; original palette/type/voice; privacy around event details; manual send; desire for an end-to-end app with repeat daily use; plan-first familiarity.

Recommended but not yet approved: release D/P boundary; private request screen as integration surface; Postgres in place of optional KV storage; 15-minute buffers; organizer/requester availability as a hard constraint; owner-only event creation; template warm replies initially; separate private/public cards; verified-member versus guest voting semantics.

Still needing real evidence: iPhone group automation input/behavior; Photon account provisioning/routing/retention; selected-calendar scope coverage; actual OAuth app verification requirements for broader release; exact dependency compatibility; actual event deadline/submission form; measured provider latency and costs. These are explicit investigation tasks, not assumed working integrations.

Approve the scope/design before scaffolding the app. Carry accepted decisions into `devpost/prd.md` and `devpost/spec.md` in order, then generate the build checklist and execute verified slices. Do not require a second approval of the same displayed content.

## 12. Primary references

- [Original Venn product plan](../../plan.md)
- [Platform checks and qualifications](../research/2026-10-24-platform-checks.md)
- [Devpost Learn curriculum](https://github.com/challengepost/learn-ai-basics)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Auth.js Google provider](https://authjs.dev/getting-started/providers/google)
- [Auth.js Prisma adapter](https://authjs.dev/getting-started/adapters/prisma)
- [Auth.js refresh handling](https://authjs.dev/guides/refresh-token-rotation)
- [Prisma documentation](https://www.prisma.io/docs)
- [Neon documentation](https://neon.com/docs)
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google freeBusy API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Luxon API](https://moment.github.io/luxon/api-docs/index.html)
- [Photon adapter](https://chat-sdk.dev/adapters/vendor-official/photon)
- [Chat SDK Postgres state](https://chat-sdk.dev/adapters/official/postgres)
- [Photon pricing](https://photon.codes/pricing)
- [Apple communication triggers](https://support.apple.com/guide/shortcuts/apdd711f9dff/ios)
- [Next.js ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response)
- [Vitest](https://vitest.dev/guide/)
- [Playwright](https://playwright.dev/docs/intro)
