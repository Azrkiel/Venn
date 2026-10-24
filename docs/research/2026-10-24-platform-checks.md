# Platform checks — 2026-10-24

Repository baseline: Venn `ee3ddaac848eb395992224dc34d299a03a981713`. It contains `plan.md` and `LICENSE`; there is no existing application to preserve or migrate.

These are documentation checks, not successful device or provider integration tests.

| Topic | Evidence | Consequence for Venn |
| --- | --- | --- |
| Photon plans | [Photon pricing](https://photon.codes/pricing) lists free direct messaging for up to 10 users and Business group messaging at $250/line/month. Free/Pro numbers are managed/shared. | Keep Venn's delivery in the organizer's DM. Do not promise a dedicated free number or direct group participation. Confirm actual dashboard provisioning before implementation. |
| Photon integration | [Vendor adapter docs](https://chat-sdk.dev/adapters/vendor-official/photon) describe cloud operation, signed webhooks, attachments, and at-least-once delivery. | Run in cloud mode; authenticate requests; deduplicate side effects; smoke-test outbound routing and images. The adapter is maintained by Photon. |
| Shared bot state | [Chat SDK Postgres adapter](https://chat-sdk.dev/adapters/official/postgres) supports persistent subscriptions, locks, and expiring state in Postgres. | One relational database can serve app data and bot state. Audit history/queues/caches before asserting that messages are not retained. |
| Shortcut triggers | [Apple communication triggers](https://support.apple.com/guide/shortcuts/apdd711f9dff/ios) documents incoming-message criteria, including sender and message text. Multiple criteria must all match. | This supports the trigger concept; it does not prove usable group/sender identifiers or background behavior for this exact automation. Verify on the actual demo phone. |
| Availability access | [Google scopes](https://developers.google.com/workspace/calendar/api/auth) and [freeBusy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) document availability access, intervals, and per-calendar errors. | The organizer can also use free/busy. Calendar-list access is separate metadata permission. An error/omitted calendar is unknown, never empty/free. |
| Calendar discovery | [calendarList.list](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list) lists the calendars on the authenticated user's list. | Implement pagination and selection. Describe coverage as connected/selected accessible calendars, not every calendar in a person's life. |
| OAuth lifecycle | [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) documents offline access and refresh tokens. [Auth.js refresh guide](https://authjs.dev/guides/refresh-token-rotation) requires application refresh handling. | A signed-in browser alone is insufficient for later webhook calendar checks. Store encrypted grants server-side and handle refresh/reconnect. Publishing an OAuth app does not itself guarantee verification or permanent tokens. |
| Structured parsing | [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) documents schema-constrained output. | Validate meaning and ranges after parsing. A valid JSON object can still describe the wrong date or activity. No model may decide who is authenticated or whether a slot is actually free. |
| Image rendering | [Next.js ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response) supports server PNG rendering with limited CSS. | Reuse card data and design tokens; use supported flex layouts and bundled fonts. Device-test image readability and iMessage previews. |
| Hackathon workflow | [Learn AI Basics](https://github.com/challengepost/learn-ai-basics) is a six-stage skill curriculum. It asks for a video and public repository, learner-approved plans, tested slices, feedback, and an app map. | Install skills; keep progress documents honest. Exact event deadlines, eligibility, form fields, and video limits remain unverified without the actual event page. |

## Product claims to tighten

1. "Venn doesn't store messages" must mean the Venn application does not persist raw messages. Claude, Photon, hosting, and observability have their own policies. Verify these and describe the boundary rather than claiming zero retention everywhere.
2. A calendar read failure is not evidence of free time. One failed selected calendar makes that member unknown for the query.
3. A self-entered phone number or display name does not authenticate a person. Use Google identity for membership and a separate phone-link proof for DM routing.
4. A shared group link cannot establish that a visitor is a particular member. Anonymous votes are labelled guest reports and cannot impersonate expected members or complete "everyone replied."
5. No conflict detected means no conflict on the calendars checked at that instant. Recheck before adding an event; another event can still appear afterward.
6. A public image showing only "Busy" still reveals availability. Share option-only previews; keep the detailed owner timeline private.
