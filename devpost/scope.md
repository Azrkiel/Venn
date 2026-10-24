---
doc: scope
status: approved
---

# Venn

An iMessage-oriented helper that finds where a small group's free time overlaps and gives the organizer a reply they choose to send.

This draft distills `plan.md` and the learner's stated goal of an end-to-end app useful in daily life. The learner approved the release split and implementation plan with "yea, looks great, continue".

## The Unique Kernel

Find activity-sized windows where the organizer and requester are both free, prefer everyone-free windows, and make the result feel like a friend's reply rather than a calendar export. Unknown availability never counts as free.

## Who It's For

An iPhone owner arranging lunch with a small recurring friend group. Today they leave Messages, compare calendars, and manually coordinate replies. Initial testing uses one organizer and two or three consenting friends.

## The Core Loop

A scheduling text reaches Venn through an explicit Shortcut action or forwarding. Venn identifies the intended group and request, checks connected calendars, and returns two or three useful options with an editable draft. The organizer sends that draft themselves. Friends can respond through a group link without connecting a calendar.

## Inspiration & Identity

Carry forward the original overlapping-circle identity, warm paper background, purple overlap accents, Fraunces headings, Inter body text, rounded cards, and short friendly language. No new visual direction is needed.

Source: https://github.com/Azrkiel/Venn/blob/main/plan.md

## Why This Matters to the Learner

The learner wants to finish the full path to a usable app that friends return to and share. Learning the end-to-end implementation is the immediate goal.

## What "Working" Looks Like

For the first hackathon milestone, a real request uses live Google free/busy from consenting group members. Changing a real calendar conflict changes the ranked options. The organizer receives the day card and a reply they can choose to send. A missing calendar is visibly unknown. Record this functioning loop in the required demo video.

For the daily-use pilot, a small friend group can repeat the flow on later days, respond to links, reconnect or revoke access, and deliberately save the chosen event to the organizer's calendar. Provider failures lead to recoverable states rather than invented availability.

## The POC Boundary

Proposed first milestone: Google-only; one owner per group; small groups; one Google account per connected person; supported accessible calendars selected explicitly; one activity and date per request; fixed buffers; live deterministic overlap; a private day card; warm manual-send draft; one verified phone input/delivery path. Risk-test Shortcut automation and Photon before relying on either. Sample calendars are allowed for local development only and must be labelled.

The complete first demo must use real calendar data. Fixture-only overlap or a disconnected mock screen does not prove this kernel.

The daily-use pilot extends this milestone with group voting, secure friend invitations, multi-group disambiguation, the Lemme check shortcut, explicit owner-only calendar writes, reconnect/revoke/delete flows, and retry/duplicate handling. These remain in the project roadmap even when excluded from the first demo recording.

## Later

Email scanning, semantic duplicate detection, Outlook/iCloud integration, Venn inside the group chat, and a native iPhone app remain later work, as in the original plan. Broad multi-account support, advanced preferences, and unattended public onboarding follow a successful small-group pilot.

## Explicitly Cut

Automatic messages to friends: the organizer stays in control. A public availability directory: invitations and results use scoped links. Automatic event invitations to friends: calendar writes affect only the organizer unless a later design explicitly changes this.

The following are proposed simplifications requiring review: use Postgres instead of the original optional key-value store; provide a small private request screen as an integration/test surface; delay automatic message detection until actual iPhone evidence supports it. None replaces the intended iMessage experience.
