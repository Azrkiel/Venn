# Group availability Venns

Approved direction: the organizer chooses a planning span; friends answer through a unique group-specific link with a self-reported display name and no account requirement. This feature supplements existing calendar-generated option polls.

## Scheduling and interaction

- Day: one date, with 15-minute time selection.
- Week or two weeks: select dates and 15-minute time ranges within each date. Three weeks uses the month view.
- Trial feedback, 2026-10-24: weekly/fortnight polls use a dedicated Outlook-inspired weekly calendar, with dates across seven columns, times vertically, quarter-hour grid lines and solid navy selection blocks. Each date supports its own disjoint availability. Two-week polls page between weeks. Phone calendars scroll within their own frame, with sticky day headers/time labels and accessible navigation; the page itself must not overflow. Dragging across dates applies only the selected clock-time rectangle, never an unintended continuous overnight range. Existing day and month/year views remain available.
- Month, multiple months, year: select whole dates, including disjoint dates and dragged ranges. Exact times are decided later. Month/multiple-month planning includes the rest of its final calendar month: a nominal November 23 end becomes November 30. This makes those dates selectable; it does not mark anyone free automatically. Up to twelve months may therefore extend slightly beyond a calendar year. The year option keeps its one-calendar-year span.
- Creator explicitly sets start date, timezone, span and closing deadline. Calendar spans follow local calendar dates, including daylight-saving changes.
- Mobile and desktop support pressing and dragging; individual cells are keyboard-operable buttons. Selecting an already selected cell removes it. Time inputs provide an accessible alternative to dragging. Responses remain editable until close, including an explicit unavailable response.

## Identity, visibility and lifecycle

- A random, unguessable link identifies one Venn. An HTTP-only cookie identifies a browser's response independently of its self-reported name. Names never serve as authentication.
- Before the first save, a random guest key is initialized in a serialized IndexedDB transaction shared across tabs, then sent in a same-origin header. This prevents simultaneous first submissions from minting separate identities. The server prefers an existing HTTP-only cookie, stores only the key's digest, and never returns the raw key in poll JSON. The local key has no account or calendar permissions.
- Counts are visible to joiners. After answering, a participant can opt to reveal respondents' display names. No private calendar data, internal user IDs, cookie keys, or other people's individual ranges leave the server.
- Closing and deletion are separate: closed results remain readable for 30 days; deadline or owner-only early close stops updates. Results never book an event or confirm attendance automatically.
- Since an open link has no fixed roster, closure triggers the organizer summary. Say how many respondents overlap, never claim every intended invitee answered. Suppress repeated notifications with an atomic claim. Ambiguous delivery is not automatically retried to avoid duplicate texts.
- After successful submission show “Love using Venn?” and “Make your own Venn”, linking to a dedicated signup page using existing Google sign-in. Signup returns to the Venn creation page and requires no calendar connection.
- Existing calendar option polls remain supported. Their original privacy and owner-only event-writing rules remain in force.
- Trial revision: voters can optionally sign up and connect their own calendar to cross-reference private busy blocks during availability selection. Reuse existing Google Calendar free/busy consent first while provider preference is pending. The overlay is viewer-only; never include busy intervals in public poll JSON, overlap counts, names or link previews. Failures stay explicitly unknown, and busy blocks neither auto-select free time nor override a person's manual answer. Signup/consent returns to the original Venn. Calendar event titles/descriptions are not needed for this feature.

## Scope and verification

Create/manage on `/venn`; read/respond on `/r/[share]`; signup on `/signup`. Link previews describe either time or date selection and never contain names. Poll visible pages every five seconds while visible. Closure is enforced on the server independent of cron; notices are consumed by the existing protected maintenance endpoint and opportunistically on poll reads/writes.

Verify pure date/span, range and overlap behavior; real database edits/concurrent responses, identity gating, closure and notification claims; mobile and desktop journeys including drag, saved response restoration, two browsers, early close, CTA and no horizontal overflow. Production deployment and real iMessage previews require separate live evidence.
