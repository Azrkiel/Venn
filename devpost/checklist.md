---
doc: checklist
status: approved
approval_basis: build order approved in the displayed implementation plan
---

# Build Checklist

Build mode: fast — explicitly selected by the learner ("first one"); concise updates, early feedback and final review remain required.

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

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — trace one real request through the implementation
- [ ] Optional edit and transfer reflection addressed
- [ ] `devpost/app-map.html` generated, checked and shown

Activity and evidence: A static reference map is prepared at `devpost/app-map.html`; the guided learner activity and final hands-on feedback remain pending.
Route and stops: Reference route follows `AvailabilityVoting.save` → availability `PUT` route → `saveAvailability` / `view` / `aggregateAvailability`. This route has not been toured with the learner.
Edit outcome: No learner edit offered or recorded in this documentation pass.
Reflection: Not offered in this documentation pass.
Activity mode: Static reference prepared; no hands-on learning completion inferred.

## Revisions

- The learner approved the existing scope, stack and ordered build with "yea, looks great, continue"; PRD/spec/checklist extract that same approved content without another sign-off.
- External credentials and iPhone access are not yet established. Build code and labelled sample exploration may proceed; no live milestone can be marked complete without its actual evidence.

- The learner explicitly selected Gemini API keys instead of the originally proposed Claude. The intent adapter and environment use @google/genai with stateless structured output.

- 2026-10-24: the learner decided to build both modes. Solo "just me" requests are the default everyday path (organizer calendar only; forwarded iMessage asks are answered immediately), and group overlap is the upgrade. No boxes ticked for this.

- 2026-10-24: slider-card clarification from the learner: the creator chooses the Venn's planning scale from options, according to the activity. Examples include lunch today, lunch this or next week, a beach outing across a month, and travel across a year. This supersedes the handoff's one-day-only slider scope.
- 2026-10-24: each Venn needs a unique, group-specific ID/join link. Joiners enter a name they identify by. Everyone who joins can see live overlap; participants can choose to see other respondents' names after submitting their own answer. This revises the old counts-only identity rule for respondents; it does not authorize exposing connected calendar identities or private calendar timelines.
- 2026-10-24: day availability supports pressing and dragging across available times on phones and laptops. Month, multi-month, and year availability supports selecting and dragging across whole dates; exact times are decided nearer the event. People can change their selections as availability changes.
- 2026-10-24: the creator chooses when the poll closes and can close it early. The existing fixed 48-hour request/share expiry and expiry-based deletion must be revisited to support longer planning periods. No implementation or verification boxes ticked for these decisions.
- 2026-10-24: the learner confirmed weekly Venns collect both dates and times, up to two weeks; use the month view for three weeks. After answering, show a section such as “Love using Venn? Make your own Venn” linking to signup. The learner approved the rest of the proposed direction with “everything else is good to go”.
- Implementation decision: open-link availability Venns send the organizer a summary when the creator's deadline or early close ends voting. Without a fixed invitee roster, the app must not claim every intended guest has answered. Existing calendar-option polls remain supported separately.
- 2026-10-24: availability Venn implementation verified locally on `feat/availability-card`: 178 Vitest tests, 34 guest/legacy/preview browser checks and two authenticated creator checks passed; typecheck, lint and production build passed. Both desktop and 390px mobile covered. See `docs/plans/2026-10-24-availability-card.md` for evidence and live-only checks still outstanding. These results do not mark the original live/device learner milestones complete.
- 2026-10-24 trial feedback: the learner requested a separate Outlook-style weekly calendar with days across columns, a vertical time axis, and dark-blue selections dragged in 15-minute increments. Apply to weekly/two-week Venns; keep independent availability on different dates and support phones/laptops. References are the learner's two Outlook screenshots.
- 2026-10-24 further feedback: month/multi-month Venns include the whole final calendar month (November 23 becomes November 30). Add optional signup/calendar sync so voters can privately cross-reference calendar busy times while dragging. Guest responses remain available. Existing Google free/busy integration is the initial adapter; other provider preferences are being clarified.
- 2026-10-24 revised trial build verified: dedicated Outlook-style weekly/two-week calendar, full final-month selection, optional viewer-private Google busy reference, safe signup/consent return and unsaved draft restoration. 212 tests and 50 desktop/mobile browser journeys passed; typecheck, lint and production build passed. `docs/plans/2026-10-24-week-calendar.md` records evidence and live calendar checks still outstanding. No production deploy or original learner milestone sign-off inferred.
- 2026-10-24 UX feedback: keep explanations light, remove repeated guidance, and make interactions feel deliberate with clear pressed/selected/pending/success feedback and a little motion. Keep dragging steady and respect reduced-motion preferences. Work recorded in `docs/plans/2026-10-24-ui-polish.md`.
- 2026-10-25: UI polish finished and verified locally (`docs/plans/2026-10-24-ui-polish.md`): lighter copy, press/rebound feedback with reduced-motion support, confirmed save and copy states. 212 tests, 58 guest browser journeys and the creator suite passed; typecheck, lint and build passed. No deploy and no learner milestone sign-off inferred.
- 2026-10-25 readiness documentation: README now distinguishes the group-availability home flow from the separate calendar planner and historical provider use from current release evidence. `docs/demo.md` supplies a reproducible technical walkthrough; `docs/phone-spike.md` records outstanding physical-device checks; `docs/shortcuts.md` matches the implemented solo-DM and newest-request command behavior. `devpost/app-map.html` provides a code-grounded reference route. No original learner, submission, phone or calendar-write milestone is marked complete by these documents.
