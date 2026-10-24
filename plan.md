Venn: Build Plan
Oct 24, 2026 · @Kevin Jiang
Overview
Venn is an iMessage contact that helps you answer "are you free?" texts, on your own or as a group. The first version runs on an iPhone Shortcut, Photon Cloud's free tier and Google Calendar, and needs no Mac.
Tagline: Let's find a time, together.
The problem. When a friend asks "free to grab lunch today?", you have to leave the chat, open one or more calendars, check for conflicts, and then write a reply. Sending a bare list of free blocks feels cold and transactional.
What Venn does. An iPhone Shortcut spots texts about making plans and passes them to Venn, with no screenshots. Venn checks your calendars and, in a group, the calendars of everyone who has joined. It finds slots that fit the activity with room to breathe, puts the requester's open time first, and hands you a warm reply you send yourself. It never texts your friends for you.
Features
The full vision has eleven features. The first version ships nine, several in a simpler form, with group overlap as the centerpiece. Email scanning and duplicate detection come later.
Feature
Full vision
First version
Group overlap
In a group chat, check everyone's calendars and email, and put the requester's open time first
Members join through a link and share free/busy only. You and the requester must be free, then slots rank by how many can come. A group page lets anyone vote, even without connecting a calendar
Multi-calendar check
Cross-reference every calendar you use (Google, Outlook, iCloud) to confirm you're really free
Google Calendar only, all calendars on each account
Message awareness
Read your texts in place, reference them, never store them
An iPhone Shortcut sends only texts about plans, with forwarding as the backup; processed in memory, not saved
"Lemme check"
Say "lemme check" and your options pop up
"Hey Siri, lemme check", Back Tap or texting Venn shows the day card and a menu of replies
Activity-aware slots
"Lunch" means 30 to 60 minutes; suggest slots that fit
Yes, Claude infers the activity and duration
Breathing room
Never offer every free minute; leave travel time and time for yourself
Yes, a fixed buffer before and after each slot
Warm replies
Share availability without sounding dismissive
Yes, a drafted reply in your voice with 2 to 3 options
You stay in control
Venn never texts your friends; easy accept or decline
Yes; pick an option and the reply opens ready to send, or say "add" to save the event
Visual availability
An overlay on screen showing when you're free
A day card image, plus an on-screen menu from the Lemme check shortcut
Email scanning
Find missed emails about meetings and events
Later
Duplicate check
Spot when a suggested event is already on your calendar
Later
Platform reality
Apple doesn't let third-party apps read your iMessages or draw over the Messages app on iPhone, and it offers no official iMessage API. That shapes every decision below.
What Photon is. Photon is infrastructure for putting AI agents into iMessage, WhatsApp, Telegram, SMS and RCS. It isn't an assistant itself. An agent built on it appears as its own contact with its own number. Because there is no official API, Photon runs fleets of Macs to send and receive messages.
What an agent on Photon can do:
• Send and receive files and images, so Venn can send a rendered picture of your day
• Tapbacks, edit, unsend, typing indicators, read receipts
• Message effects, chat backgrounds, polls, voice messages
• Mini-app cards (Business plan only)
Group chats. Venn doesn't need to be inside the group. Friends join Venn through a link, so it can check everyone's calendars while still replying only to you. Putting Venn itself in a group would need Photon's group API on the Business plan ($250 per line per month) or imessage-kit on a Mac.
Private messages inside a group. Not possible. iMessage has no "whisper" feature, so everything posted in a group is visible to everyone. Venn's workaround is a separate 1:1 message to you.
Overlay. An on-screen overlay over Messages isn't possible on iPhone. Venn replaces it with an image of your day sent in iMessage.
Shortcuts, the no-screenshot route. The Shortcuts app's Message trigger can run an automation when you receive a message from chosen senders or containing a phrase, and it can run immediately without asking. The shortcut gets the message text and sender, so Venn never needs a screenshot.
• It fires only on messages you receive, not ones you send, so "lemme check" is a Siri phrase or a text to Venn rather than a word you send your friend.
• A shortcut can be shared as an iCloud link and can ask setup questions when added, such as the person's Venn ID. The automation that runs it can't be shared; each person creates it by hand.
• Shortcuts you run yourself can show native menus, which is how the Lemme check shortcut offers its options.
• It only exists on iPhone, and whether it fires for group messages is untested. Test that first, since groups are the main demo.
Options and decision
Decision: an iPhone Shortcut catches texts about plans, Photon Cloud's free tier carries Venn's replies, and forwarding a text to Venn is the fallback. There's no Mac available, and this is the most realistic iMessage route without one.
Option
How it works
Pros
Cons
Verdict
Photon Cloud free tier
Photon hosts the Macs; Venn gets a number; your web app receives texts through a webhook
No Mac needed; free; up to 10 users; real iMessage feel
DMs only; Venn can't join group chats itself; lines may be shared
Chosen
Web page fallback
Paste or upload the text into a page; get the same slots and draft
Can't break; fastest to build
Leaves iMessage; less magical
Later
Your own Mac + imessage-kit
Script watches your real messages and texts you suggestions
Sees every text automatically; group chats free
Needs a Mac kept awake and signed in
Not available (no Mac)
Rented cloud Mac
Same as above on AWS EC2 Mac or MacStadium
No hardware to own
iMessage sign-in on data-center Macs can fail; 24-hour minimum rental; your messages on a rented server
Rejected
Native iPhone app
Calendar app, maybe an iMessage app-drawer extension
Best long-term polish
A week or more; still can't read your texts
Later
The trade-off: without a Mac, Venn can't read your messages directly. The Shortcut closes most of that gap, and it strengthens the privacy story, since texts that aren't about plans never leave your phone. Forwarding a text to Venn stays as the backup.
Architecture
One small web app does all the work. An iPhone Shortcut sends in texts about plans, Photon carries Venn's replies, and Venn only ever replies to you.
A friend texts you, and the Shortcut sends the text and the sender's name to the app. The app reads it, checks free/busy for you and every member of your Venn group, and sends back a day card with a draft. You send the draft yourself, and "add" writes the event to Google Calendar.
How a group joins. You post a join link in the group chat. Each friend opens it, enters their name and phone number, and signs in with Google once, sharing free/busy only. Venn matches the sender's phone number to a group member to know who's asking.
How slots are ranked
1. You and the requester must both be free, including buffers.
2. Slots where everyone is free come first.
3. Then slots where most people can come, with who's missing shown, like "3 of 4, not Jordan."
4. Friends who haven't joined count as unknown, never as free.
5. Ties go to the slot that suits the activity best, such as midday for lunch.
Which group a text belongs to. Venn matches the sender's phone number to your groups. If they're in more than one, Venn asks you ("lunch crew or roommates?") instead of guessing.
The group page. When you pick an option, Venn can also give you a link to post in the group chat. iMessage shows the day card as the link's preview, so everyone sees the options without leaving the chat. Tapping it opens a page where anyone can mark each option as works or can't, including friends who haven't connected a calendar. Venn texts you when everyone has answered. This keeps the group flow working even if the Shortcut doesn't fire for group messages.
Layer
Choice
Why
Trigger
iPhone Shortcuts automation on the Message trigger, plus a Lemme check shortcut you run yourself
Catches texts without screenshots; filters on the phone
Messaging
Photon Cloud free tier, with Photon's iMessage adapter for Vercel's Chat SDK
Venn's replies to you, plus forwarded texts as a backup
App
Next.js on Vercel
Shortcut endpoint, Photon webhook, join page and group pages in one project
Join page
A page in the same app with Google sign-in
Each friend opts in themselves
Group page
One page per request, with the day card as its link preview
Shows the options in the group chat; anyone can vote
Reading texts
Claude API
Pulls out activity, day, duration and who's asking
Calendar
Google Calendar API, queried live each time: full read for you, free/busy only for friends
Always current; friends' event names are never seen
Day card
Vercel's OG image renderer (next/og)
Turns JSX into a PNG on the server; also the group page's preview
Storage
A small key-value store, such as Upstash Redis
Group members, phone numbers, time zones, Google tokens, votes and preferences; no messages
Build plan
Four phases, each a few focused sessions. Phase 2 is where most of the time goes, because the group feature is what makes Venn worth using.
Phase 1: the core loop
Goal: a friend texts you "free for lunch?", and Venn sends you a day card and a reply.
[ ] Build the Shortcut first and test whether it fires for group messages; the answer decides how much Phase 2 leans on the group page
[ ] Sign up at app.photon.codes, get a project ID and secret, provision Venn's number
[ ] Deploy a Next.js app to Vercel with the Photon webhook and the Shortcut endpoint; verify the webhook signature
[ ] Send the text to Claude; return activity, day, duration and who's asking as JSON
[ ] Google sign-in for you; read events across all calendars on the account
[ ] Slot finder with buffers, the day card, the drafted reply and the text commands ("1"/"2"/"3", "add", "no")
Phase 2: groups that work (the main investment)
Goal: a text in your group chat produces options that work for everyone, and the group can answer in one tap.
[ ] Join page: name, phone number, time zone and Google sign-in with free/busy only
[ ] Groups: create one, share its join link, match a sender's phone number to members
[ ] Live free/busy for every member on each request, merged with buffers
[ ] Ranking: you and the requester free, then everyone, then most, with unknowns for people who haven't joined
[ ] Day card with everyone-free and most-free slots and avatar circles
[ ] Group page: day card as the link preview, works or can't for each option, no sign-in needed to vote
[ ] Venn texts you when everyone has answered, with the winning slot and an "add" option
Phase 3: reliability and polish
[ ] Move the Google app out of testing so sign-ins don't expire after about a week
[ ] Time zones per member, and "today" or "tonight" late at night
[ ] Ask instead of guessing when a sender is in two groups
[ ] Lemme check shortcut: fetch the latest request, show the card, offer a menu, open the chosen reply
[ ] Shareable iCloud link for the Shortcut plus a one-minute setup guide
[ ] Test the group cases: everyone free, one person busy, nobody free, a friend who hasn't joined, two groups, different time zones
Phase 4: demo
• Set up the automation and the Lemme check shortcut on the demo phone the night before; confirm "Run Immediately" is on
• Make a real group chat with three teammates whose calendars are connected, with real events on each
• Live: a teammate asks in the group "free for lunch tomorrow?", and the day card arrives showing the slot that works for everyone
• Post the group page link so judges see the card appear in the chat and votes come in
• Show a busy teammate so the "3 of 4" ranking is visible
• Keep a screen recording of a good run in case Wi-Fi or Photon fails
• Pitch line: "Venn finds where everyone's free time overlaps. Your phone filters the texts, and friends share only busy or free, never their events."
• If asked how it scales: the Shortcut is the prototype's input; the long-term path is a native app plus Venn inside group chats through Photon's group API
Not in the first version: email scanning, duplicate detection, Outlook and iCloud calendars, the web fallback page, a native iPhone app and a settings screen. Hard-code preferences such as buffer length and working hours.
Design style
Venn should feel like a thoughtful friend who's good with calendars: warm, calm and quick. It shouldn't feel like a productivity tool. The brand idea comes from the name: two circles, and the overlap is the time you share.
Logo. Two overlapping circles, outlined. Only the overlap is filled with the accent color. It also works as the contact photo for Venn's iMessage number.
Colors
Token
Hex
Use
Overlap
#7B5CFF
Slots where everyone is free, logo overlap, the one thing to look at
Most
#C9BCFF
Slots where most people are free
You
#8EC5FF
Your circle in the logo, light accents
Friend
#FFB894
The friend's circle, warm highlights
Busy
#E4E1DB
Busy blocks on the day card
Buffer
#F1EEE8
Travel and breathing-room padding, with a light diagonal hatch
Ink
#1D1B24
Text
Paper
#FBF9F6
Backgrounds, a warm off-white rather than pure white
Type. Fraunces (a soft serif) for headlines on the day card and the web page, Inter for times and body text. Both are free on Google Fonts.
Shape. Fully rounded slot pills, 16 px corner radius on cards, generous spacing, no shadows or gradients.
The day card. This is the image Venn sends instead of an overlay.
• Portrait PNG, 1080 × 1350, readable at phone size without zooming
• Header: day and date, then the ask and the group ("Lunch · lunch crew") in Fraunces
• A vertical timeline of the relevant hours, for example 9am to 9pm
• Busy blocks in Busy gray, labeled only "Busy" so event titles never appear in an image you might share
• Buffers as a pale hatch on either side of each busy block
• Two or three numbered slot pills: Overlap purple when everyone's free ("1 · 12:30–1:30 · everyone"), Most lilac when someone can't come ("2 · 3–4 · 3 of 4, not Jordan")
• A row of small avatar circles per slot, overlapping like the logo, filled for people who are free
• Footer: "Reply 1, 2 or 3, or say lemme check"
• Rendered server-side with Vercel's OG image tool (JSX to PNG), no browser needed
Voice. Venn writes the way you'd text a friend: short, warm, lowercase is fine, no corporate phrasing. It never says "my availability is" and never lists every free block.
• Venn to you: "sam's asking about lunch today. two good windows, details below."
• Drafted reply: "yes! i'm free 12:30 to 1:30, or anytime after 3 if that's easier"
• When you're booked: "today's packed for me, but tomorrow lunch works. want to do that?"
Join page. The same palette and type: the group's name, the circles of who's already in, one line on what's shared ("Venn sees only when you're busy, never what you're doing"), and a single "Continue with Google" button. Mobile-first, one column.
Lemme check menu. Native iOS menu items, written like the card: "12:30–1:30 · everyone", "3–4 · 3 of 4", "not today".
Group page. The day card at the top, then each option as a large row with its overlapping avatar circles and two buttons, "works" and "can't". Votes fill in the circles as they arrive. Voting needs only a name, no sign-in.
Privacy, risks and what's next
Privacy promise, stated honestly. Texts that aren't about plans never leave your phone, because the Shortcut filters them first. Venn never saves the ones it does see; each is handled in memory and discarded. Those texts do pass through Claude to be read, and Venn's replies travel through Photon. Say "we never store your messages," not "nothing leaves your device."
• Don't log message text, including in error logs
• Friends share free/busy only, so Venn never sees their event names, and their email stays out of it
• Store only what's needed: group members, phone numbers, Google sign-in tokens and preferences
• Ask for read-only calendar access at first; ask for write access only when someone first says "add"
• Day card images show "Busy", never event titles
• Anyone can leave a group and revoke Venn's access from the join page
Risks
Risk
What happens
Fallback
Shortcut doesn't fire for group messages
Group plan texts never reach Venn automatically
The group page, Lemme check and forwarding; test this first
Google sign-ins expire
While the Google app is in testing, sign-ins last about a week, so friends would have to reconnect
Move the app out of testing in Phase 3; check whether the free/busy permission needs Google's review
Google sign-in for an unverified app
Friends see a warning screen; Google caps unverified apps at about 100 test users
Fine for a demo; verify the app before a wider launch
Friends don't join
Venn can only see your calendar
They can still vote on the group page; unknowns never count as free
iMessage shows an old preview
Link previews can be cached
A new link for every request
Photon free tier changes or has an outage
Venn can't text you back
Lemme check shows the card on the phone; screen recording
Shared free-tier number
Venn's number may not be unique to you
Business plan for a dedicated line
Apple restricts unofficial iMessage access
Photon and similar services stop working
A native app
Keyword filter misses a text
Venn never sees it
Lemme check or forwarding
Claude misreads a vague text
Wrong day or duration
Venn states what it understood ("lunch, tomorrow, ~1 hr") so you can correct it
Open questions
• Default buffer length: 15 or 30 minutes?
• What counts as "today" late at night?
• If the sender is in two Venn groups, which one does a text belong to?
• Should the requester being free be a hard rule, or only strongly preferred?
• Should "add" also create the event for the friends, or only for you?
Later
1. Email scanning with the Gmail API, for you only: find missed scheduling emails and offer accept or decline
2. Duplicate detection across calendars and email
3. Outlook (Microsoft Graph) and iCloud (CalDAV with an app-specific password) calendars
4. Venn inside the group chat itself, through Photon's group API on the Business plan
5. A web page fallback for people without iPhones
6. A native iPhone app with an iMessage app-drawer extension
Sources
• Photon's iMessage adapter: features and pricing (July 2026; check current plans when signing up)
• Photon imessage-kit docs
• Photon seed round
• Photon
• Apple: communication triggers in Shortcuts
• MacMost: auto-responding to texts with Shortcuts
• tinyapps: catch-all message automation
