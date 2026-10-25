# Try Venn

This walkthrough exercises the app; it is not a recorded demo or a submission script. Use invented names and activities. Never record credentials, private calendars, real messages or account settings.

## Group availability

1. Open the deployed app, or run `npm run dev` and open http://localhost:3000. The home screen opens group creation at `/venn`.
2. Enter an activity such as “Lunch with friends,” choose **One week**, a future first date, your timezone and a future voting deadline within that planning window. Press **Create Venn**. If signed out, finish Google sign-in, return to `/venn`, confirm the retained fields and press Create again. Calendar access is optional.
3. Open the resulting share link in two separate browser profiles or on two phones. Guests need no account. Enter different invented display names.
4. In the first browser, drag Tuesday 12–2 pm and save. In the second, select Tuesday 1–3 pm and save. Both must use the displayed timezone. Expect two respondents and an overlap at 1–2 pm. Changes can take five seconds to refresh in the other browser.
5. Reload the first browser. Its own saved answer should return. Change its range, save again, and confirm the respondent count stays at two.
6. Optionally use **Show my calendar** while signed in and connected. Busy blocks belong only to that viewer. They do not select free time or change anyone's answer. A failed provider check must say busy times are unknown.
7. In the organizer's creation result, choose **Open your Venn**, then **Close voting early**. Both browsers should show closed, readable results and reject further saves. Closing may send a result summary to the organizer's paired phone; use a deliberate test poll.

For month/year planning, select whole dates instead of times. Counts mean respondents who selected a range, not proof that everyone invited will attend. Availability polls do not create calendar events automatically.

## Calendar planner

Without provider credentials, open `/app` for the labelled sample planner. Toggle a sample conflict, choose an option and copy/edit its draft. This uses invented calendars and proves no live integration.

For a real solo check, open `/setup`, sign in, connect Google Calendar and include the calendars to check. Open `/live`, keep **Just me**, and enter an invented ask such as “lunch tomorrow.” Choose a returned option and inspect the editable reply. Copying does not send it. A group check additionally needs invited, consenting members and an explicit requester.

Only choose **Add to my calendar** when you intend a real write. Granting write consent is separate from confirming Add. Confirm the event appears once on the owner's calendar; repeated Add must not create another. Do not perform this step on someone else's calendar.

## Release evidence

Run `npm run verify`, the guest browser suite and the separate `VENN_AUTH_E2E=1` creator suite against an isolated test database. Record the source revision and results. Browser emulation, rendered preview images and mocked providers do not complete the [real-phone acceptance checks](phone-spike.md).

Open [the app map](../devpost/app-map.html) offline to follow a saved availability response through the code.
