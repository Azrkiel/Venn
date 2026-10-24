# Use Venn from an iPhone

These are manual setup recipes for the implemented HTTPS APIs. A Shortcut/iCloud link has not been created or tested on an actual phone yet. Automatic Message-trigger and group-message behavior remain unverified. Do not describe them as working until the phone checks below succeed.

## Prerequisites

1. Run the live Venn app on HTTPS. Complete Google sign-in, Calendar connection and selected-calendar setup. Gemini must be configured on the server. The labelled sample screen does not connect real calendars.
2. Create a group, invite the consenting friends and identify which member is asking. In the private app, choose that group and requester. Use their exact `groupId` and `requesterMemberId` from the app's setup/API output, not a name guessed from a text. Use the organizer's IANA time zone, for example `America/New_York`.
3. On Venn's device setup page, issue a named Shortcut credential through `POST /api/device-tokens`. It is shown once and expires after 30 days. Keep it in your own Shortcut; anyone with that token can create requests and read your latest result. Never share a Shortcut containing your credential or put it in a URL. Other people should issue their own credentials.
4. `GET /api/device-tokens` lists credential metadata without showing plaintext tokens. `DELETE /api/device-tokens` with JSON `{ "id": "the-device-id" }` revokes a device immediately. These administration endpoints use the signed-in browser session and same-origin protection; the device token cannot administer devices or groups.

## Shortcut 1: Check with Venn

In Apple's Shortcuts app, create a shortcut named **Check with Venn**. The explicit manual flow is the reliable starting point; it never sends a message to friends.

1. Add **Ask for Input**, type Text, with a prompt such as “What are you making plans for?” Alternatively, accept text shared explicitly into this Shortcut. Do not automatically read the clipboard or unrelated messages.
2. Add a **Dictionary** with four entries:
   - `groupId`: the selected Venn group ID.
   - `requesterMemberId`: that group's identified requester member ID.
   - `text`: the Ask for Input result.
   - `timezone`: your organizer IANA zone.
3. Add **Get Contents of URL** for `https://YOUR_VENN_HOST/api/shortcut`. Method: POST. Request Body: JSON, using those dictionary fields. Add headers `Content-Type: application/json` and `Authorization: Bearer YOUR_OWN_DEVICE_TOKEN`. Replace the dummy host/token locally; no real secret belongs in the repository.
4. Inspect the returned JSON. HTTP success can contain `state: needs_clarification`; display its clarification reason and ask for another input instead of claiming it found times. A successful normalized result includes the interpreted activity/date/duration, `slots`, `draft`, and an owner request ID. If `state` is `no_slots`, show the honest no-fit result.
5. Add **Get Dictionary Value** for `draft`, then **Show Result**. Add a menu with “Copy reply,” “View day card,” and “Done.” “Copy reply” uses **Copy to Clipboard** only after the user chooses it.
6. “View day card” calls `GET https://YOUR_VENN_HOST/api/shortcut/latest/card` with the same Bearer header, then uses **Quick Look**. This private image is rendered in memory. If its timeline says unavailable, it shows the saved options without inventing missing busy blocks.
7. To reply to your friend, return to Messages, paste/edit the draft and tap Send yourself. Do not add an unattended **Send Message** action. Venn's HTTP result is a draft, not a sent reply.

The group/requester can be chosen through a Shortcut menu containing previously configured Venn IDs. Until the exact Message automation fields have been tested, do not infer group identity or requester identity from contact display names. A request body cannot choose an owner or delivery recipient; the bearer credential supplies the organizer identity.

### Error behavior

- 401: the device token is missing, expired or revoked; re-pair it in Venn.
- 403: the signed-in organizer is not allowed to use that group/requester.
- 413/422: reduce the input or correct its fields/clarify the request.
- 429: wait before retrying.
- 503 or a safe provider error: check setup/reconnect. Never translate an error into “everyone is free.”

Do not repeat a failed request in an unattended loop. The request body is processed transiently and is not a durable recovery job.

## Shortcut 2: Lemme check

1. Create a shortcut named **Lemme check**.
2. Use **Get Contents of URL** for `GET https://YOUR_VENN_HOST/api/shortcut/latest`, with the same Bearer header.
3. If a current result exists, show its date, time zone and `draft`. Use **Choose from Menu** for “Copy reply,” “View day card,” or “Done.” If no result exists, show that state and offer to run **Check with Venn**.
4. Fetch `/api/shortcut/latest/card` with the Bearer header for **Quick Look** when requested. This endpoint returns only the paired organizer's latest unexpired valid result.
5. Say “Hey Siri, Lemme check” after checking that Siri can run the local Shortcut. Optionally assign the Shortcut to Back Tap through iOS Accessibility settings. Verify both on the intended device.

This initial menu copies the current draft. Individual numbered selections can be made in Venn's private result page or the verified DM commands below. No Shortcut endpoint performs an automatic calendar write.

## Optional Photon private DM

Photon cloud configuration requires `IMESSAGE_PROJECT_ID`, `IMESSAGE_PROJECT_SECRET`, and `IMESSAGE_WEBHOOK_SECRET`. The project must have a real provisioned route. Free managed numbers may be shared; do not assume one globally dedicated Venn phone number. Register the deployed `/api/webhooks/photon` URL in the provider dashboard.

1. While signed in, open Venn's device setup and request a phone-pair challenge through `POST /api/phone-link`.
2. Copy the returned `pair <random-code>` command and send it in a **direct message** to the Venn routing contact provided by your actual Photon project.
3. The challenge expires in 10 minutes. Venn verifies Photon's signature before binding the observed sender and sending-line-aware thread to your account. A typed phone number in a web form never establishes this link. A consumed code cannot be used twice.
4. `GET /api/phone-link` reports whether pairing exists. `DELETE /api/phone-link` unlinks your account and invalidates outstanding pairing challenges.

After pairing, “lemme check” sends your latest current result to this private DM. `1`, `2` or `3` selects an existing option only when exactly one active request exists; Venn asks you to choose a request if there are several. `no` cancels that single request. `add` requires a previously selected current option and explicit Calendar write permission; otherwise it sends you to the private confirmation page. It never adds events for friends or sends their reply.

Forwarded scheduling text has no trustworthy Venn group/requester identifiers. Venn sends the paired organizer a private link to choose that context; it does not guess from the forwarded text. Unpaired ordinary messages receive no private calendar data. Group-chat deliveries and outbound echoes are ignored.

## Retention and webhook audit

The implementation is pinned to `@photon-ai/chat-adapter-imessage` 3.2.0 and `chat` 4.43.0. The installed Photon adapter removed local mode even though its public documentation still discusses it. Venn uses cloud mode only.

The installed adapter's private signature verifier uses `x-spectrum-signature`, `x-spectrum-timestamp`, and `v0=HMAC_SHA256(signingSecret, "v0:" + timestamp + ":" + exactRawBody)`, with a five-minute timestamp tolerance and constant-time digest comparison. Venn's narrow bounded ingress implements that exact format because the verifier is not exported. It authenticates before reading sender identity, pairing or acting on a command. Any adapter upgrade requires rechecking this format against the installed implementation.

Venn uses the public adapter `postMessage` method for outbound messages, with a payload-silent logger. It does not instantiate a Chat history store, gateway listener, concurrency queue, transcript API, modal context or raw incoming-message cache. Chat's source can persist message history when an adapter opts in and can store whole messages in queue/debounce/burst modes; this ingress avoids those paths. The optional `scripts/migrate-chat-state.ts` provisions SDK state tables if future functionality needs them; the current webhook uses app-owned ID-only delivery records instead.

Before side effects, the webhook claims `(projectId, providerMessageId)` under a unique database constraint. It stores IDs, state, expiry and an optional normalized request reference—not message text or provider payloads. Duplicates acknowledge without repeating side effects. Processing uses Next.js `after`, not an untracked detached promise or a durable raw-message queue. A process crash may require the user to send a new message; the app does not claim durable message recovery or exactly-once external delivery. A send timeout is uncertain: check Messages before deliberately resending.

The tests submit a synthetic private-text canary and inspect the mocked database write boundary for its absence. That proves the app's intended writes, not a live production log/database audit. Before the phone milestone, repeat the canary with a test account and inspect app tables, SDK tables, hosting logs and observability. Provider-side retention policies are separate from Venn application storage.

## Actual-device acceptance checklist

- [ ] HTTPS live request from Check with Venn returns real-calendar options and an editable draft.
- [ ] A real test-calendar conflict changes the result; an unavailable calendar remains unknown.
- [ ] Lemme check retrieves the correct organizer's result and shows its private day card.
- [ ] Copying a reply does not send it; the organizer manually edits/sends it.
- [ ] Revoked Shortcut credentials immediately return 401.
- [ ] Photon provisioning, signature rejection, one-time pairing and owner-only delivery pass on the actual project.
- [ ] Group deliveries do not expose private information or pair a phone.
- [ ] Test iOS Message trigger with invented text: selected sender, keyword, locked/unlocked, Run Immediately setting, sender variable and group-message variable availability. Record iOS version and results before enabling automation.
- [ ] If automation fails any required case, use the explicit manual Shortcut rather than describing automatic detection as complete.

No actual-device boxes were completed during code-only implementation.
