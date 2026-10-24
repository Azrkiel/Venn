---
doc: checklist
status: approved
approval_basis: build order approved in the displayed implementation plan
---

# Build Checklist

Build mode: fast ? explicitly selected by the learner ("first one"); concise updates, early feedback and final review remain required.

## Slices

- [ ] **1. Try the group-overlap core on a phone-sized page**
  Becomes usable: Try the group-overlap core on a phone-sized page.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Group overlap`
  Spec ref: `spec.md > Scheduling core`
  Build: Scaffold Next.js, add failing interval tests, implement rankSlots and render clearly labelled sample-calendar options.
  Verify (mechanical): npm run typecheck; npm run test:unit; npm run build; open mobile viewport
  Learner check: Toggle a sample conflict and confirm the available options change.
  Commit: `Build visible group overlap with deterministic scheduling`

- [ ] **2. Connect real Google calendars**
  Becomes usable: Connect real Google calendars.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Connections and groups`
  Spec ref: `spec.md > Identity and calendar connections`
  Build: Add Postgres/Auth.js, encrypted grants, separate Calendar OAuth, selected calendars, refresh and unknown-on-failure behavior.
  Verify (mechanical): Prisma schema validation; calendar/permission tests; read-only live smoke when configured
  Learner check: Connect a test calendar and confirm a real conflict changes an option.
  Commit: `Connect consented Google calendars without reading event details`

- [ ] **3. Find live overlap for an invited group**
  Becomes usable: Find live overlap for an invited group.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Group overlap`
  Spec ref: `spec.md > Groups, polls and explicit event writes`
  Build: Implement authenticated group creation, scoped invites, join/leave and request orchestration across connected members.
  Verify (mechanical): Group/request permission tests and live multi-account check when configured
  Learner check: Invite a friend and compare a real shared window.
  Commit: `Find live overlap across an invited friend group`

- [ ] **4. Interpret an ask and choose a warm reply**
  Becomes usable: Interpret an ask and choose a warm reply.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Requests and replies`
  Spec ref: `spec.md > Scheduling core`
  Build: Add structured Gemini parsing, semantic validation, zoned windows, normalized requests, warm drafts and private cards.
  Verify (mechanical): Intent/windows/request tests; inspect rendered card and retained records
  Learner check: Enter lunch tomorrow, choose an option, and copy the reply.
  Commit: `Turn scheduling texts into live options and manual-send drafts`

- [ ] **5. Use a verified phone path**
  Becomes usable: Use a verified phone path.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Requests and replies`
  Spec ref: `spec.md > Phone transport`
  Build: Implement scoped device credentials, pairing, signed Photon intake, safe delivery, retention canary and Shortcut recipe.
  Verify (mechanical): Signature/replay/routing tests; live Photon and actual phone checks when available
  Learner check: Run the Shortcut or forward a test ask and choose the reply yourself.
  Commit: `Deliver private scheduling help through the verified phone flow`

- [ ] **6. Share options and collect honest votes**
  Becomes usable: Share options and collect honest votes.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Votes and event creation`
  Spec ref: `spec.md > Groups, polls and explicit event writes`
  Build: Implement scoped option-only public cards/pages, identified-member and guest votes, updates and completion rules.
  Verify (mechanical): Poll concurrency/access tests; multi-browser vote journey
  Learner check: Open a share link as a guest and respond without connecting a calendar.
  Commit: `Let friends respond to scoped group options`

- [ ] **7. Add the chosen event once**
  Becomes usable: Add the chosen event once.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Votes and event creation`
  Spec ref: `spec.md > Groups, polls and explicit event writes`
  Build: Implement incremental write consent, fresh conflict check and deterministic event identity/reconciliation.
  Verify (mechanical): Conflict/concurrent-add/timeout tests; deliberate live owner-only write when configured
  Learner check: Confirm one event is created after Add and a repeated tap creates no duplicate.
  Commit: `Save the chosen owner event with conflict checks and idempotency`

- [ ] **8. Repeat the flow and recover safely**
  Becomes usable: Repeat the flow and recover safely.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > Connections and groups`
  Spec ref: `spec.md > Identity and calendar connections`
  Build: Add multi-group clarification, latest Shortcut result, reconnect/revoke/delete, expiry cleanup and bounded provider retries.
  Verify (mechanical): Recovery/expiry/disambiguation tests and repeat-day live use when available
  Learner check: Revoke Calendar access and verify Venn asks you to reconnect.
  Commit: `Support repeated use, clarification, reconnect, and revocation`

- [ ] **9. Verify the pilot and prepare the learning handoff**
  Becomes usable: Verify the pilot and prepare the learning handoff.
  Why now: Follows the approved dependency order and keeps the overlap kernel early.
  PRD ref: `prd.md > The Core Journey`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`
  Build: Run mechanical and browser checks; resolve learner feedback; document configuration/device evidence; generate code-grounded app map.
  Verify (mechanical): npm run verify; npm run test:e2e; actual live smoke checks kept separate
  Learner check: Try the full flow and report confusing or broken behavior.
  Commit: `Verify the daily-use pilot and document its real boundaries`

## Hands-on Checkpoints

- [ ] Early usable behavior explored after the first visible overlap slice
- [ ] Integrated live core explored after real provider/device setup
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete ? feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete ? trace one real request through the implementation
- [ ] Optional edit and transfer reflection addressed
- [ ] `devpost/app-map.html` generated, checked and shown

Activity and evidence: Not performed yet.
Route and stops: Recorded after implementation.
Edit outcome: Not offered yet.
Reflection: Not offered yet.
Activity mode: Pending actual build and learner feedback.

## Revisions

- The learner approved the existing scope, stack and ordered build with "yea, looks great, continue"; PRD/spec/checklist extract that same approved content without another sign-off.
- External credentials and iPhone access are not yet established. Build code and labelled sample exploration may proceed; no live milestone can be marked complete without its actual evidence.

- The learner explicitly selected Gemini API keys instead of the originally proposed Claude. The intent adapter and environment use @google/genai with stateless structured output.
