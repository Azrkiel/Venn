# Outlook-style weekly availability

Goal: replace the weekly date-picker/tiles with a dedicated seven-column calendar supporting independent 15-minute availability ranges on each date, following the user's Outlook screenshots.

Architecture: render the existing server-provided quarter-hour buckets through a new client-only weekly calendar. Selection remains a set of ISO bucket starts and uses the existing save/API/privacy/closure behavior. Keep day and long-span calendar views intact.

Tech stack: existing Next.js/React, CSS modules, Luxon, TypeScript, Vitest and Playwright.

```text
Server buckets + viewer timezone -> clock rows x local date columns
  -> pointer/keyboard selection -> selected bucket starts
  -> existing range merger -> existing availability PUT
  -> saved response + live counts -> weekly calendar

Week navigation -> visible seven-date page; hidden selections persist
Phone header pan/arrows + time-gutter scroll -> internal viewport
Outside window / skipped clock hour -> disabled cell
Closed poll -> readable grid; no selection writes
```

## File responsibilities and contract

- `src/app/r/[share]/weekly-calendar.tsx`, `weekly-calendar.module.css`: toolbar, week navigation, seven date columns, sticky time axis, quarter-hour cells, solid navy contiguous selection, touch/mouse painting, keyboard access and internal mobile scrolling. Export default `WeeklyCalendar({cells, buckets, selected, onChange, timezone, disabled})`; `cells: {start:string,end:string}[]`, `buckets: {start:string,end:string,count:number}[]`, `selected: Set<string>`, `onChange: (next:Set<string>)=>void`, `timezone:string`, `disabled:boolean`.
- `src/app/r/[share]/week-selection.ts`: pure grid alignment and rectangular painting, including DST gaps/repeated-hour offsets; tests in `tests/unit/week-selection.test.ts`.
- `availability-voting.tsx`: weekly/fortnight branch, keep date/time entry as an optional alternative, retain dirty-state/save/name/CTA/closure logic and existing day/month views.
- `page.tsx`: widen only weekly/fortnight shared pages for a useful seven-column desktop layout.
- `tests/e2e/availability.spec.ts`: actual touch/mouse quarter-hour drag on two distinct dates, disjoint ranges rather than overnight fill, fortnight navigation/restoration, internal mobile overflow, closure and regression journeys.

## Tasks

- [x] 1. Write failing grid/selection tests, run `npx vitest run tests/unit/week-selection.test.ts` to observe RED. Implement clock/date alignment and rectangular selection; rerun GREEN. Verify duplicate fall-back times remain distinct, missing spring times cannot be selected, and each selected day saves only the requested clock range.
- [x] 2. Add the Outlook-style calendar component/CSS against the contract. Render full-day hour axis with 15-minute subdivisions; initialize the scroll position around daytime. Keep all hours reachable. Use seven-column pages for two-week Venns; preserve choices outside the visible page. Provide keyboard operable cells and counts via accessible descriptions.
- [x] 3. Integrate the dedicated weekly branch and widen the weekly page, preserving existing optional manual time entry and day/month behavior. Add browser assertions before implementation and observe the expected missing-grid RED.
- [x] 4. Verify actual touch and mouse dragging, editing, two different days, rectangular cross-day selection, second-week navigation, saved restoration, closed state, no document overflow at 390px and visible selected navy blocks. Inspect desktop/mobile screenshots.
- [x] 5. Run typecheck, lint, relevant Vitest suite, production build, and the guest/legacy plus authenticated creator browser suites. Review the change, record evidence, and restart the local app for the user's next trial.

## Authorization and scope

The user explicitly requested the Outlook-style weekly grid and quarter-hour drag interaction using their screenshots. Continue in the already isolated `feat/availability-card` worktree, preserve all previous edits, and do not deploy or modify production data.

## Added user requirements during implementation

- Month/multi-month end dates round out to the final calendar month's last day. Update server `planningEndDate`, client `spanEndDate`, and the date-cell upper bound to support twelve months plus the last partial month. Unit tests cover November 23 -> November 30 and every one of 373 dates in a twelve-month example. Existing saved poll windows are not rewritten.
- Add a signed-in, viewer-private calendar-reference endpoint and panel. Read existing Google free/busy data only for the displayed week/month, clipped to the poll window and bounded at six weeks. Disconnect, reconnect, no enabled calendars and provider errors remain explicit states. Busy overlays are informational and never sent through shared poll APIs or treated as automatic votes.
- Optional `WeeklyCalendar` props are `busy?: {start:string,end:string}[]`, `calendarKnown?:boolean`, and `onWindowChange?:({start,end})=>void`. Local page/date/timezone changes trigger a bounded reference refresh; public count refresh does not repeatedly call the calendar provider. Clear stale/failed overlays and ignore late responses.
- Signup/setup/OAuth/calendar-selection paths preserve a validated local return path to the original Venn. Encrypt any return path stored in OAuth state, keep old in-flight state compatible, and retain separate identity-only and calendar consent scopes. Verify open-redirect prevention and private-overlay/browser-isolation behavior. Other calendar providers remain subject to the user's provider preference and their external credentials.

## Verification evidence

- 212 Vitest tests passed, including real Postgres checks, grid/DST/rectangle helpers, full-month bounds, private calendar window/auth/privacy checks, encrypted OAuth return handling and local draft validation.
- TypeScript, ESLint and production build passed. Independent review found no Important privacy or correctness issues in the calendar reference/signup/month integration.
- Production-server browser runs passed with zero retries: 46 guest/legacy/weekly/month/preview journeys plus four signed-in creator/private-reference journeys across desktop and 390px mobile. Actual touch input and mouse dragging exercised independent dates, cross-day clock rectangles and fortnight paging; both month-end and signup draft restoration passed.
- Desktop/mobile weekly and private-busy screenshots visually inspected. Quarter-hour rows align with the hour labels, selections remain navy, busy reference blocks use grey stripes, and mobile overflow stays inside the calendar.
- Signed-in overlay browser tests stubbed the private reference response; backend tests separately verified the Google free/busy adapter path, viewer-only identity and unknown/error behavior. Actual new-account Google consent and a real calendar-overlay response remain live trial checks. No production deployment or production data changes were performed.
- Unsaved manual names/ranges survive signup/setup using per-Venn sessionStorage drafts; no fetched calendar data is stored there. Drafts expire after 24 hours, defer to changed server answers and clear after successful save. A Venn route change resets component state by its share key.
