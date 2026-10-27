# The dashboard: where a signed-in person lands

Written 2026-10-27 from Kevin's ask: "Currently when users log in, they
land on the home page. Help me brainstorm features for a user dashboard
where users would land after log in", then "write up a detailed plan
and proceed with step 1". The decisions below (per user across accounts,
always the landing, three-tier empty state) are his, taken on my
recommendation the same day. Each step is a release on its own; the home
page stays the signed-out front door throughout.

## Decisions

- **Per user, across accounts.** One `/dashboard` outside `[account]`,
  like `/inbox`: sectioned by account when the person belongs to more
  than one band, a single list when there is one. The account-scoped
  queries in `data.ts` stay as they are and run once per membership
  (`realMemberships(locals.memberships)`, so a super admin's acting
  memberships do not flood it). Account-specific actions link into the
  account's own pages.
- **Always the landing after sign-in**, with `?next=` honored first
  (`safeNext`'s fallback becomes `/dashboard` on the sign-in page and
  wherever else the fallback was `/`). The wordmark in the header goes to
  the dashboard for a signed-in person and to the home page for a
  visitor; the account name keeps going to the account's projects.
- **Empty state as onboarding, in three tiers:** no account yet (a "start
  your band" card and the free tools), an account with nothing in it (a
  checklist derived from counts, collapsing as items complete), an
  account with content but nothing new ("Nothing new since your last
  visit", the page keeping its shape). The checklist is computed, never
  stored.

## Step 1 — the page, the landing and the first sections (v0.176.0)

**Built 2026-10-27.** As below, with these particulars: the page is split
into `Dashboard*.svelte` components (fallow's template-complexity gate
failed the page as one file); the inbox row is `InboxItem.svelte`, used
by the inbox too, and its `when()` is `utils/formatWhen.ts`; projects and
songs are filtered by `canViewProject`/`canViewSong` with the person's
project roles, so a restricted project they are not on stays out
(fetched three times over to leave room); `recentUserIdeas` lists the
ideas without presigning take URLs; ideas link to the Idea Recorder since
no page opens one idea by address; "dashboard" is a reserved short-link
slug. Counts: `accountCounts` (projects, songs, ready recordings,
members). The sign-up page still sends an already signed-in visitor to
`/`.

**Laid out again 2026-10-27 (Kevin):** the first thing on the page is a
tile per account (`DashboardAccount`; `DashboardTileList`, since removed) listing its
six most recent projects, songs and sessions side by side with "All …"
links, so a person jumps straight to one; the sessions link to their own
pages. Since v0.181.0 the tiles share a row (`sm:grid-cols-2 xl:grid-cols-3`)
and hold only the account's name, the person's role and its counts of
projects, songs, sessions and members (each a link; `accountCounts`),
under a "Your Accounts" heading (every section heading carries an
`InfoTip` saying what the kind of thing is, since v0.183.0); the lists
moved to **Your Projects**
(every project the person may open across accounts, with its song count;
"All projects" opens `/projects`, the same sortable, filterable page as
`/songs`, where it redirected to the current account before), then the
sections below. Two columns from `lg:` (content left, a 20 rem sidebar
right, `+page.svelte`), one column on a phone; since 0.183.1 Latest is
its own aside placed first on a phone (grid rows and columns at `lg:`,
so the right column reads Latest, then the widgets), the dates in the
lists are days only, and the tile counts are of active projects and songs.
Since 0.184.0 the loader fetches the newest `DASHBOARD_LIST_CAP` (50) of
each kind rather than 500: the lists show ten at a time and the "All …"
pages hold everything, so the page data stays small as accounts grow (a
capped list's count reads "of the latest 50"). The
content column continues with **Your Songs** (every song the person may
open across their accounts, last changed first, each under its project,
its stage (`songStage`), its counts of ready stems and demos (`recentSongs`)
and, with several accounts, its account; `songEntries` in `+page.server.ts`;
"All songs" opens `/songs`, every song across accounts, sortable and
filterable), **Your Sessions** (the same for recording sessions, latest
day first, each under its kind, place and recording count; "All sessions"
opens `/sessions`, the same page for sessions, which was a redirect to the
current account's before), then
**Your Ideas**, **Your Multitrack
Recordings** and **Your Loops** (one `DashboardIdeas` component for the three
idea kinds, `recentUserIdeas(userId, kind, n)`; each empty state is the
call to action: Record an idea, Record a loop, Record a multitrack; Dawn
songs open by `?song=<id>`, ideas and loops have no address of their own
yet). The sidebar holds **Latest** (what is new for you), then the **Tools**,
**Instruments** and **More** widgets (`DashboardWidget`, headings
`marketing-section-heading`, lists in `constants/dashboardLinks.ts`;
Session Recorder needs the current account's slug,
`utils/dashboardTools.ts`; More opens with the inbox, the current
account's settings (`utils/dashboardMore.ts`), the notification settings
and the short links; "Report a bug" opens the
footer's form, "Share Stem Shovel" uses the share sheet or copies the
address, `utils/shareSite.ts`). Quick actions are gone; the start card
for a person with no account stays. Later the same day: the three idea
sections load every item of their kind (capped at 500, newest first),
with an "All ideas" / "All loops" / "All multitracks" link beside the
heading, a search by title (`utils/filterByTitle.ts`) and ten items at a
time with "Showing N of M" and Show more (`utils/pageOf.ts`,
`DASHBOARD_IDEAS_PAGE`, `DashboardIdeaList`); the link and the search
appear only once the section has something in it. Dawn songs stay out of
the account tiles' Songs lists (Kevin, 2026-10-27): those are the band's
project songs.

- `src/routes/dashboard/+page.server.ts` (`requireSignedIn`) and
  `+page.svelte`, title "Dashboard" (`app-page-heading`), noindex (the
  route is not in `isIndexablePath`, and `scripts/lib/siteRoutes.mjs`
  lists it with `/inbox`'s expectations).
- **Latest**: the unread notifications (`listInbox`), as counts per
  kind in a line ("3 comments · 2 chat messages · 1 session") and the
  newest five with their links, opening each marks it read as the inbox
  does (`markNotificationRead`); a link to the inbox. Nothing unread:
  "Nothing new since your last visit." (`utils/inboxDigest.ts`, pure,
  tested.)
- **Quick actions**: Add a recording, New song, New idea, Record a
  session, Tuner, Metronome; for one account the links carry its slug,
  for several the row sits inside each account's section.
- **Per account**: the account's name (a link to its projects, and a
  heading only when there are several), **Latest session** (the newest
  `recording_session` with its recording count and newest recording,
  linking to the session's own page `/<slug>/sessions/s/<id>` and to the
  Sessions page), **Recent projects** (the four most recently updated,
  image, name, song count) and **Recent songs** (the five most recently
  updated, linking to their pages). New `data.ts` helpers:
  `latestRecordingSession(accountId)`, `recentProjects(accountId, n)`,
  `recentSongs(accountId, n)`, each one query.
- **Your Ideas**: the three newest of the person's own ideas
  (`listUserIdeas`), linking to the Idea Recorder.
- **Empty tiers** as decided: no membership → the start card (Create an
  account → `/accounts`, the tools row); an account with no projects,
  songs, recordings or members beyond the owner → the checklist
  (`utils/onboardingSteps.ts`, pure, tested: Add a recording, Create a
  song, Invite the band, Try the Idea Recorder, each linking to the
  action; hidden once three are done); otherwise the sections above with
  the "Nothing new" line where it applies.
- **Landing**: `safeNext` fallback `/dashboard` on sign-in and the 2FA
  step; the wordmark link; `/projects`, `/sessions` and `/ideas`
  (top-level, old addresses) keep redirecting to the current account's
  pages.
- Browser test: the bot signs in and lands on `/dashboard`; the sections
  render; the latest session links to the session page.

## Step 2 — conversations and comments waiting

- **Unread chats**: song chats (`chatSummaryOf` over the account's songs),
  session chats (`sessionChatSummaryOf`) and project feeds
  (`projectChatFeed` read marks), as "3 conversations with new messages"
  with a jump into each, newest first.
- **Comments waiting for you**: comments on the person's own takes,
  recordings and demos since their last read, and mentions.
- No migration: every read mark exists.

## Step 3 — activity and work in progress

- **Across the account**: the last few days merged from every project
  and session: recordings added, mixes rendered, charts edited, messages
  posted; one list per account, newest first, with who and when.
- **Still rendering**: uploads whose MP3, mix, transcription or notation
  is in progress (`playback_status`, mix status, notes status), so a
  member knows why something is not there yet; links to the row.

## Step 4 — the band at a glance

- **Members active lately** and, for admins, **pending invites**
  (`listInviteCodes`).
- **Storage and seats**: the plan's usage (`accountUsage`, the limits in
  `constants/plans`) as two bars, with the nudge the notifications
  already send at the threshold, otherwise only in settings.

## Step 5 — "since your last visit" and personal touches

- `user.dashboard_seen_at` (one migration): the activity and digest
  sections count from it, and it is set when the dashboard loads.
- **Pinned items**: a member pins a song, project or session to their own
  dashboard (`dashboard_pin`, one migration).
- Practice nudges: songs nobody opened in a month, charts without a
  recording, ideas without a take.

## Later, once the parked work exists

- **Upcoming shows and set lists** (docs: the parked set-list work):
  "next show in 12 days" with the set list, at the top of the dashboard.

## Testing per step

Pure helpers in `src/lib/utils/` with tests; `data.ts` helpers mocked as
the other data tests do; a browser test per step in
`tests/e2e/dashboard.spec.ts`; the smoke route list updated with every
new route.
