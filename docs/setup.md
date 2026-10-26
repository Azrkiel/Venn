# Connect Venn's live services

The sample planner works without accounts. It uses sample calendars and the real interval-ranking code; it does not claim to have checked Google Calendar. The live path requires the following separate connections.

## Local setup

Use Node 22.12 or newer. From the build checkout:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000 (not 127.0.0.1: Next normalizes loopback hosts to `localhost`, so Google sign-in only works there). Keep `.env.local` out of git. Enter credentials into that local file or the deployment's environment settings, not into chat. Restart the development server after changing configuration.

If this machine reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, enable Node's installed system trust for that terminal with `$env:NODE_USE_SYSTEM_CA = '1'`, then retry. This was verified on the development machine. Do not disable TLS certificate verification.

## 1. Postgres

Create a Postgres database in a provider you choose, such as [Neon](https://neon.com/docs). Put the pooled runtime URL in `DATABASE_URL`; use the provider's direct URL in `DIRECT_URL` for schema migrations. No database is provisioned by this repository and no paid service has been purchased.

Use the repository's database scripts after configuring the connection. A passing schema validation is not proof that the database is connected; the live smoke check must pass before claiming live readiness.

## 2. Google identity and Calendar OAuth

A Gemini API key cannot grant access to someone's calendar. Calendar access needs the member's separate consent through Google OAuth.

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/), enable Google Calendar API, and configure the Google Auth Platform consent screen.
2. For a small pilot, configure the actual test users. Check Google's current consent/verification requirements before expanding the audience.
3. Create an OAuth client for a web application. Register these development redirect URLs exactly:
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/calendar/callback`
4. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The Calendar flow can reuse these; the `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` overrides are optional and may remain blank.
5. Generate separate local `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` values. For either, `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` generates suitable random bytes. Keep the two values distinct. Losing the encryption key requires reconnecting calendars; never overwrite it casually.
6. Open `/setup`, sign in, then connect Calendar. Select the calendars to check; newly discovered calendars start excluded. The consent copy discloses availability plus calendar-list metadata access.

Initial scopes are `openid`, `calendar.events.freebusy`, and `calendar.calendarlist.readonly` (Calendar scopes use the `https://www.googleapis.com/auth/` prefix). Event details are not requested. Saving an event later asks separately for `calendar.events.owned`; the consent is broader than creating one event, although Venn only performs the deliberate owner action.

For HTTPS hosting, change `APP_BASE_URL` and `GOOGLE_CALENDAR_REDIRECT_URI`, register the corresponding HTTPS callbacks in Google, and isolate development/production database credentials. Do not leave a production origin pointing at localhost.

References: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

## Microsoft Outlook and Apple iCloud

Run `npm run db:migrate` before using the new providers. Existing Google grants remain intact. Each Venn account can connect one account per provider and select multiple calendars from each. Sign-in to Venn is required for all calendar actions; responding manually to a shared Venn still works without an account.

For Microsoft, register a Web application in Microsoft Entra that supports personal Microsoft accounts and work/school accounts. Set `AUTH_MICROSOFT_ENTRA_ID_ID` and `AUTH_MICROSOFT_ENTRA_ID_SECRET`, and register both callbacks:

- `http://localhost:3000/api/auth/callback/microsoft-entra-id` for identity sign-in.
- `http://localhost:3000/api/calendar/outlook/callback` for separate calendar consent.

Use your HTTPS origin for production callbacks. Outlook calendar consent requests delegated `Calendars.ReadBasic` and `offline_access`, with PKCE and single-use state tied to the current Venn user. It discovers all calendar pages and checks each selected calendar's bounded `calendarView`, including recurring occurrences and exceptions. Only start/end, busy status and cancellation status are requested. Microsoft tokens stay encrypted server-side and refresh without requiring another sign-in until consent is revoked. Your organization may restrict consent.

For Apple, sign in to Venn using Google or Microsoft, open Apple iCloud on `/setup`, and supply your Apple Account email and an [app-specific password](https://support.apple.com/en-us/102654). This requires two-factor authentication on the Apple Account. Sign in with Apple alone does not grant calendar access. No Apple developer OAuth registration is needed for this CalDAV flow. Calendars must be stored in iCloud; calendars stored only on a device cannot be read by the server. For Google or Outlook calendars displayed in the Apple Calendar app, connect the underlying provider instead.

iCloud discovery and requests are restricted to trusted iCloud CalDAV HTTPS hosts. App credentials are encrypted using the existing `TOKEN_ENCRYPTION_KEY`. Bounded queries request server-expanded recurrence; event data is reduced to busy ranges in memory and never persisted or sent to the group or Gemini. Unsupported expansion, missing calendars, denied requests, or invalid data yield unknown availability. Removing the connection deletes local credentials; also revoke its app-specific password in Apple Account settings. Outlook access can likewise be removed from Microsoft account permissions after disconnecting locally.

Newly discovered calendars start excluded. Include each calendar to check; different providers can be connected at the same time. If any selected provider fails, the combined check remains unknown. Provider busy ranges are a private reference and never select or save availability on a user's behalf. Event creation remains a separate, explicit Google-only action.

References: [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0), [tsdav CalDAV](https://tsdav.vercel.app/caldav/fetchcalendarobjects).

## 3. Gemini

Create an API key using [Google AI Studio](https://aistudio.google.com/api-keys). Set `GEMINI_API_KEY` server-side. Set `GEMINI_MODEL` to a model available to that account with JSON structured-output support; the example follows Google's current documentation and still needs a real smoke check against your account.

Venn uses stateless structured extraction, no tools or chat history, and local semantic validation. Only the scheduling text and receipt/time-zone context are sent to Gemini. Busy intervals, contact lists, calendar grants and event details are excluded. Google's own processing/retention terms still apply.

Reference: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## 4. Photon and the iPhone

Create a cloud project at [Photon](https://app.photon.codes). Confirm the current free plan and routing assigned in the actual dashboard. Configure project ID/secret and a per-webhook signing secret in local/deployment environment variables. Keep `IMESSAGE_LOCAL=false`; the local adapter mode requires a Mac.

The live phone path also needs an HTTPS endpoint, verified organizer pairing and an actual iPhone Shortcut test. Documentation about Message triggers does not prove that the demo phone supplies usable group-message text or identity. Record the device behavior before claiming automatic group detection. Do not put an unattended Send Message action into the automation.

Venn's planned pilot uses organizer DMs. Group-chat participation is a separate paid/provider capability and is outside this release. See [Photon adapter documentation](https://chat-sdk.dev/adapters/vendor-official/photon).

## What counts as live evidence

After configuration, verify the real flow: connect at least two consenting accounts, create a deliberate calendar conflict, and observe the overlap change. Verify phone routing on the actual device. Provider mocks, sample calendars, schema validation and compilation are useful checks but do not substitute for these live results.
