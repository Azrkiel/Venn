---
doc: spec
status: approved
approval_basis: extracted from the learner-approved engineering roadmap without new stack or scope decisions
---

# Venn — Technical specification

## How This Works, In Plain Language

A phone action or private page sends the organizer's scheduling ask to one small web application. It interprets the ask, reads only availability from consenting calendars, and calculates shared options. The organizer chooses what to share or save. Identity, group membership, consent and votes live in a database; raw asks do not.

## The Core Journey Through the System

Implements `prd.md > The Core Journey`. Intake authenticates the organizer, resolves the group/requester, interprets the ask, converts the local window to UTC, fetches each member's selected calendars, ranks buffered windows, and persists a normalized result. Private/public views enforce different data boundaries. Selection, votes and calendar writes use existing slot IDs and version checks.

The complete approved ASCII flow, annotated file tree, contracts, schemas and ordered slices are in [the implementation plan](../docs/plans/2026-10-24-venn-implementation.md). That document is incorporated into this spec; do not duplicate it into divergent contracts.

## Stack

TypeScript, Next.js App Router/React/Tailwind; Auth.js/Prisma; Postgres; Google Calendar API; Anthropic SDK structured extraction; Luxon; Photon through Chat SDK; next/og cards; Vitest/Playwright; Vercel. Exact installed versions are recorded in package-lock.json as the scaffold is verified. Primary documentation links are in the roadmap's references.

## Components

### Scheduling core

Implements `prd.md > Group overlap` and `prd.md > Requests and replies`. Pure interval math receives validated UTC ranges; required members must be known-free. Relative dates use explicit IANA zones, with ambiguity surfaced as clarification. Claude output passes semantic validation; it never supplies authentication or free/busy facts.

### Identity and calendar connections

Implements `prd.md > Connections and groups`. Auth.js Google identity and server sessions; separate incremental Calendar consent; encrypted server-side grants; selected-calendar coverage; refresh locking; explicit disconnect. No Calendar grant appears in browser props or session JSON.

### Request service and views

Implements `prd.md > Requests and replies` and `prd.md > Cards and sharing`. One service accepts web, Shortcut and signed-message intake. Normalized results have an owner, expected participants, slot IDs, version and expiry. Private owner view, sanitized share view and card renderer consume explicit view models.

### Groups, polls and explicit event writes

Implements `prd.md > Votes and event creation`. Relational unique constraints and transactions prevent duplicate member/vote/action records. Self-reported guest answers do not impersonate members. Calendar Add uses owner consent, fresh availability and a deterministic provider event ID.

### Phone transport

Implements `prd.md > Requests and replies`. Scoped device credentials for Shortcuts; verified owner-to-DM pairing; cloud Photon adapter and persistent Postgres bot state. Signed webhook validation, dedupe, payload-safe logging and retention audit are required before live readiness. No friend recipient is supplied by model output or arbitrary JSON.

## File Structure

Use section 1 of the approved roadmap. Keep feature logic outside route handlers and UI components. Tests live under `tests/unit`, `tests/integration`, and `tests/e2e`.

## Data Model

Use the roadmap's storage table and invariants. Auth identity/session, encrypted Calendar grants, selected calendars, groups/membership/invites, scoped device/phone links, normalized requests/slots/participants/shares, votes, processed delivery IDs and explicit EventAction receipts. Request expiry is enforced on read; physical cleanup is separate. Raw incoming asks, conversation history and full calendar event data have no persistence model.

## Look and Feel

Implements `prd.md > Look and Feel`. Use the supplied palette and type. Shared slot/avatar components keep private UI, public options and image cards consistent. Text accompanies colors and images; controls are touch-friendly and keyboard accessible.

## Where It Runs and How Someone Tries It

After scaffold: `npm install`, copy secret-free `.env.example` to `.env.local`, then `npm run dev` and open http://localhost:3000. Explicit sample mode works without provider credentials and is always labelled. Live mode requires configured Postgres, Google OAuth, and model credentials. Remote phone callbacks require an approved HTTPS deployment or test endpoint. Run migrations and generate the client using the documented package scripts before live use.

The curriculum requires an accessible video and public repository, not a deployment. Venn's remote callback feature itself needs HTTPS. No live integration is claimed until its smoke check and actual device use succeed.

## External Services and Dependencies

Google Cloud OAuth/Calendar, Anthropic, Photon, Neon/Postgres and Vercel account configuration is not present yet. Never request secrets in chat. Document variable names in `.env.example`, test substitutes in CI, and actual integration evidence separately.

## Failure Modes

Invalid token: reject before provider calls. Ambiguous ask/group/requester: clarify. Failed selected calendar: unknown. Required member unknown: no fabricated options. Model timeout: retry visibly. Stale slot: reject/refresh. Provider write timeout: reconcile deterministic event ID. Delivery timeout: uncertain state, no false exactly-once claim. Missing configuration: setup instructions and explicit sample mode, no hidden live fallback.

## Decisions and Open Issues

Scope/stack/build order were approved with "yea, looks great, continue". Main uncertainty to investigate: whether the real iPhone automation supplies usable group message text/sender identity and whether Photon provisioned routing works. Record actual evidence, not documentation assumptions. Missing secrets/device access do not justify replacing the approved calendar kernel with a claimed live mock.
