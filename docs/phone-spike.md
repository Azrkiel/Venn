# Real-phone acceptance record

Use this record for the remaining pilot checks. It does not claim a successful trial. Follow the [demo guide](demo.md) and [Shortcut recipe](shortcuts.md) with consenting test users and invented scheduling text.

## Evidence already recorded

Historical October 24–25, 2026 pilot notes recorded Google sign-in, a live Gemini interpretation, organizer phone pairing and solo iMessage replies. Release v6 was observed running on Fly with a passing health check on October 25. These facts establish earlier provider use and deployment; they do not verify the current revision, every OAuth flow, message receipt today, or the full group journey.

Automated suites cover response persistence, concurrent edits, closure, privacy boundaries, Google adapter failure behavior, booking reconciliation, webhook signatures and delivery claims. A desktop/mobile-emulated browser pass is separate from a physical iPhone result.

## Run the physical-device trial

Record the release/commit, test date, device models, iOS/browser versions and pass/fail notes. Keep real phone numbers, emails, share tokens and screenshots containing private data outside the public repository.

| Check | Expected observation | Current device evidence |
| --- | --- | --- |
| Two phones answer one availability Venn | Distinct answers persist; both see the overlap and correct respondent count; editing does not duplicate a respondent | Pending |
| Messages link preview | A freshly shared Venn unfurls with the correct activity and planning scale, without names or private busy times | Pending |
| Deadline and early close | Responses stop; results remain readable; one organizer summary arrives in the paired DM | Pending |
| New-account Google sign-in/consent | A permitted test account signs in and returns to the intended creation or shared-poll page | Pending |
| Private real-calendar overlay | A deliberate test-calendar conflict appears only to its signed-in viewer; other participants/public poll JSON do not receive busy intervals | Pending |
| Unknown calendar state | Revoked or unavailable access is shown as unknown and does not imply free time | Pending |
| Explicit Add and repeated Add | After separate write consent and confirmation, one event appears only on the owner's calendar; a repeated action creates no duplicate or invitations | Pending |
| Manual iPhone Shortcut | Invented ask returns real-calendar options and a draft; latest/card retrieve the same organizer's result; copying sends nothing | Pending |
| Shortcut revocation | Revoke its credential; the next request receives 401 | Pending |
| Optional Message automation | Test sender/text variables and locked/unlocked behavior on the actual iOS version before enabling; keep manual Shortcut available | Pending |

Do not infer notification receipt from a provider accepting a request. Check the phone. If delivery is uncertain, inspect Messages before deliberately resending. Availability-close summaries and connected-member option-poll completion notices have separate processors; neither should text friends or book an event.

## What needs the account or device owner

- Google consent and adding any additional OAuth test users.
- Seeing a real Messages preview and confirming message arrival.
- Running Shortcuts, Siri or Message automations on the iPhone.
- Deliberately granting write access and checking the resulting owner event.

These steps require the intended person's account/device and observation. They remain incomplete until that evidence is recorded. Use [setup.md](setup.md) for configuration, and keep credentials in local/deployment secret storage. Rotate previously exposed provider credentials at their issuing service; never replace `TOKEN_ENCRYPTION_KEY` without a migration/reconnection plan.
