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
