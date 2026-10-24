---
doc: prd
status: approved
approval_basis: learner approved the displayed implementation plan and scope; this document extracts that accepted behavior
---

# Venn — Product requirements

## The Core Journey

Implements `scope.md > The Core Loop` and `scope.md > What "Working" Looks Like`.

1. The organizer selects a friend group and provides a scheduling ask through the private app or a verified phone path.
2. Venn states the activity/date/duration it understood; unclear input asks a question.
3. The connected calendars are checked. Venn offers up to three useful, buffered windows where the organizer and requester are known-free, ranked by group attendance.
4. The organizer selects an option, copies an editable friendly reply, and sends it themselves.
5. Friends can answer a scoped group link. Guests are labelled separately from identified members.
6. A deliberate Add action checks the selected time again and creates one event on the organizer's calendar.

## Look and Feel

Carry forward the original warm paper, purple overlap, blue/peach people accents, Fraunces headings, Inter body type, overlapping-circle mark, rounded pills, 16px cards, and generous spacing. The experience feels calm and friendly. The mobile app and day card share the same visual language. No gradients or shadows.

## Features and Behavior

### Group overlap

Unknown is distinct from busy and free. The organizer and requester must be known-free. Everyone-free ranks ahead of partial attendance. Counts include expected unconnected people. Show two or three non-overlapping options, their time zone, and who is missing/unknown privately. No matching windows is a normal result with a clear next action.

### Connections and groups

Google sign-in identifies a member. Calendar connection is separate and optional for friends. Selected accessible calendars all contribute to availability. A failure in any selected calendar makes that member unknown. Create, invite, join, leave, reconnect, revoke and delete flows preserve consent. Typing someone else's name or phone never grants access to their calendar.

### Requests and replies

An ask has one activity/date/duration. Default buffers are 15 minutes. Vague requests and ambiguous groups/requesters ask instead of guessing. Gemini interprets language; code chooses time windows. Warm templates use the selected valid slots. Venn never sends the draft to friends automatically.

### Cards and sharing

The private 1080x1350 card may show the organizer's busy timeline labelled only Busy. Public link previews show proposed options and counts, without a private timeline, contact details, event titles or calendar identifiers. Expired/revoked links stop providing fresh data. Previously fetched previews may remain cached externally.

### Votes and event creation

Members answer as their signed-in identity. Guests can self-report without connecting a calendar; they cannot impersonate expected members or complete everyone-answered status. Votes can be updated without double-counting. Explicit owner-only Add rechecks conflicts and creates no attendee invitations. Retries do not create another event.

## States and Boundaries

First use shows setup and explicit sample-data exploration. Sample results are always labelled and cannot be mistaken for live checks. Missing provider configuration displays setup status. Calendar/model/transport failures are recoverable and never invent availability. Stale, cancelled and expired requests cannot be booked. Raw asks are processed transiently and excluded from app persistence/logs.

## Product Decisions

The learner approved the existing product identity, Google-first small-group scope, manual-send control, live-core demo followed by daily-use pilot, and the detailed behavior in the implementation plan. This PRD introduces no new product choices.

## What We're Building

Release D proves real group overlap, interpretation, a private card and editable reply through a verified phone path. Release P adds the repeat-use invitation, voting, event-write and recovery flows. The roadmap's acceptance matrix is canonical for detailed checks.

## Deferred From the POC

Email scanning, semantic duplicate detection, Outlook/iCloud, bot participation inside iMessage groups, native app, broad multi-account support, and unrestricted public onboarding.

## Non-Goals

Automatic messages to friends, silent bookings, a public availability directory, event-title collection, and pretending labelled development fixtures are live calendar integration.

## Open Questions

Device automation and provider provisioning need real evidence; exact event rules need the actual event page. These block claims about live readiness, not the implementation of the approved shared core.
