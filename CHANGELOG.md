# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Releases are cut with the `/release` skill (see `.claude/skills/release/SKILL.md`).

## [Unreleased]

## [0.183.1] - 2026-10-27

### Changed

- **Latest first on a phone.** The dashboard's unread notifications come before the lists on narrow screens, where they sat below every section; on wide screens the layout is unchanged.
- **Days, not times.** Your Projects and Your Songs show the day something last changed, not the time of day.
- **Tile counts match the lists.** An account tile counts active projects and songs, so an archived project no longer makes the count exceed what the lists show.

### Technical

- `plural(n, one, many?)` (`src/lib/utils/plural.ts`) replaces three local copies. The dashboard's calls to action go to the accounts page when there is no current account to point at.

## [0.183.0] - 2026-10-27

### Added

- **What is this?** Each dashboard section heading (Your Accounts, Projects, Songs, Sessions, Ideas, Multitrack Recordings, Loops) has an info button that explains the kind of thing it lists, for someone new to it.

## [0.182.0] - 2026-10-27

### Changed

- **Your Songs says more.** Each song on the dashboard shows its stage (Writing, Arranging, Mixing or Finished) and how many stems and demos it has, after its project.
- **Go to account page.** Each account tile ends with a link to the account's page.

### Technical

- `recentSongs` also returns `stemCount` and `demoCount` (ready ones).

## [0.181.0] - 2026-10-27

### Added

- **Your Projects on the dashboard.** Above Your Songs: every project you may open across your accounts, last changed first, each with its song count (and its account, when you belong to several), with the same search, paging and an "All projects" link to a new `/projects` page: every project across your accounts with its account, song count and when it last changed, searchable and sortable. `/projects` was a redirect to the current account's projects before.

### Changed

- **Account tiles at a glance.** The tiles share a row (two across from small screens, three from wide ones) and show just the account's name (as a small monospace label, like the sidebar's headings), your role in it (Owner, Admin or Member) and its counts of projects, songs, sessions and members, each a link; the recent-work lists moved to the Your Projects, Your Songs and Your Sessions sections. The heading over them is "Your Accounts". A new account's checklist still sits in its tile.
- **More room between the columns.** The gap between the dashboard's content and sidebar grows with the screen (`lg-gap-12 xl-gap-16 2xl-gap-20`).

### Technical

- `accountCounts` also counts the account's recording sessions. `DashboardTileList.svelte` is gone. The dashboard loader fetches each account's projects, songs and sessions once (cap 500) for the sections and keeps only the counts and role for the tile. `siteRoutes.mjs` expects 200 from `/projects`. `TableSort` (`src/lib/state/tableSort.svelte.ts`) holds a sortable table's column and direction for the Projects, Songs and Sessions tables.

## [0.180.0] - 2026-10-27

### Added

- **Your Sessions on the dashboard.** Under Your Songs: every recording session across your accounts, latest day first, each under its kind, place and recording count (and its account, when you belong to several), with the same search, paging and "All sessions" link; with none, a card to record one.
- **Songs and Sessions pages.** `/songs` lists every song you may open across your accounts with its project, account, stage and when it last changed; `/sessions` every session with its kind, place, day, recordings and account. Both have a search, a filter by stage or kind, and sortable columns. The dashboard's "All songs" and "All sessions" open them (the account-bound link was misleading with several accounts). `/sessions` was a redirect to the current account's sessions before.

### Changed

- **DAW project file converter** is what the Tools widget calls Convert.

### Technical

- `recentSongs` now returns `stage`, `isFinished`, `createdAt`, `hasStem` and `hasMix` (ready stems and mixes through nested `with`), so a list can compute `songStage` without the stems. `sortRows` (`src/lib/utils/sortRows.ts`) sorts rows by a key and direction. `DashboardEntry.whenText` shows a session's day in place of a date and time. "songs" joins the reserved short-link slugs; `siteRoutes.mjs` expects 200 from `/sessions` and `/songs`.

## [0.179.0] - 2026-10-27

### Added

- **Your Songs on the dashboard.** Between the account tiles and Your Ideas: every song you may open across your accounts, last changed first, each under its project (and its account, when you belong to several), with the same search, ten-at-a-time paging and "All songs" link as the ideas; the search matches the project too. With no songs, a card points to your projects.
- **More in the sidebar.** The More widget opens with Inbox, Account settings (the current account's), Notifications and Links before the docs, feature requests and the rest.
- **User Dashboard in the account menu.** The first item of the account menu goes to the dashboard.

### Changed

- **Dashboard headings.** The page is titled "User Dashboard"; a "Your Projects & Songs" heading sits over the account tiles; Your Songs, Your Ideas, Your Multitrack Recordings and Your Loops carry the serif topic heading in Title Case, with Your Multitrack Recordings ahead of Your Loops; "New for you" is now "Latest" and, with Tools, Instruments and More, uses the small monospace section label. The widgets' links are plain links rather than dimmed ones (`link-dim` is deprecated).

### Technical

- `DashboardEntry` (`constants/dashboardLinks.ts`) is the shape of every dashboard list entry (id, title, href, when, meta); the loader builds the entries, so `DashboardIdeas`/`DashboardIdeaList` no longer take an `href` function. `filterByTitle` matches `meta` as well. `utils/dashboardMore.ts` adds the account's settings to More. The account tile fetches all of an account's songs once (cap 500) and shares them with Your Songs.

## [0.178.0] - 2026-10-27

### Changed

- **The dashboard's ideas, loops and multitrack recordings** list everything you have, newest first, ten at a time with "Showing 10 of 23" and Show more, a search by title, and an "All ideas" / "All loops" / "All multitracks" link beside the heading; the search and the link appear once there is something to search.

### Technical

- `DashboardIdeaList.svelte`; utils `filterByTitle`, `pageOf`; `DASHBOARD_IDEAS_PAGE = 10`; the dashboard loads up to 500 ideas per kind.

## [0.177.0] - 2026-10-27

### Changed

- **The dashboard laid out again** (Kevin): a tile per account comes first, listing its six most recent projects, songs and sessions side by side with "All …" links; then Your ideas, Your loops and Your multitrack recordings, each with a Record button when empty; two columns at desktop with a sidebar holding New for you and the Tools, Instruments and More widgets (Docs, Feature Requests, Report a bug, Help, Share Stem Shovel, Stem Shovel Blog). Quick actions are gone.

### Technical

- `recentRecordingSessions(accountId, n)` replaces `latestRecordingSession`; `recentUserIdeas(userId, kind, n)`; `DashboardTileList`, `DashboardWidget`; utils `dashboardTools`, `shareSite` (Web Share API, clipboard fallback).

## [0.176.0] - 2026-10-27

### Added

- **A dashboard where a signed-in person lands** (`/dashboard`; docs/dashboard-plan.md, step 1): what is new for you (the unread notifications as a line per kind and the newest five, opening each as the inbox does), quick actions (Add a recording, New song, New idea, Record a session, Tuner, Metronome), and for each account the latest session (linking to its page), the four projects and five songs touched last, plus your own newest ideas. A new account shows a getting-started checklist in place of its sections; a person with no account gets a "Start your band" card and the free tools. Sign-in and the two-factor step land there unless a page asked for somewhere else, and the wordmark goes there when signed in.

### Technical

- `data.ts` dashboard helpers `latestRecordingSession`, `recentProjects`, `recentSongs`, `accountCounts`, `recentUserIdeas`; utils `inboxDigest`, `kindLabel`, `onboardingSteps`, `formatWhen`, `accountActions`; `InboxItem.svelte` shared with the inbox; "dashboard" reserved as a short-link slug; the smoke route list knows `/dashboard`.

## [0.175.1] - 2026-10-27

### Technical

- **Packages updated** (2026-10-27): Vite+ 1.4.0 (with its Vite core alias), Svelte 5.57.3, UnoCSS 66.12, better-auth 1.7.14 and the passkey plugin, the AI SDK 7.0.154 and gateway 4.0.127, Sentry 11.9, marked 18.1.2, mediabunny 1.62.1, fallow 3.36. TypeScript stays on 6: svelte-check 4.7 declares TypeScript 5 or 6 as its peer, so version 7 (the Go compiler) waits for it. SvelteKit 3 has been in since v0.113.1; the parked "SvelteKit 3 upgrade" item is done.

## [0.175.0] - 2026-10-27

### Added

- **Viewing links for a whole session.** A session's menu on the Sessions page has "Share…" (and "Open its page"): a link opens the session on a page of its own, `/<account>/sessions/s/<id>`, with every recording in order, the player, waveform, loop and EQ, each recording's downloads and the MP3s in one zip; from it each recording's own page opens too, with a way back. Links expire, cap their uses and revoke as a recording's do. Sessions stay members-only otherwise.

### Changed

- **The session's Chat button says Chat**, like Play all and Download MP3s beside it.

### Technical

- `share_link.session_id` (migration 0103); `canViewSession`, `canViewRecording` takes the recording's `sessionId`; `recordingSessionPage`, `listSessionShareLinks`; the zip endpoint takes a session's share code and rate-limits a visitor; deleting a session or a recording now removes its share links (Turso enforces no foreign keys; an older gap).

## [0.174.0] - 2026-10-26

### Added

- **Auto EQ in the Sessions player.** The EQ panel's Auto button sets the five bands from the recording's measured sound against the curve of a typical well-mixed live recording, as a starting point you adjust from; it runs only when pressed. A recording is measured a little after its MP3 appears, older ones on the page's next visit.

### Technical

- `session_recording.spectrum` and `spectrum_started_at` (migration 0102): ten octave-band RMS levels measured by the new `session-spectrum` job (`measureSpectrum`, `utils/octaveBandLevels.ts`); `utils/autoEqFit.ts` with `constants/autoEq.ts` (target curve, limits).

## [0.173.0] - 2026-10-26

### Added

- **A session recording can be public.** Tick Public in Edit recording and anyone with its page's address can listen and download it, no viewing link needed; the row and the page show a Public tag. Recordings stay private by default.

### Technical

- `session_recording.is_public` (migration 0101); `canViewRecording` takes the recording and lets anyone in when it is public; `SessionRecordingUpdateSchema.isPublic`.

## [0.172.0] - 2026-10-26

### Changed

- **The Sessions player starts at 70% volume** instead of full.
- **The Sessions player has an output meter** beside the volume: the level after the EQ, with a peak-hold mark and a clip light that sticks until clicked.
- **The playback EQ keeps its headroom.** Boosting a band turns the overall level down by the largest boost, in the player and in Download with EQ, so a boost on a leveled recording no longer clips.

### Fixed

- **Long session recordings render again.** A show's leveling ran past the five minutes a render gets, so its MP3 never appeared; the leveling now measures with `ebur128` and applies one gain with a fast limiter, and a clipped capture is repaired with a declipper setting thirty times cheaper, so a 90-minute set fits with room to spare. A peaky set is held back rather than squashed: at most 3 dB of its loudest peaks go into the limiter.

### Technical

- `bun run db:rerender-sessions` lists a stage's session recordings and, with `--apply <id…>` or `--apply --all`, clears their MP3 so the Sessions page renders them again on the current code (leveled); it prints the database host first, since varlock resolves another stage's secrets when the named stage's are absent (FINDINGS.md).

## [0.171.0] - 2026-10-26

### Added

- **The playback EQ belongs to the session.** The Sessions player remembers the EQ per session on the device and brings it back when that session plays again; another session plays with its own EQ or none. A member can **Save for everyone**, which stores the EQ with the session for the whole band (the device's own setting still wins when there is one), **Reset** falls back to the band's EQ or flat, and **Remove shared EQ** clears the band's.
- **Five EQ bands with movable centers.** Low, low mid, mid, high mid and high, each −12..+12 dB with its center on a log-scale slider within the band's range, for open-air show recordings whose trouble is not at a fixed frequency.
- **Download with EQ.** The EQ panel saves the current recording as an MP3 with the EQ applied, encoded by the server; the stored files are untouched.
- **Session recordings are leveled.** A recording's MP3 is normalized to EBU R128 (−14 LUFS, a −1 dBTP true-peak ceiling, one gain across the set) as it is made, so a show and a practice play at a comparable loudness with headroom left for a phone's mono speaker; a capture that hit full scale is declipped first. Sets over 45 minutes get the peak limiter alone. The original file stays as uploaded.

### Fixed

- **The Idea Recorder opens faster.** Its function was never kept warm (it is bundled apart from the other pages by its 300 s limit, and the warm cron reached only the default function), so every visit after an idle spell paid a cold start of several seconds; a second cron now warms it, which the project and song pages share. Its page load also runs its thirteen independent reads together instead of one after another.

### Changed

- **The Sessions page's toolbar sits in the title row** at desktop widths, at the right of the page's words, as the Idea Recorder's does; **Add a recording** is styled as the recorder's New Idea button (a plus, filled from sm).

### Technical

- Session renditions: `channelStats` (one `astats` pass for the fold, the peaks and the length), `adeclip` at ≥ −0.1 dBFS, two-pass `loudnorm` (`utils/loudnorm.ts`, `constants/sessionLoudness.ts`), `alimiter` for sets over `LEVEL_MAX_SECONDS`; `utils/ffmpegDuration.ts`.
- `recording_session.eq` (migration 0100, JSON of `PlaybackEqSchema`); `saveSessionEq`; `GET /api/sessions/[id]/eq.mp3` (ffmpeg through `server/eqRender.ts`, `maxDuration: 300`); the EQ's contract layer in `constants/playbackEq.ts`, `val/PlaybackEqSchema.ts`, `utils/normalizePlaybackEq.ts`, `utils/playbackEqStorage.ts` (per-session keys), `utils/eqSearchParams.ts`, `utils/eqFilterGraph.ts`; `scripts/migration-status.ts` tells a connection failure from a missing table.
- `GET /api/warm/long` (`maxDuration: 300`, so the adapter bundles it with the Idea Recorder) and its `vercel.json` cron every five minutes; the route table and the indexability audit know the path (docs/environment.md "Cold starts", FINDINGS.md).

## [0.170.0] - 2026-10-26

### Changed

- **The Sessions page's player floats.** Nothing shows until a recording plays; the player then opens in a draggable panel (its place and size remembered on the device). Close it and it tucks into a Player button in the toolbar, lit while playing, which brings it back; on a phone the same panel docks at the top of the page while something plays. The filter row now starts with the search box, with the Practice/Show filters beside it, nothing pushed to the right (Kevin, 2026-10-26).

## [0.169.0] - 2026-10-26

### Added

- **A playback EQ on the session player.** The EQ button on the Sessions page's player (and a recording's own page) opens a high-pass for rumble and low, mid and high bands, −12 to +12 dB, with Reset; lit while it changes the sound. Playback only, remembered on the device; the files and downloads are untouched (Kevin, 2026-10-26).

- **A toolbar on the Sessions page.** Two buttons at the top for members: "Add a recording" opens the upload form in a panel (the session, kind, place, input device and name, and the files; it closes as the upload starts), and "Record a session" opens the recorder. The form no longer sits open on the page (Kevin, 2026-10-26).
- **Input device on session recordings.** Each recording can say what captured it, from a fixed list (Soundboard, Field Recording Rig, Phone, Handheld Recorder (non-phone), Other), beside the free-text field now called "Input name" (was "Input source"). Set on the upload form, the Session Recorder's save or a recording's Edit; shown by the title as "Phone · Kevin's phone", searched, and used in the download's name when there is no input name (Kevin, 2026-10-26).

### Technical

- **Migration 0099** adds `session_recording.device` (text, default ""); `SESSION_DEVICE_VALUES` and `SessionDeviceSchema` in `val/SessionRecordingSchema.ts`, labels in `constants/sessionRecordings.ts`, `utils/recordingInputText.ts` and `utils/sessionDeviceOf.ts`.
- **The session player runs through Web Audio** once the first play gives the context its gesture: `lib/audio/playbackEq.ts` (the graph), `utils/playbackEqStorage.ts` (the device's settings), `SessionEqPanel.svelte`; the `<audio>` element is `crossorigin="anonymous"` (both Blob stores answer every request with an open CORS header) and `playThroughSilentSwitch()` is asked on play so iOS's ring/silent switch does not mute it (docs/uploads-and-blob.md "The playback EQ"). The sessions browser test covers the EQ.
- **docs/notifications.md** lists the `session` kind (every member but the uploader; emailed under the Demos opt-in).

## [0.168.2] - 2026-10-26

### Added

- **A Live Session Recordings link on the Projects page.** The account's Projects page links to its sessions in the upper right, for members (Kevin, 2026-10-26).

### Fixed

- **A session recording owed its MP3 gets it on the sessions page.** The page's load schedules the render for a recording whose MP3 was never made, failed over an hour ago, or was cleared by `db:left-only`, as a song's page does for demos and the Idea Recorder for takes (`sessionsWantingPlayback`). Before, one whose post after the upload was lost showed "MP3 rendering…" for good.

### Technical

- **`db:left-only` survives the firewall.** A post to `/api/jobs` from outside the site is answered 429 by the firewall's bot protection; the script now clears the status all the same, carries on with the other tables, and says which page to open to start the render (FINDINGS 2026-10-26).

## [0.168.1] - 2026-10-26

### Fixed

- **A session recorded on a phone plays on both sides.** A phone's microphone is one channel, and on iPhones the session recorder (and the Idea Recorder's Sources mode) wrote it to the left channel of the file only. The recorders now fill both channels from a mono input, and a recording already made that way is mended when its MP3 is rendered: the one channel with sound becomes a mono MP3 that plays on both sides (the file as uploaded is kept).

### Technical

- **The stereo fill** (`static/worklets/stereo-fill.js`, `lib/audio/stereoFill.ts`): an `AudioWorkletNode` before a recording destination that copies the left channel into the right until the right carries a sample. **`leftOnly`** in `transcode.ts`: an `astats` pass before the MP3 of a demo, a take or a session recording; the right channel at or under −80 dBFS with sound on the left (`utils/silentRightChannel.ts`) renders `pan=mono|c0=c0`. **`bun run db:left-only [-- --apply [--origin <url>]]`** (`scripts/left-only-renditions.ts`) finds a stage's left-only MP3s and re-renders them through the jobs function (docs/uploads-and-blob.md "The stereo fill"; FINDINGS.md 2026-10-26).

## [0.168.0] - 2026-10-25

### Fixed

- **Text-to-Beat and Text-to-Progression no longer hang.** A request to the model that gets no answer gives up after a minute and says so, and a momentary gateway failure is retried once.
- **A notification email is never sent twice.** The digest and the single notification emails record the send before it goes, so a hiccup after sending cannot repeat it.
- **A converter or export that stalls now fails cleanly** with a message instead of running until the server stops it.

### Technical

- **Phase 2 of the Effect plan, steps 2, 3 and 5** (docs/effect-adoption.md; Phase 2 complete): `notes.ts`, `notationPdf.ts` and `dawprojectExport.ts` run inside Effect behind their unchanged exports (the notes lock released on failure or interruption, the tonalness decodes two at a time, the TensorFlow child killed on timeout, the PDF status set to failed with the error still reaching Sentry, the export's user-facing failure text covering a timeout; each with a behavior test); the jobs route's `switch` is a table (`runners.ts`, `satisfies Record<JobKind, …>` plus a test that every kind has a runner) and the dispatch to `/api/jobs` runs under a 10 s timeout with one retry on a 5xx, a network error or a timeout (`effect/dispatch.ts`); the digest and the per-notification email mark first and undo on failure (`effect/mail.ts`: `markedUntilFailure`, a 20 s send timeout, never a retry), and the digest stops starting people after 240 s with the remainder logged for the next run, each person under 30 s, a failure reported and skipped.
- **Phase 2 of the Effect plan, steps 1, 4 and 6** (docs/effect-adoption.md): the pilot's shared pieces move to `src/lib/server/effect/` (`JobTuning`, `tempDir`, `downloadToFile` with its transient rule, `runFfmpeg` and `streamFfmpeg`; the `Ffmpeg` service gains `stream`, the `Db` service a generic `call(op, run)` for the long tail); `transcode.ts` runs inside Effect behind its unchanged exports (every claim an `acquireRelease` that fails the row on failure or interruption, every ffmpeg under the timeout that kills it, downloads retried when transient, `transcodeToMp3` split into `replaceTakeSource`, `flacTake` and `trimTake`); an `Ai` service (`effect/ai.ts`) with a 60 s timeout and one transport retry on 5xx, 429, a network error or a timeout, and `askForJson`, the one parse-retry loop that `textToBeat.ts` and `textToChords.ts` now share (162 → 86 and 102 → 61 lines; `complete` no longer exported); `moveBlob` reads a file under 256 MB whole so the SDK can retry a failed part, as `copyBlob` does. Tests: `blobIo.test.ts`, `ai.test.ts` (nine cases over a fake layer and a stubbed `fetch`), the ffmpeg stream killed on timeout; the transcode tests kept with their `child_process` fake. The Vercel tracer's glob trap is in FINDINGS.md.

## [0.167.0] - 2026-10-25

### Changed

- **Built with** lists what it left out: Swamp, Bun, WebCodecs, mediabunny and LAME, the Origin Private File System, Cache Storage, the Screen Wake Lock, client-zip, the DAW project formats, Vercel's firewall, and the CI tools by name.

### Fixed

- **One failed file no longer holds up its batch.** When a stem, demo, mix or recording fails to render, the others in the same batch still get their playback renditions, mixes and notes.

### Technical

- **The Effect pilot** (docs/effect-adoption.md Phase 1, Kevin: start the pilot): `effect@4.0.6` bundled into the server (`ssr.noExternal`); `src/lib/server/effect/` holds the typed errors (`BlobError`, `DbError`, `FfmpegError`), the services `BlobStore`, `Db` and `Ffmpeg` with live layers over the existing modules (interrupting the ffmpeg run kills the child), the runtime and `runJob`; the mix job (`mix.ts`) runs inside it behind its unchanged exports: the temp dir is a scoped resource, downloads run three at a time and a failure interrupts the rest, a transient read (5xx, a connection error) retries with jittered backoff, ffmpeg runs under a timeout that kills it, the claim is released on failure and interruption. Tests provide fake layers (two `vi.mock`s instead of four) and cover the 404, the 503-then-200, the hanging ffmpeg, the failing `setSongMix` and the refused claim; a service test kills a real ffmpeg. Measurements and the v4 names in docs/effect-adoption.md and FINDINGS.md.
- **Jobs harden, plainly** (docs/effect-adoption.md Phase 0): a failure in background work or in one id of a job reaches Sentry tagged with the job kind (`src/lib/server/reportError.ts`, `background(work, { kind, count })`), one id's failure no longer drops the rest of its batch (`eachJob` drives every serial job loop; in `renderStems` the other stems' mixes and notes still follow), and every ffmpeg run is bounded by `FFMPEG_TIMEOUT_MS` (240 s, SIGTERM on expiry; the peaks `spawn` by hand). Tests for both helpers; the transcode tests that expected a throw now expect a report.
- **Effect assessed** (Kevin: would the Effect library harden the code?): docs/effect-adoption.md weighs Effect 4 against what the server does today and proposes a Phase 0 of plain fixes (background failures to Sentry, per-id isolation in the job loops, ffmpeg timeouts) and a pilot on the mix job behind its unchanged signature, with the evaluation criteria and a kill switch; remote functions, components and valibot stay as they are.
- **The $effect audit** (Kevin: are our effects defensible?): the 31 `$effect` calls were reviewed; 26 are real side effects (canvas redraws, the audio engines and woof-editor, timers, the popover API, localStorage, teardowns) and now each carries a `// why $effect: <which>` comment on the line before it; 5 were derived state in an effect and are gone: SongDocPanel's `savedVersion` is a writable `$derived(version)`, its unused `dirty` prop and its `saving` prop went (the song page derives `docSaving` from the shared remote form), the accounts page opens its panel from an attachment, the projects page clears its form in `onMount`. The Fallow rule covers `$effect.root` and carries the ladder in its message, but stays a warning: Fallow 3.34 reports a Svelte file's `$effect` calls on the wrong line (one per file), so its suppressions cannot carry the rationale; `src/lib/utils/effectCallSites.ts` with a test that fails `bun run test` on a call without one; `bun run audit:effects` lists every site; the Swamp type `@kevin/repo-audit` (behavior `repo`, workflow `code-audit`) runs it and keeps the count (docs/testing.md "The $effect audit").

## [0.166.0] - 2026-10-25

### Fixed

- **The practice amp, the Studio and the converter are indexable** (the audit's first catch): each carried a search title and description and the converter sat in the sitemap, yet all three were noindex, disallowed by robots.txt and matched by the deployment's header rule; they now join every list like the other instrument pages. The Releases page has a meta description, and a doc or blog page no longer renders two `<h1>`s (the body's opening `# Title` is dropped, since the page shows the title itself).

### Technical

- **An indexability audit**, `bun run audit:seo` (scripts/seo-audit.ts): every route, anonymously, against its intent from `isIndexablePath`: the sitemap, robots.txt (longest-match semantics), the live `X-Robots-Tag` and vercel.json's rule, the robots meta, title, description, one h1 and `lang`; sitemap and robots.txt outliers, duplicate titles; exceptions documented in the shared route list (`scripts/lib/siteRoutes.mjs`, which the smoke script now shares); `SEO_BASE` for production; part of the release's post-deploy checks (docs/security.md "Indexability audit").
- **Swamp** (swamp-club.com) joins the repo for repeatable audits: `extensions/behaviors/site_audit.ts` is a behavior type whose `seo` and `smoke` methods run `audit:seo` and `smoke:urls` (which gained `--json`) against a stage and keep typed results; `models/@kevin/site-audit/` has a definition per stage and the `site-audit` workflow runs both in parallel and asserts they came back clean (`bunx varlock run -- swamp workflow run site-audit --input stage=production`; docs/security.md "Through Swamp"). The swamp-club.com credential comes from 1Password through varlock (`SWAMP_API_KEY`, `SWAMP_SIGNIN_TOKEN`); `extensions/` and `.swamp/` are outside tsconfig, Oxlint and Fallow.

## [0.165.1] - 2026-10-25

### Fixed

- **The Dawn features page is crawlable**: it was in the sitemap but still carried the app's noindex header and was disallowed by robots.txt; both lists now allow it (docs/security.md names the four lists a public page joins).

## [0.165.0] - 2026-10-25

### Added

- **Mentions in the chat** (Kevin): type **@** and a name in a song's or a session's chat to mention one of the people on it; they are told in their inbox (and by email under the comments-and-chat setting) even when the rest of the conversation is folded for them, and the name is highlighted in the message.
- **Reactions in the chat** (Kevin): six emoji (👍 ❤️ 😂 🔥 🎸 👀) on any message, one tap each, with a count and who reacted; nobody is notified of a reaction.
- **A chat feed on the project page** (Kevin): a **Chat** button in the project's header opens every song's recent messages in one time-ordered feed, each with its song's name linking to that song's chat, where replies happen; the button carries a dot while any song has unread messages.
- **Dawn's features, listed** (Kevin): `/multitrack-recorder/features` is a grid of what the Studio has, feature by feature, beside the DAWproject format, Reaper and Sandyne, with room for more DAWs; linked from the Studio page's help.

### Technical

- Migration 0098: `chat_reaction` (scope, message, user, emoji; unique per message, user and emoji) and `mentions` (json ids) on `chat_message` and `session_chat_message`; `toggleChatReaction` bumps the message's `updated_at` so `chatSince` carries it; `notifyMention` (kind `mention`, not folded; the chat's folded item skips the mentioned); `chatPeople` query and `mentionsIn`; `projectChat.ts`/`projectChat.remote.ts`/`ProjectChatFeed.svelte` (docs/chat.md); `dawnFeatures.ts` data-driven columns.

## [0.164.0] - 2026-10-25

### Added

- **Short links for songs, projects and Studio songs** (Kevin): a link button in a song page's and a project page's header, and **Copy link to this song** in the Studio's song menu, copy a short link (shvl.me in production) to the page, as the instruments' Copy link already did; a song's or project's link is the page without its query, so a viewing code never travels along.
- **A Links page** (Kevin): **Links** under your settings lists every short link you have made, where it goes, how often and when last it was opened, with **Copy** and **Revoke** on each.
- **Custom addresses for short links** (Kevin): a word of your choosing in place of the random code (`shvl.me/our-set-list`), three to thirty-two lowercase letters, digits and hyphens, first come first served, for a link you will say aloud; the old code stops working once a link has one.

### Fixed

- **Page titles on the settings, admin, docs, blog, invite and password pages** were plain body text: their heading carried a class the stylesheet never defined; they now use the page heading every other page has (`app-page-heading`).

### Technical

- `copyShortLink` (utils) over `shortenShareLink`, whose kind is now `ShortLinkKind` with a new `studio` kind; `/settings/links`, `listShortLinksOf`, `revokeShortLink`, `setShortLinkSlug`, `ShortLinkSlugSchema` and `SHORT_LINK_RESERVED_SLUGS`; the resolver, the short-domain route and `resolveShortLink` take a code or a slug (a slug lowercased after an exact miss). No migration: a slug lives in the `code` column.

## [0.163.0] - 2026-10-25

### Changed

- **The Studio plays recordings from this device's copy without holding them in memory.** A recording the browser has a copy of plays streamed, a quarter of a second at a time, through a worklet voice fed from disk, so a long session's memory is no longer its decoded recordings; only what a tool needs (a warped clip's source, a sampler's recording, a render) is decoded, and released again when the song grows large. A song a browser has not opened before loads and plays as it did. The song menu's readout shows what is on disk beside what is in memory.

### Technical

- `stream-voice` worklet (static/worklets/stream-voice.js), `StreamVoice`, `Resampler` (a 16-tap Kaiser-windowed sinc when the copy's rate differs from the context's), the cache worker's `stat` and `readRange` with sliced writes (`createSliceQueue`); the engine's `onDisk` sources, `ensureReferenced` decoding only what cannot stream, `releaseUnused` dropping on-disk referenced buffers; diagnostics `streaming` and `starved` (docs/multitrack-recorder.md "Scale and structure", FINDINGS.md).

## [0.162.0] - 2026-10-25

### Added

- **The Studio keeps a copy of each recording on this device.** A song's recordings are cached decoded in the browser's private storage once they have loaded, so reopening a song or bringing back an unloaded recording reads from disk instead of fetching it again, and a fresh take is on disk before its upload finishes. The cache keeps itself within a budget and drops what was used longest ago; the song menu's "Clear the copies on this device" shows what it holds and clears it, and deleting a song drops its copies.

## [0.161.0] - 2026-10-24

### Added

- **Gain lines travel in DAWproject files too.** A clip's gain line goes out as the clip's own gain automation and comes back when a DAWproject is imported; a looped clip keeps its loop and the line replays each pass.

### Changed

- **Undo in the Studio holds its history as changes, not copies.** Each step of the hundred-deep history keeps only what the edit changed, so a long session with hundreds of clips and lines undoes as before at a fraction of the memory.
- **The Studio starts a song's clips as they come due** rather than all at once at play, so a song with hundreds of clips starts and reschedules without a pause.

## [0.160.0] - 2026-10-24

### Added

- **Gain lines travel to Reaper.** A clip's gain line goes out in a Reaper project as the take's volume envelope and comes back in when the project is imported, so a ride on a clip survives the round trip (proved against Reaper's own render). A looped clip with a gain line goes out as one item per pass. DAWproject files still leave it out.

### Fixed

- **Section bands no longer cover the bar numbers.** While a song has sections, the ruler's bar numbers sit in their own row under the bands.

## [0.159.0] - 2026-10-24

### Added

- **Changes on a version** in the song's text history. Beside View on each earlier version of the chart, lyrics, notes or your own note, **Changes** shows what differs between that version and the text as it is now, line by line, with long unchanged stretches folded away.

### Changed

- **Studio recordings are stored as FLAC.** A take or bounce the Studio uploads as WAV is converted to FLAC by the jobs function once it is saved, the same samples at about half the size, so a song's recordings count half as much toward the account's storage. Songs recorded before this are converted the next time they are opened. Playback, exports and downloads are unchanged.

### Technical

- `utils/diffLines.ts`; `DocHistoryPanel` target `current`.
- `flacStudioSources` in transcode.ts, `scheduleStudioFlac` ("studio-flac" job), scheduled by the source-ready route and by `studioSong` for sources still WAV; the engine's `refreshUrls` hook refetches a source whose file moved (docs/multitrack-recorder.md "Scale and structure").

## [0.158.0] - 2026-10-24

### Added

- **Clip gain lines in Dawn.** The clip bar's **Gain line** button draws a line over the selected clip: press the clip to add a point, drag points up or down and along the grid (Shift for free timing), nudge with the arrow keys, remove one with Delete or Alt-click, or **Clear line**. The line rides a phrase without automating the track's fader; it plays, bounces and consolidates with the clip, and a revision's Compare names it. Project exports to Reaper and DAWproject leave it out for now.
- **Range edits in Dawn.** Alt-drag along the ruler selects a stretch of time across every track, drawn on the ruler and down the lanes. Delete clears what it covers, Shift+Delete cuts it out and closes the gap (markers, tempo and meter changes, automation and the loop move with the clips), and Insert or Shift+I pushes everything after it later by its length. A Range bar under the timeline offers the same plus Loop range; every edit is one undo step.
- **The song-check says when the chart read looks wrong.** A score whose key signature calls for sharps or flats while no chord symbol prints one has usually lost its accidentals on the way to a PDF; the AI card now says so in amber, carries the reader's own notes about unreadable pages, and a doubtful answer is no longer applied to the song's settings on its own after an upload.
- **What the AI read, for correction.** A PDF or image score's reading (one line per measure) is kept with the file and shown from the score's ⋯ menu on the Chart tab's notation view: fix a key, a chord or a measure number and save, and the song-check reads your text from then on; Read again starts the AI over. The AI card's warning links straight to it.
- **Sections on the ruler in Dawn.** Add section in the transport, or S on a focused marker, makes a marker open a section: a named band along the ruler to the next section. A Reaper export writes sections as regions and reads regions back as sections. With the timeline focused, `,` and `.` jump to the previous and next marker.

### Technical

- `gainEnvelope` on a clip (`StudioGainPointSchema`, 256 points); `utils/gainEnvelope.ts`; `envelopeNode` in the engine, `setClipGainEnvelope`; the timeline's `envelope` prop (docs/multitrack-recorder.md "Clip gain envelopes").
- Migration 0097: `song_pdf.chart_read` and `chart_read_edited`; `chartReadOfFile`, `saveChartRead`, `readChartOfScore`, `chartCacheKey`; remote functions `readChartOfFile`, `saveChartReadOfFile`, `clearChartReadOfFile` (docs/audio-engine.md "The chart read is stored").
- `deleteRange`/`insertRange` on the engine over `utils/rangeDelete.ts`, `utils/rangeInsert.ts`, `utils/clipPart.ts` and `utils/shiftTimes.ts`; the timeline's `range` prop; `StudioMarker.section`, the engine's `sections` getter and `toggleMarkerSection` (docs/multitrack-recorder.md "Range edits", "Sections"). D4 of docs/dawn-daw-plan.md is complete.

## [0.157.0] - 2026-10-24

### Added

- **The chord chart is the AI's chart too.** Ask AI to check, and the AI read of Scan stems and of an upload, now work on a song whose only chart is the one written in the Chart tab: the model reads the band's sections and chords beside the mix and places the keys from the chords each part moves through. A score still comes first when the song has one, and the tempo and time signature still come from the chart only where it marks them ("120 bpm", "3/4").

- **Takes travel with the files.** A clip's other takes go out in a Reaper project as the item's other takes and in a DAWproject as lanes inside the clip, and come back as the clip's takes when such a file is opened, their audio brought along; a Reaper project's other takes used to be left behind and reported.

### Technical

- `scoreForAi` returns `{kind: "chart", markdown, title}` as its third choice; `loadScore` passes it as text with `chord: true` and `CHART_NOTE` describes it; `chartStatedAnswer` also reads "120 bpm" and "♩ = 120" (docs/audio-engine.md "The chord chart as the AI's chart").
- The export packs every take's source beside the chosen one (`sourceFiles`); `interop:rpp` proves a take against Reaper. Reaper: `TAKE` blocks written and read for `alternates`; DAWproject: a `Clip` holding `Lanes` of take clips, read back as alternates, other shapes flattened (`readAudioContent` factored out) (docs/multitrack-recorder.md "Takes in the files").

## [0.156.0] - 2026-10-24

### Changed

- **Ask AI to check reads the chart.** The check now needs the song's score (a MusicXML file, or a PDF or image marked as notation) and is disabled without one, with the reason in its title. The model reads the chart while the mix plays and reports the keys and where each begins, and the time signature and tempo marks the chart states; where the chart marks neither, the song's detected tempo and time signature stay. The model is no longer asked to confirm or correct the detector, and the song's key is never sent to it: an external study found that, listening blind, it read the candidates back and guessed tempo from a genre prior, while with the chart it was exact.
- **No more automatic second listen on a close-call time signature**, for the same reason: it could only echo the detector's guess.
- **The AI cards no longer show a "% sure" figure**, which read 100% on invented answers.

### Technical

- `askAiAboutSong` answers 412 without a score; `askAiAboutMix(mixUrl, settings, who, score)` takes `{tempo, meter}` and a required score; `AiAnswer.meter` is nullable and `confidence` is gone from both answers; `utils/chartStatedAnswer.ts` keeps tempo and meter only where the chart's summary states them (docs/audio-engine.md "The song-check reads the chart").

## [0.155.0] - 2026-10-24

### Added

- **Pre-fader sends.** Each send in a track's mixer strip has a small **post**/**pre** button: pre-fader, the send ignores the fader and the inserts, so a reverb or a monitor mix can hold steady while the track rides.
- **A delay that follows the tempo.** The delay insert's new **Sync** picks a note value (a sixteenth to a half note, triplets and dotted values too) and its time then comes from the song's tempo, through tempo changes and ramps; Free gives the slider back.

### Fixed

- **A folder's own clips come along.** Opening a Reaper project whose folder track holds items, or a DAWproject whose group has clips of its own, used to drop them. They now land on a track named after the folder, in its color, inside the group.

### Technical

- `sync` on a delay insert's settings (`DELAY_SYNCS`); `utils/withSyncedDelays.ts`; the delay stage exposes `time` for the engine's scheduling (`#scheduleLanes`, `#tempoSteps`); `setSendPre` (docs/multitrack-recorder.md "Pre-fader sends and a tempo-synced delay").

## [0.154.0] - 2026-10-23

### Added

- **Mono tracks in Dawn.** A **Mono** switch on a track's mixer strip sums it to one channel and pans it as a point source: at full level on both sides at center, the far side falling away as it turns, the way the stem player plays a mono stem. The inserts process one channel. An empty track follows its input when you arm it, so a bass on one channel of the line in records onto a mono track by itself; a one-channel stem opened in Dawn is mono from the start, and a DAWproject carries the setting both ways.

### Technical

- `mono` on `StudioTrack`; `stripGraph.ts` swaps its pan stage live (`setMono`; a ConstantSourceNode's offset through two WaveShapers as the pan parameter); `utils/monoPan.ts` holds the law the stem player's engine used (docs/multitrack-recorder.md "Mono tracks").

## [0.153.0] - 2026-10-23

### Added

- **Groups on the Stage.** A group is a puck of its own on Dawn's Stage, a rounded square with a folder that sets the whole group's level and pan; fold it from its strip or with F and its tracks hide behind it, the same fold as the timeline's.
- **Pucks that share a spot fan out.** Tracks at the same pan and level sit in a ring around the spot, each one easy to grab, the first named with a count of the rest.

### Changed

- **Shorter send lists in the mixer.** A track's strip shows a knob only for the sends in use, and **Add send** offers the other buses, groups left out. A new send starts at −6 dB.
- **Bigger songs in Dawn.** A song holds up to 64 tracks (from 16), 1000 clips (from 400) and 32 buses and groups (from 16); the amount of audio in memory, which the readout shows, is the real limit. Opening a song's stems in Dawn now says when stems were left behind instead of dropping them quietly.

### Technical

- `MAX_STUDIO_TRACKS = 64`, `MAX_STUDIO_CLIPS = 1000`, `MAX_STUDIO_BUSES = 32`; `importSongStemsIntoStudio` and `studioFromStems` return `left`. `MixerModel.groups` (`MixerGroup`) with `setGroupGain`/`setGroupPan`/`toggleGroupMute`/`toggleGroupCollapsed`, filled by Dawn's model; `utils/spreadPucks.ts` lays clustered pucks in rings (docs/multitrack-recorder.md "The Stage: group pucks and clusters").

## [0.152.0] - 2026-10-23

### Added

- **Groups (folder tracks).** A group is a row in Dawn's timeline that holds tracks and folds them away: **Add group** makes one, a track joins from the **Group** entry of its menu, and the row has a fold arrow, a name, a mute for everything under it and a sketch of the clips below. A group is also a bus in the mixer, where any bus's strip has a **Group** switch and an **Output** that sends a bus into another, so groups nest. A stem of a group holds everything under it. Reaper folders, Live groups and the nested tracks of a Bitwig or Cubase DAWproject come in as groups, nested as they were, and go back out the same way. Since groups are buses, a song now holds sixteen buses and groups together, up from eight.
- **Clips that follow the tempo.** **Follow tempo** in the clip bar keeps a clip's place and length in beats when the song's tempo changes: a MIDI clip's notes and expression move with the grid (through ramps too), and an audio clip is stretched to fit, pitch kept. New MIDI clips follow the tempo from the start, whether recorded, drawn, dropped as a MIDI file or brought in from a Live set, a Reaper project, a DAWproject or a MIDI file; a recording keeps its seconds unless you turn it on. One undo takes a tempo edit and the clips it moved back together.

### Technical

- `anchor` on `StudioClip` (`CLIP_ANCHORS`); `utils/retimeClip.ts` carries a clip from one grid to another; the engine's `#retimeAnchored` inside every tempo edit (docs/multitrack-recorder.md "Beats-anchored clips").
- `folder` and `output` on `StudioBus`; `utils/studioRows.ts` (the timeline's rows) and `utils/busDescendants.ts`; `StudioGroupRow.svelte`; the graphs route buses to buses; the Reaper and DAWproject writers nest folders (docs/multitrack-recorder.md "Folder tracks").

## [0.151.0] - 2026-10-23

### Added

- **Time signatures over any note in Dawn.** **Beat note** beside Beats per bar in the Timing menu is the time signature's bottom number (2, 4, 8 or 16), and a meter change on the ruler takes one too, so 6/8 is six eighths a bar and the click, grid, snap and quantize count them. The tempo stays in quarter notes a minute, as a DAW counts it. The bottom number travels in every file both ways: DAWproject, Reaper, Live sets, MIDI files and Sandyne; the Audacity labels print it.
- **Any color on a track or bus.** The tint swatches in a track's menu and a bus's strip end in an **Any color** swatch over your browser's color picker. A DAW's own track colors now come in as they were from a DAWproject, a Reaper project or a Live set, instead of the nearest of Dawn's tints or none.
- **Song details in the DAWproject.** The file's metadata carries the song's notes as its comment, and an export into a song's files adds the song page's performers as the artist, its composers (or songwriter line) as the songwriter, its producers, the year it was written and its public address. An imported DAWproject's metadata (artist, album, songwriter, producer, year, genre, copyright, website, comment…) lands in the song's notes, a line each, and the converter's summary shows the meter as the file had it.

### Technical

- `beatUnit` on `StudioArrangement` and `StudioMeterChange` (`BEAT_UNITS`), `beatUnit` on a BarGrid's meters with `beatTempoAt`/`beatUnitAt` in audio/measures.ts (a meter without a unit keeps the stem player's convention), `studioGrid` naming the unit on every meter, `studioChanges` scaling the tempo between the player's beat-of-the-bottom-number and Dawn's quarter notes; `colour` taking a `#rrggbb` beside a tint id, `stemTintHex` passing one through, `utils/colourOfHex.ts` for the readers (`nearestStemTint` and the Live hue match removed); `val/DawprojectMetadataSchema.ts`, `metadata` on the DAWproject writer's input and the reader's result, `songExportMetadata` in data.ts (docs/multitrack-recorder.md "Time-signature denominators", "Track colors", "Song metadata in the files").
- Reaper stores the quarter-note tempo whatever the signature's bottom number and shows the "divided" one in its transport (FINDINGS.md), so Dawn's tempo goes into an `.rpp` unscaled.

## [0.150.0] - 2026-10-23

### Added

- **Stretch a clip without a new recording in Dawn.** Type the tempo a recording was made at into **Clip tempo** in the clip bar and press **Fit to song**: the clip plays at the song's tempo, pitch kept, its label reading "×1.14" or so; **Unwarp** puts it back. Alt-drag a clip's right edge to stretch it by hand, or warp a drifting performance beat by beat: Alt-click a clip to add a warp marker, drag the marker so the hit under it lands on the grid, Delete to remove it. The stretch travels: a DAWproject carries it as warps, a Reaper project as the take's play rate or stretch markers, and a Live set's warped clips come in warped instead of at the file's own speed.
- **Tempo ramps in Dawn.** A tempo change can be reached gradually, a ritardando or an accelerando: tick **Ramp** in the Timing menu when adding one, or press **R** on a change's flag on the ruler (its flag then reads "⟋60"). The grid, the snap, the click and the quantize follow the tempo as it moves. A DAWproject and a Live set bring their ramps in and a DAWproject takes them out; a Reaper project both ways too, with Reaper's own curve (linear in seconds, where the others run linear over the beats) kept as such; the session bundle's MIDI file carries a ramp as a tempo event per beat.

### Technical

- `warp` on `StudioClip` (points from the clip's content seconds to the file's; the offset, duration and loop in warped seconds), `audio/warp.ts` for the map, its marker operations and its WSOLA rendering, `addWarpPoint`/`moveWarpPoint`/`removeWarpPoint` on the engine, `workers/warp.worker.ts` + `audio/warpRenderer.ts` to make it off the page, `clipBufferOf` on the engine and `ExportEngine`, `mixClipsToChannels`' source lookup given the clip; DAWproject `Warps` both ways, Reaper `PLAYRATE`/`SM` both ways, Live warp markers read (docs/multitrack-recorder.md "Warping a clip").
- `ramp?: "time" | "beats"` on `StudioTempoChange` (`TEMPO_CURVES`); `audio/measures.ts` integrates ramps through tempo segments (`secondsAfterBeats` and `tempoSteadyAcross` exported); `utils/tempoPointsOf.ts`, `utils/tempoPointsGrid.ts` (writers), `utils/tempoPointsToSeconds.ts` (readers); the Reaper writer stamps the time signature only on the first point and where the meter changes (docs/multitrack-recorder.md "Tempo ramps", FINDINGS.md).

## [0.149.0] - 2026-10-23

### Added

- **Mute lanes, and lanes for the buses and the master, in Dawn.** Every track's automation picker offers **Mute**: a switch drawn in steps, held from each point to the next, beside the track's own mute button. Under the tracks the timeline now shows a thin row per bus and one for the master, each with an **A** button opening its own lane (volume, mute and its inserts; a bus's pan too), and the master fader writes to its lane at the playhead like a track's knob. A DAWproject carries the mute, send and master lanes both ways, a Reaper project writes and reads them as its own envelopes, and a Live set's track on/off, send and master envelopes come in as lanes.

- **Expression lanes on MIDI clips in Dawn.** A notes clip carries the sustain pedal, the modulation wheel and the other controllers, the pitch bend and the key pressure as lanes of points, each held until the next. The pedal, the wheels and the bend you move while recording land in the clip (the sustain pedal from the panel and the computer keyboard too), play back through the piano (the bend glides every voice sounding, two semitones each way), render into a mix, and go out in the clip's MIDI file, the session bundle, a DAWproject (as Bitwig's own expression points) and a Reaper project. A MIDI file's, a DAWproject's and a Reaper project's controllers come in as lanes. The piano roll's **Lane** menu adds a lane under the notes (Sustain, Modulation, Expression, Breath, Foot pedal, Brightness, Pitch bend, Pressure): click to add a point, drag it, double-click to remove it; the lane's name and a remove button sit beside it.

### Technical

- `mute` as an automation key and `masterAutomation` on the arrangement (`StudioSchema`); `AutomationRange.step` with `hold` in `automationValueAt`/`scheduleAutomation` (`STEP_RAMP`), `laneTransfer` in `utils/automationLanes.ts`, a `mute` gain in `stripGraph.ts`; `scripts/interop/rpp.ts` probes the mute, receive and master envelopes by render (docs/multitrack-recorder.md "Wider automation").
- `lanes?: StudioClipLane[]` on `StudioClip` (`src/lib/constants/studioLanes.ts`, `utils/clipLaneEvents.ts`, `utils/lanesFromEvents.ts`, `utils/sliceLanes.ts`); the instrument adapter's optional `onControl` and `scheduleControl` and a `controls` argument to `renderOffline`; `bend?(semitones, at)` on `SynthVoice` and `SampledVoice`; `PianoEngine.onControl`, `setBend`, `scheduleControl`; `audio/midi.ts` keeps controllers, bends and pressure in `summary.controls`; `midiFile.ts` `midiControl`, `midiPitchBend`, `midiPressure`, `midiLaneEvent` (docs/multitrack-recorder.md "Expression lanes").

## [0.148.0] - 2026-10-22

### Added

- **Clip looping in Dawn.** **Loop** in the clip bar (Shift+L) makes what a clip shows its loop; drag its right edge out past the recording's end and the loop plays round to fill it, drawn pass by pass with a faint line at each join and a ↻ beside the name. A looped clip splits, moves, comps, consolidates, reverses, exports and diffs as what it plays. The DAWproject carries the loop (`loopStart`/`loopEnd`) both ways, a Reaper project writes it as a looping section (or an item per pass) and reads one back, a Sandyne project gets a content per pass, and a Live set's looped clips come in as looped clips instead of copies.

- **Switched-off clips in Dawn.** **Off** in the clip bar (Shift+M) keeps a clip on the timeline, dimmed and marked off, playing nothing, so a part can be tried without and kept. A muted item in a Reaper project, a switched-off clip in a DAWproject and a deactivated clip in a Live set now come in switched off instead of being left out, and the DAWproject and Reaper exports carry the switch.

### Technical

- `muted?: boolean` on `StudioClip`; skipped by the scheduler, the offline renders, `mixClipsToChannels`, `clipCrossfades`, the session bundle and the Sandyne writer; `setClipMuted` on the engine.
- `loop: { start, end }` on `StudioClip` (content seconds, `MIN_CLIP_LOOP_SECONDS`), unrolled through `utils/clipSegments.ts` (`clipSegments`, `clipContentTime`) by the engine's scheduler and offline render, `mixClipsToChannels`, `clipNoteEvents`, the timeline's canvases, the piano roll, `splitClipAt`, the clip tools, the export trim and the writers; `setClipLoop` on the engine; `trimmedClip` unbounded on the right for a looped clip.

## [0.147.0] - 2026-10-22

### Added

- **MIDI files into the converter** (docs/dawproject-plan.md, roadmap step 5): `utils/midiRead.ts` reads a Standard MIDI File through `utils/unpackProject.ts` (format "midi") as a project of MIDI tracks (a format 1 file's tracks, a format 0 file's channels, channel 10 as drums), each with one clip of its notes, with the tempo map, meters, key and its changes and markers from the conductor and the conductor's name as the title; controllers and the like are counted in the report. `audio/midi.ts` keeps each note's track, the names by track, the track count and the skipped events. The convert page accepts `.mid` and `.midi`; tests/e2e/convert.spec.ts covers a file to a DAWproject.

## [0.146.0] - 2026-10-22

### Added

- **Ableton Live sets into the converter and Dawn** (docs/dawproject-plan.md, roadmap step 4): `utils/alsRead.ts` reads a Live set (`.als`, Live 9 to 12, gzipped or plain XML, bare or as a zip of the project folder) through `utils/unpackProject.ts` (format "ableton"): the tracks with their levels, pans, mutes, colors (the nearest of Dawn's tints by hue; `constants/liveColors.ts` is Live's palette) and volume and pan envelopes, groups and returns as buses with the routing and sends, the arrangement's clips in seconds through the tempo map (looped clips unrolled, warped clips' offsets through their warp markers, unwarped clips' in seconds), the MIDI clips' notes, the tempo and its automation as steps, the time signature and its changes, the locators as markers; devices, session clips, deactivated and transposed clips reported. The convert page and Dawn's import accept `.als`; tests/als holds a Live 12.2.1 set (MIT) as the corpus, tests/e2e/convert.spec.ts the round trip to a DAWproject.

## [0.145.0] - 2026-10-22

### Added

- **Convert step 3, Reaper projects both ways.** Drop a Reaper `.rpp` (with its media files beside it, or a zip of the project folder) on the converter and it reads as a DAWproject does: the tracks with their levels, pans, mutes, solos, colors and volume and pan envelopes, folders as buses and receives as sends, each item's active take as a clip with its offset, volume and fades over its file, MIDI items' notes through the tempo map, the tempo envelope with its time signatures, markers and regions, the project notes and sample rate. And the Export panel, on the converter and in Dawn, writes **A Reaper project**: an `.rpp` with a `media` folder that Reaper opens as it is, a folder per bus, a receive per send, envelopes, MIDI items, the tempo map and markers. Dawn's **Import audio, MIDI or a project…** opens a Reaper project as a new song. `bun run interop:rpp` has Reaper 7.82 open a written project and judges every part of it through Reaper's own API, then reads Reaper's re-saved file back.

## [0.144.0] - 2026-10-22

### Added

- **Convert step 2, the lint and repack.** The DAWproject (and the Sandyne project) comes out with its audio as WAV at the chosen bit depth, and a **Trim** option writes one recording per clip holding only what the clip plays, so nothing a clip skips travels. The page lists what the reader read into Dawn's ways under "Normalized" (a float-noise tempo, times in beats, levels in decibels, colors with an alpha byte or outside the palette, an empty folder, a missing time signature, tempo ramps, aliases), beside "Not carried across"; Dawn's import notification says the same.

## [0.143.1] - 2026-10-22

### Technical

- **User docs merge: the page always wins.** `db:update-docs --merge` compares lines with trailing whitespace and non-breaking spaces ignored (the app's editor adds them), and a region changed on both sides keeps the page's text with a note of what the seed wanted; the seed's other changes still land and nothing blocks. `--strict` restores the conflict markers (docs/user-docs.md).
- **Packages updated** (2026-10-22): vite-plus 1.3.0 (with its Vite core alias; Dependabot's advisory on Vitest serving files its deny list should hide, dev server and Vitest only), SvelteKit 3.1, adapter-vercel 7.0.1, Svelte tooling, UnoCSS 66.11, Playwright 1.64, Vitest coverage 5.0.5, better-auth 1.7.12 and the passkey plugin, the AI SDK and gateway, Sentry 11.8, Vercel Blob 2.8.2, Drizzle ORM 0.45.4 and kit 0.31.11, marked 18.1, nanoid 6.0.2, mediabunny 1.62, isomorphic-dompurify 4.6, resend 6.34, varlock 1.23, devalue 6, fallow 3.34, cspell 10.4, jsdom 30.1, woof-editor 0.3.0. TypeScript stays on 6: version 7 is the Go compiler, a separate check against svelte-check and tsgolint.

## [0.143.0] - 2026-10-21

### Added

- **A song's sample rate.** Dawn's Timing menu sets the song's sample rate (44.1, 48, 88.2 or 96 kHz; 48 kHz unless changed): the mix, the stems, the DAWproject, the session bundle and the Sandyne project come out at it on every machine, where before they took the device's rate (44.1 kHz on one Mac, 48 on another). Recording and playback stay at the device's rate; a source at another rate is resampled on the way out. Importing a file at a rate other than the song's says so, and the library shows the odd file's rate. The converter shows the project's rate and lets the viewer choose another.
- **Stems know their sample rate.** An upload reads the rate from the file's header and keeps it; the stem's menu shows it, and the player marks a stem whose rate differs from the others', since a DAW session built from the downloads would hold one file at an odd rate. Stems play in time whatever their rates, as before.
- **Convert, a free DAW project converter at `/convert`** (Tools menu): drop a DAWproject from Bitwig Studio, Cubase, Studio One or Nuendo and get it back as a mix, a stem per track or bus, a clean DAWproject, the session bundle for Logic Pro, Pro Tools, Ableton Live, Audacity and Reaper, or a Sandyne project, with 24- or 16-bit WAV or MP3 and normalization. Everything happens in the browser; nothing is uploaded, and it works signed out.

### Technical

- Migration 0096: `stem.sample_rate` (nullable; filled at upload by `utils/audioSampleRate.ts`, a header reader for WAV, AIFF, FLAC, MP3, MP4 and Ogg, or by the stem-metadata job from ffmpeg's probe line). `StudioArrangement.sampleRate` (optional picklist of `STUDIO_SAMPLE_RATES`); `StudioEngine.render` and `convertEngine` render at `songSampleRate(arrangement)`, and `ExportEngine.resample` (the browser's `OfflineAudioContext`, `audio/resampleBuffer.ts`) brings the project files' and the bundle's clips to the song's rate. `POST /api/stems/[id]/ready` takes an optional `sampleRate`.
- `utils/unpackDawproject.ts` opens a `.dawproject` archive (or a bare `project.xml`) for Dawn's import and the converter alike; `audio/convertEngine.ts` is an export engine over a read file (faders, pans, buses, the master, no inserts); `ExportEngine.renders` lets an engine decline a track (a MIDI track with no instrument gets no stem).

## [0.142.0] - 2026-10-21

### Added

- **A Sandyne project in Dawn's Export panel** for the free Sandyne DAW (Linux, Mac and Windows): the `.sand` file with the tracks, clips, fades, levels, pans and the MIDI parts' notes, and the recordings beside it, a folder in the export's zip. Sandyne opens it directly.

### Fixed

- **A bar of root and fifth is a power chord** in the detected chords (and the hint the chart draft gets): the matcher now counts a chord tone that does not sound against the chord, so "D5" wins over "D" or "Dsus4" when no third, second or fourth is there, and a minor seventh that does not sound no longer makes an "m7". On stem-bench Study 1's 440 seeded bars the matcher goes from 397 to 423 right, the power-chord song from 2 to 19 of 28, with no bar lost.
- **The chart draft tries once more** when the model returns an empty completion, which one song reproduced; the empty attempt is logged.

### Technical

- **Two more DAW checks on the VM** (docs/testing.md): `bun run interop:audacity` has Ubuntu's Audacity read the session bundle's stems and label track over its scripting pipe under Xvfb, and `bun run interop:sandyne` has Sandyne's headless `inspect` and `rendertracks` read the Sandyne project; both judge the result against the fixture arrangement (`scripts/interop/fixture.ts`, shared with the bundle).

## [0.141.0] - 2026-10-21

### Added

- **A session bundle in Dawn's Export panel** for the DAWs that read no project file (Logic Pro, Pro Tools, Ableton Live, Audacity, Reaper, GarageBand): every clip as a 24-bit Broadcast WAV stamped with its position in the song, a stem per track from zero, a MIDI file with the tempo map, time signatures, key signatures, markers and the MIDI tracks' notes, an Audacity label track and a README with each DAW's import path. A folder inside the export's zip, or its own zip.
- **A DAWproject now carries the markers and the tempo and meter changes** (as Bitwig's tempo and time-signature automation), which Dawn's reader already took back.
- **Open a DAWproject in Dawn.** Import a `.dawproject` from Bitwig,
  Studio One, Cubase or Nuendo (or Dawn's own export) as a new song:
  tracks, groups as buses, levels, routing, sends, clips with fades, MIDI
  notes, volume and pan automation, tempo and meter changes, markers; what
  cannot come across is named when the song opens. Read against real
  Bitwig Studio exports, the format's reference suite and converters'
  files; alias clips play their original.
- **Save a DAWproject to a song.** From Dawn's Send block: the archive is
  made in the background (FLAC, or 24- or 16-bit WAV inside), kept in the
  song's attachments with a permanent link, and announced with a
  notification; Open in Dawn on the attachment brings it back as a new
  song. A DAWproject uploaded as an attachment opens the same way.

### Technical

- **The DAWproject writer is validated against Bitwig's schemas** (`tests/dawproject/`, libxml2-wasm in the unit tests), which found its `Channel` children out of the schema's sequence; the order is fixed. `parseMidi` keeps tempo, meter, key, marker and track-name events; `encodeWav24` takes extra chunks; `utils/bext.ts` writes and reads the Broadcast Wave chunk.
- **DAW checks on the VM** (`scripts/interop`, docs/testing.md): `bun run interop:bundle` writes a fixture bundle and DAWproject, `bun run interop:reaper` has Reaper read it headless under Xvfb and judges the result. The plan for the targets (Cubase, Audacity, Logic, Ableton Live, Pro Tools, Sandyne) and the Linux, Mac and Windows tiers is docs/daw-interop-plan.md.
- **The DAWproject reader was read against** Bitwig 5.3 exports, Bitwig's reference suite, converters' Cubase-bound files and DawVert conversions (docs/dawproject-plan.md); OpenJDK and DawVert live on the VM for it.

## [0.140.1] - 2026-10-21

### Changed

- **The home page's Dawn demo needs no setup**: with no Dawn song chosen,
  it plays the featured song's stems straight from the song.

### Technical

- `src/lib/utils/studioFromStems.ts`: a Dawn song from a player manifest's
  stems, the renditions as sources. The smoke expects `/multitrack-recorder`
  to answer 200 signed out.

## [0.140.0] - 2026-10-20

### Added

- **Dawn without an account.** The multitrack recorder works signed out,
  like the looper: the song lives in the browser (IndexedDB), comes back on
  the next visit, and is offered into the account after sign-in or sign-up
  ("Save to your account" uploads the recordings and keeps the arrangement
  and notes). A member of no editing account gets the same.
- **MP3 export in Dawn.** Download mix (MP3) in the Song actions menu, and
  MP3 as a format in Export, encoded in the browser at 192 kbps.
- **A Dawn demo on the home page**, after the Idea Recorder: a Dawn song
  chosen on the admin's home settings (one click loads the featured song's
  stems), in the real engine; visitors play, mute, solo, drag and loop.
- **Key in Dawn, and the changes both ways.** The Timing menu holds the
  song's key and adds key changes at the playhead, shown as flags on the
  ruler beside the tempo's and the meter's, with the key at the playhead on
  the screen. Stems loaded from a song bring the song's tempo, time
  signature and key; New song with these tracks, in the Send to a song
  block, makes a fresh song with Dawn's.

### Fixed

- **Dawn's Song actions menu ran off the bottom of a short window**, its last
  items out of reach; it now stops at the window's edge and scrolls.
- **Opening a song's stems in Dawn could stop partway** when a file copy
  between storage stores was retried; the copy is buffered, or made by the
  store itself.
- **A song loaded over one still decoding** left Dawn's "loading" count below
  zero.

### Technical

- `@mediabunny/mp3-encoder` (LAME in WASM) behind `src/lib/audio/encodeMp3.ts`,
  loaded on first use; `ExportOptions.format`.
- `src/lib/audio/studioLocal.ts`: the browser-kept Dawn song; `StudioQueue`
  keeps, adopts and discards the `local` idea's sources; the engine decodes a
  blob handed with a source view (the CSP refuses `blob:` URLs).
- `homeStudioSongId` app setting, `homeStudioSong`,
  `makeHomeStudioSongFromFeatured`; the chosen song cannot be deleted (409).
- `src/lib/utils/studioChanges.ts` both ways; `createSongWithChanges`;
  `StudioKeyChangeSchema`.
- `copyBlob` uses the SDK's server-side copy within a store.
- Browser tests: `newStudioSong` fixture; the home demo's song survives
  `deleteStudioSongs`.

## [0.139.0] - 2026-10-20

### Added

- **Loop playback for session recordings.** Drag across the playing
  recording's waveform to select a stretch and press Loop (or L) to play
  it round, as the stem player does; Escape clears the selection, and with
  nothing selected Loop repeats the whole recording.
- **A low cut on the session recorder.** A high-pass filter before the
  recorder, on at 80 Hz by default (60, 120 or Off), remembered per
  browser, for the rumble in a room recording.
- **Stems from songs in the looper.** Import a stem, in the Load menu: pick
  a song and press a stem to bring it in as a layer, cut to the loop's
  length from the start you set.
- **Looping a part in the Idea Recorder.** Drag across the take's waveform
  to select a stretch; with looping on it plays round, as the stem player
  does. Escape clears the selection.
- **A song's stems into Dawn.** Open stems in Dawn, in the song page's
  Downloads menu, or Load the song's stems in Dawn's Send to a song block:
  each stem on a track of a new Dawn song named after the song, with the
  stems' levels, pans and tints and the song's tempo.
- **The Sessions page's title and intro are editable** by a system admin,
  as the tool pages' are (the `sessions-page` copy doc; `/sessions` goes to
  the current account's sessions).
- **An account switch on the Projects page**, beside the title, for
  someone in more than one account: pick another and land on its projects.

### Changed

- **The account menu drops Projects and Sessions**, which the Music menu
  holds; it keeps the inbox, the account's settings and the rest.
- **The footer names the tools in full**: Lark Idea Recorder, Whirl Looper,
  Ember Practice Amp, Dawn Multitrack Studio.
- **The footer's Music row** is Projects, Sessions and Ideas, as the menu;
  the Session Recorder stays in its Tools row.

### Fixed

- **A long clip's waveform in Dawn** came up blank on a Retina screen,
  its canvas past what the GPU shows. Each clip now draws only the window
  in view, at the screen's own resolution, following the scroll and the
  zoom.
- **Stems with no stored length or waveform** (an older upload
  path) imported into Dawn as clips one millisecond long with nothing to
  draw. The engine now runs such a clip to its source's end once the
  source decodes, and the song page has the jobs function measure those
  stems, so the stem player draws them too.

## [0.138.1] - 2026-10-20

### Changed

- **An uploaded MP3 is kept as its own rendition.** A demo or a session
  recording uploaded as an MP3 is no longer re-encoded to a second MP3: it
  is stored once and played as it came, with its waveform measured from it.
- **The Tools menu and the footer know the sessions.** Session Recorder
  joins the Tools menu for a member, and the footer carries a Music row
  (Projects, Sessions, Session Recorder, Ideas) above the instruments and
  the tools, as the header's menus do.

## [0.138.0] - 2026-10-19

### Added

- **A session recorder.** Record a session on the Sessions page: one stereo
  recording of the room from the microphone or the line in, with a level
  meter, a clock, playback of the take, a title, the session and the input
  source, saved straight into the sessions (`SessionRecorder.svelte`,
  `/sessions/record`). Compressed by default, lossless on request.
- **Share links on session recordings.** A recording's menu has Share…
  with viewing links that open the recording on a page of its own
  (`/sessions/r/<id>`, with the waveform, player and downloads), for
  someone outside the band; nothing else of the sessions. Migration 0095.
- **Session recordings tied to a song.** A recording's Edit picks the song it
  records, from the account's songs; the row links to it and the song's
  page lists its session recordings under the Demos view. Migration 0094.
- **An input source on session recordings** ("Kevin's phone", "Room mic"):
  typed for a batch on the upload form or on a recording's Edit, shown by
  the title, searched, and in the download's name (`set-2-room-mic.mp3`).
  Migration 0093.
- **Session downloads named after the title.** A recording's MP3 and its
  original download as the title slugified (`battle-of-the-bands-set-2.mp3`),
  the zip's entries numbered the same way (`recordingDownloadName`).
- **Sessions review: waveforms, comments, a chat and a search.** Every
  session recording and every demo now has a waveform, measured on the
  server when the MP3 renders (`measurePeaks`: ffmpeg's PCM streamed into
  `pcm16Peaks`, so an hour's recording costs the phone nothing; a
  `demo-peaks` / `session-peaks` job measures the ones rendered before).
  Comments on a recording (`session_comment`) and on a demo
  (`comment.demo_id`), with positions as time, from the waveform's
  ⌘-click menu or the heading's pencil, shown as bubbles on the waveform
  and in a list (`RecordingReview`), edited and deleted by their author
  (or an admin), with notifications that open the recording or the demo.
  A chat per session (`session_chat_message`, `session_chat_read`) through
  the song chat's components and remote functions, which now take a song
  or a session. A search over sessions, recordings and comments on the
  Sessions page; `?recording=`, `?session=…&open=chat` and `?demo=` deep
  links. Migration 0092. docs/uploads-and-blob.md "Sessions review",
  docs/chat.md "Sessions"; the user guides for sessions, chat and comments.

- **Dawn: automation** (docs/dawn-daw-plan.md, phase D1 of the online
  DAW plan). Every audio track carries lanes of breakpoints for its
  volume, pan and reverb send: the A button in the header opens one
  under the clips with a picker for the parameter
  (`AutomationLane.svelte`, reusable over any breakpoint list: click to
  add, drag to move, double-click to remove, keys to nudge and delete,
  one `onchange` per gesture); the knobs read the curve as the playhead
  passes and turning one writes a point at the playhead; the engine
  schedules each lane onto its AudioParam per pass
  (`scheduleAutomation`, sample-accurate ramps) through a new gain node
  after the fader, settles them on stop, seek and undo, and the bounce
  applies them from zero. Schema `StudioAutomationSchema` (optional, the
  arrangement's version unchanged), utils `automationValueAt`,
  `editAutomation`, `scheduleAutomation`, each tested; the Stage's pucks
  follow automated values. Browser test `studio-automation.spec.ts`.
- **Dawn: routing and the mixer** (docs/dawn-daw-plan.md, phase D2).
  A track's fixed three effects become a chain of **inserts** of six
  kinds (EQ, compressor, tone, delay, reverb, limiter; `InsertPanel.svelte`,
  reusable for a track, a bus or the master: add, bypass, reorder,
  remove, a slider per parameter), **buses** that tracks route or send
  to, each with its own inserts, pan, fader, mute, tint and meter, and
  **master inserts**; a **Mixer** view beside Tracks and Stage
  (`MixerConsole.svelte`: a strip per track, bus and master with output
  picker, inserts, send knobs, pan, fader, mute, solo and meter; Add bus
  and Remove bus). Automation lanes now cover sends and every
  automatable insert parameter (keys `send:<bus>`,
  `insert:<id>:<param>`), on buses too; the lane picker lists what the
  strip can automate. Every strip is one `stripGraph.ts` the live
  context and the bounce build alike (`insertChain.ts`, `mixStages.ts`,
  `constants/studioInserts.ts`); old arrangements' `fx` reads as
  inserts (`insertsFromFx`) and the schema's version stays 1. Unit,
  component and browser tests (`studio-mixer.spec.ts`); the user guide
  gains "Inserts on a track" and "The mixer".
- **Dawn: export and delivery** (docs/dawn-daw-plan.md, phase D3).
  **Export…** in the song's menu renders the mix, a stem per track, a
  stem per bus and a DAWproject (Bitwig's open interchange format:
  tracks, clips, fades, levels, sends, notes and the volume and pan
  lanes, with the recordings inside), as 24- or 16-bit WAV, normalized
  to −14 LUFS and −1 dBTP when asked, one zip or one download each,
  each file's loudness reported. The loudness is measured in the
  browser to ITU-R BS.1770-4 (`measureLoudness`: K-weighting, gating,
  true peak; `normalizationGain`), and the master meter gained a
  short-term LUFS readout from a K-weighted tap. MIDI tracks now render
  offline through their instruments' own voices (`midiRender.ts`), so a
  bounce, a demo and the stems need no real-time pass first; the engine's
  `render` takes a track or a bus as its target and keeps a second of
  tail. `studioExport.ts`, `ExportPanel.svelte`, `dawproject.ts`,
  `zipBlobs.ts`, `clipNoteEvents.ts`, each tested; browser spec
  `studio-export.spec.ts`; the user guide's "Bouncing and exporting".
- **Dawn: editing depth** (docs/dawn-daw-plan.md, phase D4).
  Overlapping clips crossfade equal power (`clipCrossfades`,
  `fadeCurve`: curves scheduled on the clip's gain, live and in the
  bounce) and a clip's own fades take a shape, linear or equal power.
  **Comping**: the T button opens a lane per alternate take under the
  clip; a swipe over a lane takes that region from the take, the clip
  split into crossfaded pieces (`compRegion`, `compFromTake`).
  **Multi-selection** with Shift-click: a selection drags together,
  Delete removes it all, Shift+Delete ripples the gap closed
  (`rippleDelete`, `moveClips`, `deleteClips`). The clip bar gained
  **Reverse**, **Normalize** and **Consolidate** (the selected clips of
  a track rendered into one recording with gains, fades and crossfades
  baked in; `mixClipsToChannels`), each a new recording uploaded like an
  import. **Markers** on the ruler: M or the flag button adds one at
  the playhead, click jumps, double-click renames, Delete removes;
  saved with the song (`StudioMarkerSchema`, up to 64). Unit tests on
  every util, component tests on the timeline, browser spec
  `studio-editing.spec.ts`; the user guide's "Editing clips", "Takes
  and comping" and "Markers".
- **Dawn: time** (docs/dawn-daw-plan.md, phase D5). A **tempo map**:
  tempo and meter changes at any second from the Timing menu, flags on
  the ruler (click to jump, double-click to edit, Delete to remove),
  with the bars, grid snap, readout, click and count-in following them,
  on the stem player's bars-and-beats machinery (`studioGrid`,
  `snapToBeat`, `measures.ts`; changes queued with the notes restart
  the click on the beat). **Swing and humanize** on a MIDI track from
  the clip bar, applied as the notes play and in a bounce, the stored
  notes untouched (`swingNotes`). **Detect tempo** on a recording sets
  the song's tempo from its onsets (`detectTempo`). **Stretch and
  pitch**: Length × and Pitch make a new recording of a clip at another
  length or pitch, a pure WSOLA (`stretchChannels`, `resampleChannels`).
  Schema `StudioTempoChangeSchema`, `StudioMeterChangeSchema`, a track's
  `swing` and `humanize`; browser spec `studio-time.spec.ts`; the user
  guide's "Tempo and meter".
- **Dawn: instruments and the library** (docs/dawn-daw-plan.md, phase
  D6). An **instrument registry** (`instruments.ts`): one adapter per
  instrument, the engine's branches now lookups. A **Sampler**
  instrument: a MIDI track plays one of the song's recordings across the
  keys, with root note, attack, release and loop on the track
  (`StudioSamplerSchema`, `samplerVoice.ts`), offline in a bounce too.
  Three synth presets on the piano: Brass, Strings, Bell. A **Library**
  panel of the song's recordings, each to hear alone and to drag onto a
  track as a clip (`LibraryPanel.svelte`, the timeline's drop). Tests on
  the registry, the voice, the panel and the drop; browser spec
  `studio-library.spec.ts`; the user guide's "The sampler" and "The
  library".
- **Dawn: collaboration** (docs/dawn-daw-plan.md, phase D7). **Share
  with the band** opens a song to every editor of the account (it lists
  in their Recordings panel as "the band's", with a notification linking
  to it); the creator alone shares, stops sharing and deletes. A save from
  another browser makes the next save here reload the latest rather than
  overwrite it. **Comments** on a song, pinned to the playhead: a
  thread panel, dots on the ruler that seek, notifications to the
  creator and the thread. **Compare** on a revision says what it
  differs in from the song now (`diffArrangements`). Browser spec
  `studio-collab.spec.ts` with two pages on one song; the user guide's
  "Working together".
- **Dawn: scale and structure** (docs/dawn-daw-plan.md, phase D8).
  Recordings decode on demand: a song opens with only what it plays
  decoded, the rest cold on the server until a clip, a take, the sampler
  or the library asks (`ensureSource`), and what nothing plays is
  unloaded past the memory line or from the song's menu
  (`releaseUnused`). **Freeze track** renders a track through its
  inserts into one recording that stands in for its clips, fader and pan
  still live; **Unfreeze** restores them. The engine's live graph is its
  own module (`studioGraph.ts`) and the page's autosave another
  (`studioPersistence.svelte.ts`: the debounce, serialized saves, the
  base revision and the conflict hand-off), each tested. Browser spec
  `studio-scale.spec.ts`; the user guide's "Freezing a track" and
  "Limits".

### Fixed

- **A WebM, CAF or AMR file uploaded as a session recording was
  refused as "not audio" by the ready check, which knew only the older
  signatures (`startsLikeAudio`); the session recorder's own takes hit it.
- **A strip with no inserts was silent (the insert
  chain never wired its input to its output for an empty list), so every
  track without an insert played nothing through the D2 graph, live and
  in a bounce. Caught by the export spec; `insertChain.test.ts` now
  covers the wiring over a stand-in context.

### Technical

- **Migrations 0091 to 0095**: `studio_comment` and `idea.shared` (Dawn,
  D7); `session_comment`, `session_chat_message`, `session_chat_read`,
  `comment.demo_id`, and `peaks`, `duration_seconds` and
  `peaks_started_at` on `demo` and `session_recording` (0092);
  `session_recording.source` (0093) and `.song_id` (0094);
  `share_link.recording_id` (0095). Run `bun run db:migrate` (or
  `db:migrate:steps`) on each stage before deploying.
- **Jobs**: `demo-peaks` and `session-peaks` measure waveforms the
  renders made before this version; the transcode measures them with
  every new MP3.
- **The plan**: `docs/dawn-daw-plan.md`, eight phases from automation to
  routing and a mixer, export, comping, the tempo map and stretch,
  instruments and plugins, collaboration, and scale.
- **FINDINGS.md** at the repo root: gotchas and insights about packages,
  browser APIs and tools, backfilled from the project's history; the
  working agreement asks for an entry whenever one surfaces.

## [0.137.0] - 2026-10-18

### Added

- **Sessions are the unit now** (Kevin): a session is one practice or one
  show, made of its recordings, named by the band ("Battle of the Bands")
  or called after its place and day; it starts on a day and may run into
  the next (a show past midnight), never further. An upload is dated by
  the file's own clock (`file.lastModified`), not the upload's, and joins
  the session of that day (or the day before's) of the same kind, or a
  new one of that day; or a chosen session. Recordings move between the
  sessions of their day and the day before from their Edit, or into a
  new one named there; a session's menu adds a second session of the
  same day (an afternoon set and the evening show). Tables
  `recording_session` and `session_recording` (migrations 0089, which
  sorts the existing recordings into sessions by day, kind and place,
  and 0090).
- **A player, a playlist and a zip** on the Sessions page: the project
  page's player (`SessionPlayer.svelte`) with a queue, Play all on a
  session and play on a row, previous and next, Space and Home; each
  recording gets an MP3 rendition in the jobs function (`session-playback`,
  the demo's transcode) for playback and **Download MP3s**, a zip of the
  session's rendered MP3s numbered in order, streamed file by file
  (`/api/recording-sessions/[id]/mp3.zip`). The native audio elements are
  gone.
- **A notification when a recording is added**: every member of the
  account but the uploader, kind `session`, coalesced per session, reaching
  email under the demos opt-in and the digest.

### Technical

- **`db:migrate:steps`** (`scripts/migrate-steps.ts`): drizzle-kit's
  migrate one statement at a time with the same journal rows, for when
  Turso answers 502 to the batch it sends (migrations 0089 and 0090 on
  staging and production, 2026-10-18).

## [0.136.0] - 2026-10-18

### Added

- **Sessions: the band's practice and show recordings** (Kevin: an area
  for members to upload practice recordings and others to browse and
  download; shows too, tagged by kind). `/[account]/sessions`, in the
  account menu, for members: upload one or more audio files as a
  practice or a show with the day and the place, browse them by day
  (All / Practice / Show), play each in the browser as uploaded, download
  the original, edit the title, kind, day, place and notes, delete. One
  table, `session_recording` (migration 0088), under the account alone;
  the demo's upload flow without the rendition, the file's first bytes
  checked for audio at ready; counts toward storage. User doc
  `sessions` (new; `db:seed-docs` adds it). No notification yet.

## [0.135.1] - 2026-10-17

### Fixed

- **The count-in hands off cleanly** (Kevin: a pause between the count-in
  and the track). Streamed, the click's clock was unknown until the
  worklet's first report, so the song's own "one" at the hand-off was
  never scheduled and the entry sounded like a hole; the engine now says
  where streamed playback will start and the click plans on it. The
  count-in's beats are the song's grid leading up to its entry
  (`countInBeats`), so from mid-bar or from before bar 1 the "one" is
  the song's own; and a small drift of the clock no longer drops queued
  clicks.

### Changed

- **The readout counts the count-in down**: −1 | 4, −1 | 3, −1 | 2,
  −1 | 1 (−2 | 4 … for the first of two bars), then the song's own bars.

## [0.135.0] - 2026-10-17

### Added

- **Loop playback in the stem player** (Kevin). Click a section on the
  timeline row to select it: the stretch is highlighted across every
  row (the waveforms, the MIDI rolls and the comments row), and the
  playhead goes to its start; click it again, or press Escape, to clear
  it. A Loop button in the transport (or L) loops the selection, or the
  whole song when nothing is selected. A drag across any waveform
  selects a stretch by hand. Buffered, the loop's seam is sample-exact:
  playback runs in passes, the next queued at the exact moment the
  current one ends (`#passes` in `engine.svelte.ts`); streamed, the
  turn is a seek with a short gap. Browser test `loop.spec.ts`.
- **A count-in for the click** (Kevin: configurable, a bar by default).
  With the click on, Play counts in one, two or four bars at the tempo
  in force before the stems start; "No count-in" starts at once. The
  choice sits beside the click's level and is remembered per browser.
  The engine gained a `prelude` the click sets, which `play()` honors
  and `pause` cancels.

## [0.134.0] - 2026-10-17

### Added

- **A click in the stem player** (Kevin: a metronome in sync with the
  stems, easy to turn on from the player, only when the song's tempo is
  defined). A Click button beside the readout, shown only when the song
  has a tempo and a time signature, plays a metronome on the stem
  engine's own clock: `StemClick` (`stemClick.svelte.ts`) schedules each
  beat at the context time the engine says that song second sounds
  (`engine.clockAt`), from the grid's beat lines (`nextBeatAt` in
  `measures.ts`, through tempo and meter changes, bars accented), and
  re-plans from the playhead after a seek or a pause. A level knob sits
  beside the button while it is on (remembered per browser; on/off is
  not). The click is outside the master and the mix downloads. Browser
  test `click.spec.ts`.

## [0.133.0] - 2026-10-16

### Added

- **The Stage: a visual mixer on the stem player and Dawn**
  (docs/visual-mixer.md, phase 1). A Tracks / Stage switch turns the
  rows (or Dawn's lanes) into a field where every track is a numbered
  puck in its tint, left to right its pan, up its heard level (the fader
  plus the track's own loudness from its stored peaks, so a quiet take
  sits below a hot one). A drag sets level and pan at once, Shift keeps
  one axis, a double-click centers the pan (Alt: unity), the arrow keys
  nudge a focused puck and M / S mute and solo it; the strip under the
  stage carries the selected track's name, M, S, ⋯ menu and readouts.
  The pucks' halos breathe with each track's RMS, a bar shows which way
  the mix leans, and the master meter sits beside it. One component
  (`MixerStage.svelte`) over a `MixerModel` adapter for either engine;
  the view is remembered per browser; nothing about the mix changes
  with the view. The meters gained an RMS beside the peak (buffered
  from the analyser, streamed from the worklet). Dawn's track menu moved
  into `StudioTrackMenu.svelte` so the lanes and the strip share it.
- **Undo for mix moves** (Kevin: undo must cover the Stage). The stem
  player keeps an undo stack of its faders, pans, mutes, solos and
  master, one step per gesture (a drag, a knob turn, a held key;
  `utils/mixHistory.ts`): ⌘Z and ⌘⇧Z from anywhere but a text field,
  and Undo / Redo buttons in the Stage's strip. In Dawn the same moves,
  and the effects sliders, now join the arrangement's undo history, so
  its Undo button and ⌘Z step through edits and mix moves alike (they
  recorded no step before).

## [0.132.1] - 2026-10-16

### Fixed

- **The home page demo's stem menu opens on the top layer**, as the
  song page's has since 0.131.0: the demo player kept its own
  `<details>` dropdown, which the next row covered. It is the same
  ContextMenu popover now (`SongPlayerDemo.svelte`).

## [0.132.0] - 2026-10-16

### Changed

- **American spelling in copy** (Kevin): `bun run spell:us`
  (`scripts/american-spelling.ts`, the table in
  `src/lib/utils/americanSpelling.ts`) finds UK spellings where a user
  could read them (strings and comments in code, markup text and label
  attributes, prose in the docs) and `--apply` rewrites them, case kept;
  identifiers, keys, props, classes, paths and single lowercase-word
  strings are never touched. 230 lines corrected; the chord player's
  new dropdown reads Color.
- **Each renamed page's heading pairs the name with the words**: Lark
  Idea Recorder, Dawn Multitrack Recorder, Ember Practice Amp, Whirl
  Looper, Palette Chord Player (the copy docs' seed titles; the browser
  titles follow without repeating the words).
- **The Chord Player is Palette**, the brand name in the footer and the
  page's heading, and its "Chord Palette" dropdown is **Color** now, so
  the two do not collide. The Instruments menu keeps saying Chord Player,
  the title is "Palette Chord Player | Free Online Circle of Fifths", and
  the address stays `/chord-player` (the vanity domains fifths.app and
  chordplayer.dev land there as before). The code keeps its names.
- **The Practice Amp is Ember and the Looper is Whirl**, the brand names
  beside Dawn and Lark. The Tools menu keeps saying Practice Amp and
  Looper, the footer says Ember and Whirl, the titles "Ember Practice Amp
  | Guitar and Bass Amp in the Browser" and "Whirl Looper | Free Online
  Loop Station"; the addresses stay `/practice-amp` and `/looper`. The
  code keeps its names.
- **The Idea Recorder is Lark**, the brand name beside Dawn (Kevin: the
  Lark idea recorder and the Dawn multitrack recorder), and the page
  moves from `/ideas/recorder` to `/idea-recorder`, with the old address
  a permanent redirect that keeps its `?song=`
  (`src/routes/ideas/recorder/+server.ts` on dev, a `vercel.json`
  redirect at the edge on a deployment; the account-scoped old routes
  redirect straight there too, in SvelteKit only, since an edge rule
  for `/:account/ideas` would catch `/docs/ideas` as well). The Tools menu and the header keep
  saying Idea Recorder, the footer says Lark, the page title "Lark Idea
  Recorder"; the device, the docs link and the user docs (slugs kept)
  follow; every link in the app points at `/idea-recorder`. The code
  keeps its names.
- **The Studio is Dawn.** The multitrack recorder is called Dawn (Kevin:
  "Studio" means too many things now; Dawn is the DAW pun in the Stem
  Shovel vein), at `/multitrack-recorder`, with `/studio` a permanent
  redirect (`src/routes/studio/+server.ts` on dev, a `vercel.json`
  redirect at the edge on a deployment). The Tools menu says
  Multitrack Recorder, the footer Dawn, the page title "Dawn Multitrack
  Recorder"; the device, its Recordings panel, the docs link, the user
  docs (slugs `studio` and `studio-page` kept, so edited copies survive),
  the built-with page and the sibling docs' mentions follow. Every
  identifier in the code keeps the working name `studio`. The brand
  names stay off the addresses (Kevin, 2026-10-16: the app is young, a
  descriptive address says what the page is), so the public pages keep
  theirs and the two members-only pages take descriptive ones.

### Fixed

- **The practice amp's Guitar / Bass toggle kept its label on hover**: the
  selected half is accent on dark, and the outline button's hover color
  turned its label accent too, so the word vanished under the pointer.
  The selected half now keeps its dark label and dims a little instead.

## [0.131.0] - 2026-10-16

### Changed

- **The Studio's tracks carry over the stem player's last few releases**
  (Kevin): the fader is a knob beside the pan knob, a level meter with a
  peak-hold mark and a clip light that sticks until clicked takes the
  line below them (and the master's, in the page's footer, is the same
  `LevelMeter`), reading peaks after the fader, effects and pan instead of
  the RMS bar; and a track can wear one of the eight stem tints from its
  ⋯ menu, on its name and its clips (the arrangement's `colour` field,
  which the schema already had). `StudioEngine.levels` and `masterLevel`
  are `MeterState`s now, with `resetClips` and `setTint`.

### Fixed

- **A stem row's ⋯ menu is no longer covered by the row below**: it is a
  `ContextMenu` now (a native popover on the top layer, anchored to the
  button) with the old body as one snippet item, as the Studio's track
  menus are; the details-based menu and its closing helper went.

## [0.130.0] - 2026-10-16

### Added

- **Stem tints.** A stem's row can wear one of eight restrained colours
  (`STEM_TINTS` in `src/lib/constants/stemTints.ts`: sea, sage, olive,
  sand, clay, rose, lilac, slate, all at one middling lightness and low
  saturation, so a tinted row is a hint against the navy, not a rainbow),
  chosen from swatches in the row's ⋯ menu by editors and shared with the
  song (`stem.tint`, migration 0087; `setStemTint`). The name and the
  waveform take the tint; nothing else does. A refreshed manifest re-tints
  in place (`StemEngine.retint`), as a rename relabels.

## [0.129.0] - 2026-10-16

### Added

- **Level meters on every stem row and on the master**, with a peak-hold
  mark and a clip light that sticks until it is clicked (Kevin). A stem's
  meter reads after its fader and pan, the master's after its fader, on
  a dB scale from −48 to unity, amber from −6 dB, red at full scale.
  Buffered, an AnalyserNode taps each stem's pan output and the master;
  streamed, the mixer worklet tracks each stem's and the sum's peak per
  quantum and reports them every 1024 samples. `nextMeter` in
  `src/lib/utils/meterLevel.ts` holds the fall, the hold and the clip
  memory; `StemEngine.levels`, `masterLevel`, `resetClips(id?)`;
  `LevelMeter.svelte`.
- **The stem fader is a knob**, beside the pan knob, so the meter sits on
  the same line as the controls (Kevin): the level shows in dB while it
  turns, a double-click returns it to unity.

## [0.128.0] - 2026-10-14

### Added

- **A pan knob on every stem row**, beside the fader, as on a Studio
  track: -1 to 1, double-click for centre, the value shown as L 50 / C /
  R 50 while it turns. Buffered, a stereo stem goes through a
  StereoPannerNode; a mono stem through a pair of gains into a merger so
  it stays at unity in both channels at centre (as it did before pans; a
  StereoPannerNode would drop it 3 dB) with the far channel falling away
  on a sine. Streamed, the mixer worklet applies the same two laws
  (`panWeights`). The pan is part of the listener's own mix kept in the
  browser (`LocalMix.pans`), of the custom mix download
  (`?stems=id:gain:pan`, ffmpeg's `pan` filter with the StereoPanner's
  stereo law, `panFilter`), and of the song's saved default mix
  (`stem.pan`, migration 0086; `DefaultMixSchema` takes `pan`; the mix
  key includes a pan only when it is off centre, so existing keys stand).
  `StemEngine.setPan`, `StemState.pan`, `MixSnapshot.stems[].pan`.

### Changed

- **Stem rows wear the Studio's controls** (Kevin's layout pass): mute
  and solo as `device-fader-button-sm`, the ⋯ menu as
  `device-fader-menu-button-sm`, the fader as the `Slider` component
  with a double-click to unity, the row numbered, the player wrapped in a
  container (`@container`) so the row goes two-column at `@4xl` with the
  name column at `minmax(14rem, 22%)`. The review fixed the Slider's
  props (it takes `label`, numbers and a value callback, not the input's
  attributes), the name's truncation (on the text, not its flex parent),
  a stale `col-span-3` on the waveform in a one-column grid, and moved
  the dev-only `CQMeasuring` badge from every row to the player.
- **The section timeline and the Comments row sit on the stem rows' grid**:
  one column until the player's container reaches `@4xl`, then a 14rem
  toolbar column beside the lanes and the mix waveform, so all three
  start and end where the stems' waveforms do (Kevin fixed the stem
  column's width; the section row's leftover spacer column went).
- **Download Stems says what it is doing.** The menu closes on the click
  and a big song's zip takes a while (Kevin), so a notice now follows the
  work, naming the stem going into the zip and its number of the total,
  then says the browser is saving it, or what went wrong.
  `saveStemsZip` takes an `onProgress` callback.
- **A stem's name has more room on a desktop row**: the name column is
  22 % of the row instead of 80 px (56 px for the text after the grip).
  The full name is the row's tooltip, as before.

### Technical

- `smoke:urls` knows `/admin/playback`.

## [0.127.0] - 2026-10-12

### Technical

- **`bun run smoke:blob` works on the dev VM again**: it runs as the
  Screenshot Bot through varlock (the preview cookie on every request,
  the Blob client's token call included), in the bot's account, on
  127.0.0.1:5173 by default, and posts remote-form fields under the
  names SvelteKit 3 gives them (`field/<form id>`). It reports the
  song's stem count from the Stems tab.

### Fixed

- **Stem rows on a phone are all the same width**, so the playheads line
  up: a long stem name widened its row past the screen (the grid's `1fr`
  column would not shrink below the name), and each waveform was drawn to
  its own row's width (Kevin's 32-stem song on an iPhone). The name's
  column is `minmax(0, 1fr)` now and the name cell `min-w-0`, so a long
  name truncates instead.
- **A stem upload the network drops is tried again.** Kevin's batch of
  32 lost its first five at once to a TLS error on the multipart create
  call (`ERR_SSL_BAD_RECORD_MAC_ALERT`, a connection settling) with no
  retry. Now the transfer is tried three times with a pause between
  (`withRetries` in `src/lib/utils/`, only for failures with no HTTP
  answer behind them), a job that still failed for a network reason is
  run again once the rest of the batch is through, and a **Retry failed**
  button under the upload list sends what is left to the same stems (the
  reservation is kept on the job, so no row is left behind). The "Stems
  not ready" tiles stay the fallback after a reload, when the browser no
  longer has the files.

### Added

- **Streamed stem playback** (docs/stem-streaming.md): a song past the
  device's memory budget no longer decodes every stem into memory. A
  worker reads each stem's AAC rendition by byte range (mediabunny) and
  decodes a twelve-second window around the playhead with the browser's
  own AudioDecoder (WebCodecs); one AudioWorkletProcessor
  (`static/worklets/stem-mixer.js`) sums every stem against a single
  sample counter, so the stems stay sample-locked, and stops the counter
  for all when one stem's window runs dry. Memory is the window, about
  5 MB a stem. Chrome, Edge, Firefox on a computer and Safari 26 stream;
  older browsers keep the buffered player. `StemEngine.load()` takes the
  listener's choice and the site's setting (`stemPlaybackMode`); a
  streamed load that fails before it is ready falls back to buffered.
  The player's footer names the mode and switches it (remembered in the
  browser); `/admin/playback` sets the site to automatic or always.
  Scan stems and Detect chords on a streamed song decode the stems on
  demand (`decodedBuffers`). The engine gained `meter()`, the output's
  peak, for the browser tests.

## [0.126.0] - 2026-10-12

### Changed

- **No more cap of 32 stems a song.** `MAX_STEMS_PER_SONG` is a sanity
  ceiling of 256 now, and failed uploads no longer count toward it. What
  limits a song is the listener's memory, so the app reckons the decoded
  size instead (`decodedStemBytes`): the uploader notifies when a batch
  takes a song past a gigabyte decoded, and the player shows a note when
  the song is past what the device can be expected to hold (a quarter of
  `navigator.deviceMemory` where known, else the gigabyte).
- **A load the browser could not finish is noticed.** The engine leaves
  a marker in sessionStorage while loading; found again at the next load
  of the same stems, it means the tab was killed (memory, almost always),
  so the player says so and a warning reaches Sentry with the stem count
  and the decoded estimate. A load that fails outright is reported too,
  and names memory when the error looks like it.

- **A chart PDF or image is read into text before the AI listens**:
  Gemini did not read key signatures off a six-page engraved score sent
  as a file (Kevin's test: F major for a C-major vamp, no E♭ at the solo),
  so `readChartWithAi` in aiDetect.ts first has Fable read the PDF or
  image into the same per-measure summary the MusicXML path makes (key
  signature where it changes, time signature, tempo, rehearsal marks,
  repeats, chord symbols), cached in Redis by the file's URL for a month
  and logged as `chart-read`; the listening call then carries the
  summary and, when it fits beside the mix, the file as well. On the
  test chart the summary named C, A♭, F, E♭ and C where the score has
  them.

### Fixed

- **The AI's key changes, tempo shifts and sections land on the bar
  line**: the model places them by ear, often on the "and" of four
  before the bar they belong to (Kevin's test), so each is snapped to the
  nearest downbeat within a beat and a half (`snapToDownbeat` in
  `src/lib/audio/measures.ts`), on the grid the answer itself makes for
  the tempo and key check and the song's grid for sections; a time in
  the middle of a bar stays where it is. A key change within a bar of a
  section's start then moves onto it, and a detected section onto a key
  change the same way, so the two line up.
- **A change on a downbeat no longer reads as the last beat of the bar
  before**: starts are stored to a tenth of a millisecond, finer than the
  bar lookup's tolerance was, so a snapped key change showed as "20 | 4"
  (Kevin's test); `barAt` now allows a thousandth of a beat.
- **The section timeline's left-hand labels** read in the rows' order,
  "keys:" above "section:", as the lanes sit above the section blocks.

## [0.125.0] - 2026-10-12

### Added

- **The AI reads the song's score** when it checks the tempo, key and
  time signature: a MusicXML file goes along as a measure-by-measure
  summary of its key signatures, time signatures, tempo marks, repeats,
  rehearsal marks and chord symbols (`musicXmlSummary`, `musicXmlFromMxl`
  in `src/lib/utils/`), a notation PDF or image as the file itself, and
  the prompt tells the model to take the keys from the chart and place
  each change in seconds by ear. The answer now carries `keyChanges`
  (`{at, key}`), which "Use these" writes as key rows, replacing the
  earlier ones. On a song with a score, **Scan stems** goes straight to
  the AI (the stems are scanned only when it cannot answer), and an
  upload's detection hands over to the AI once the mix is rendered, its
  answer replacing the detector's. `scoreForAi` in data.ts picks the
  score; the summary is logged with the request in `ai_request`.

- **Detect sections**: a Detect button on the Sections panel sends the
  mix (and the score, when the song has one) to the listening model,
  which marks where each section begins and names it, told the band's
  own section names (`sectionVocabulary` in data.ts, most common first)
  and the song's existing sections. With no sections yet the answer is
  saved at once; otherwise it is offered with "Use these" and a check
  before replacing. `detectSectionsWithAi` in aiDetect.ts shares the
  mix-and-score loading and the logged `listen` call with the tempo and
  key check; logged as `sections` in `ai_request`.

### Changed

- **The section timeline's key lane is the list of keys**: the "key:"
  line under the section name went (Kevin, after testing the score-read
  keys), and every lane marker (key, tempo, time signature) is a button
  that jumps the playhead to where its change begins.

## [0.124.0] - 2026-10-12

### Added

- **The Practice Amp's pedals are voiced for the instrument**: on a bass
  head the fuzz and overdrive keep the band under 100 Hz clean and mix it
  back under the dirt, their Tone ranges sit lower, the wah sweeps from
  100 Hz, the chorus and the new reverb pedal leave the bottom dry, and a
  fresh rig's compressor starts with a slower attack and a firmer ratio.
  The board says "Voiced for bass" at its foot. `AMP_VOICING` in
  `src/lib/constants/amp.ts` holds the numbers.
- **A Mids slider on the fuzz**: flat at the centre, a 10 dB scoop at the
  bottom, a 6 dB lift at the top (a peaking band at 1 kHz after the
  clipper).
- **A reverb pedal** (Level and Size, the drum machine's synthesized room)
  after the rotary, so the bass heads and the Tweed and Solid State have a
  reverb; the Blackface keeps its spring as well.

### Fixed

- **The Practice Amp's Gain and Master knobs** follow an exponential law,
  so a head is clean through the knob's lower half and the crunch lives
  in the top half: the Fridge distorted a bass at its default Gain with
  nothing engaged (Kevin's first test with an iRig HD X), since the linear
  law drove every head into its clipper early.

## [0.123.1] - 2026-10-12

### Changed

- **The Practice Amp's knob panel** keeps a minimum height, and the presets
  take the row's width on a wide screen (Kevin).
- **The Idea Recorder and Studio page copy** read as Kevin shortened them,
  the Studio's Quick Tips with the MIDI track, effects, shortcuts and Save
  revision folded in.

### Technical

- **`bun run db:update-docs --merge`** carries the seed files' changes onto
  user docs edited in the app with a three-way merge against the seed
  text each page was last written from (found through git), as a dry run
  without `--apply`; conflicts print both texts (docs/user-docs.md).
  `mergeThreeWay` in `src/lib/utils/`. The plain update mode decides
  "edited in the app" by the page's text, not a version's author.

## [0.123.0] - 2026-10-12

### Added

- **Practice Amp** (docs/practice-amp.md): plug a guitar or a bass into
  the computer or the phone, directly or through an interface, and play
  through an amp at `/practice-amp` (Tools menu, footer; works signed
  out). Four heads built from a preamp, a tone stack, a power stage and
  a synthesized cabinet impulse (Blackface Clean with spring reverb and
  tremolo, Tweed Crunch; Fridge with the mid selector and Ultra Lo / Hi,
  Solid State), a pedal board (noise gate, compressor, overdrive, fuzz,
  wah, chorus, phaser or flanger, delay, rotary), an input strip with
  Instrument / Line trim, Set level, Calibrate and a latency verdict, the
  tuner reading the amp's input and the metronome in its context.
  Settings are remembered per browser. The amp is a source on the looper
  and the Idea Recorder, an input in the Studio, and a panel on the song
  page to play along. User doc `/docs/practice-amp`; page copy
  `practice-amp-page`; `bun run db:seed-docs` adds both.
- **Amp presets** (docs/practice-amp.md, "Presets"): six slot buttons
  per instrument on the amp, lit on the one the rig matches; the site's
  defaults (a system admin saves them from the amp), a signed-out
  browser's own slots, and a signed-in member's account library with a
  manage menu (save, rename, re-slot, delete, search); share links
  `#amp=…` on the page they are copied from (a host page opens its amp
  panel for one). The amp's panel on the looper, the recorder, the Studio
  and the song page has the same buttons.
- **Several keys in a song**: the upload-time detection and Scan stems read
  the key per section (or per ten seconds without sections) as the best
  path through the keys with a cost for every switch, and write a key
  change where each begins; the song's key reads "C major (also A♭ major,
  F major)", and the section timeline lists every key with the one in
  force bright and the rest dim (a feature request, and Kevin's note that
  only the key in force showed). `extractKeySegments` / `keyScores` /
  `detectKeys` in analysis.ts, `keyLine`, `keyWindows`.
- **The Practice Amp's face, restyled** (Kevin): the knobs on a cream panel
  with black caps, lamp switches beside their knobs (Bright, Ultra Lo and
  Hi, Square), the Power and Mute buttons with lamps, the meters with a
  clip light, outlined toolbar buttons, the readout as a dark window, the
  presets in the knob row; the header's menus by icon on a phone.
- **The Practice Amp's knobs in labelled groups**: Gain; EQ (Bass, Mids,
  Treble); Reverb; Tremolo (Depth, Speed); then Presence, Master (the
  power stage's push, formerly Power) and Output (the level, formerly
  Master).
- **The Practice Amp comes on at the first touch** of anything on it, and
  Off is unmistakable (the face dims, the readout says so); a **Mute**
  button beside the switch turns the output off with the input open, and
  the amp mutes itself for the microphone input into the speakers.
- **The Practice Amp's demo input**: Chord player as a source, its voices
  taken dry (before its own effects) into the amp with no jack opened, to
  try the amp with nothing plugged in; a Chords button on the amp page
  opens the chord player. The piano gains a third sampled instrument,
  **Electric Guitar (direct)**: FreePats' CC0 recording of a Fender's raw
  pickup signal (`static/kits/eguitar`, `bun run samples:eguitar`), and
  the Electric Bass was a direct recording already.
- **Captured cabinets on the Practice Amp**: a Cabinet menu on the guitar
  heads with eight impulse responses from Jester Dyne Productions'
  Emerald and Brutal packs (CC0; `static/cabs/`, credited on Built With),
  beside the modelled cabinet; the choice is saved in a preset.
- **Practice Amp extras**: the drum machine in a panel on the amp page; a
  play-along transport in the song page's amp panel (Play, From the top,
  Count in: a bar of the metronome, then the stems); the noise gate with
  attack, hold and release (an AudioWorklet, `static/worklets/amp-gate.js`);
  a square tremolo on the clean head; a tuner panel on the looper, and the
  looper's and the recorder's tuners reading the amp's input while it is on.

### Fixed

- **Short links on a stage behind a proxy** sent the visitor to an `http://`
  address nothing answers; the redirect is relative now. **A file's
  permanent link** (`/f/<code>`) answered 500 since SvelteKit 3 refuses an
  external redirect; it is a plain 302 to the store.
- **A hot MP3 could not be uploaded as a stem or a mix**: it decodes past
  full scale and the server refused its peaks ("peaks (0..1) are
  required"); the peaks are clamped at 1 where they are computed.

### Changed

- **The song page's Downloads menu** names the stem mixes as such: "Original
  Stem Mix (MP3)" and "Custom Stem Mix (MP3)" (Kevin).
- **The wordmark's intrinsic size** is 134 × 24 (the same drawing), so it
  lays out at its rendered size before the stylesheet arrives (Kevin).

### Technical

- **Migration 0085**: the `amp_preset` table (account, creator, name,
  instrument, slot, data). Site amp presets are the app settings
  `ampPresets:guitar` and `ampPresets:bass`. `SHORT_LINK_KINDS` gains
  "practice-amp".
- The chorus, phaser, tremolo, rotary and compressor stages moved from
  `pianoFx.ts` into `fxStages.ts` (the piano, the Studio track chain and
  the amp share them); the fuzz is one shape of `createClipStage`, the
  overdrive another. The inputs module gained `listen()`. `IdeaSchema`'s
  loop sources and `STUDIO_INPUT_SOURCES` accept `"amp"`. The tuner
  takes a `source` node prop. New utils: `biquad`, `cabinetImpulse`,
  `springImpulse`, `latencyVerdict`, `ampPreferences` (all tested); a
  browser test `tests/e2e/amp.spec.ts`.

## [0.122.0] - 2026-10-10

### Added

- **The home page's words are edited in the app.** The headline, the
  description search engines show, each feature block's heading, topic
  and text, and the FAQ are the "home-page" copy doc (docs/page-copy.md,
  "The home page"): a system admin edits them from the page's Edit button
  or `/docs/home-page/edit`, as on the tool pages. The demos, the "Try the
  working demo below" lines and the standalone links stay in the page;
  a section the doc lacks keeps the seed file's words. The admin's Home
  page links to the editor. `scripts/user-docs/home-page.md`,
  `splitHomeCopy` (tested), `homeCopy()`; `bun run db:seed-docs` adds the
  doc on each stage.

### Changed

- **The song page's Mixes view opens with "Latest Mixes"** and an info
  tip explaining what a mix is for, in place of the paragraph above the
  list.

## [0.121.0] - 2026-10-10

### Changed

- **The chat and the comments read apart**: the chat's icon is the speech bubble with dots and the comments' the clapping hands (Kevin), on the header buttons, the Comments row, the timeline's markers, the Comment here menus and the inbox.
- **The song page's Player and Docs buttons sit in the header** beside Comments, Chat and Attachments, as icons lit while their panel is open (Kevin); the row under the player keeps to uploads, downloads and the demo.
- **The mix page's header carries the mix's buttons and its name**: comment, download, share, upload, delete beside the Chat and Song buttons, the name renamed in place under the title; the panel keeps to the player, the notes and the comments (Kevin).
- **The Chart tab's notation view says "No notation yet."** with the how in a tip, kept clear of the Text / Notation toggle (Kevin).
- **The comments are a panel of their own** on the song page (Kevin), opened from the Comments row under the stems (its label is a button with the count) or by a comment notification's link (`?open=comments`), with the list as the Docs tab had it and + to add one. The Docs panel keeps to Lyrics, Chart and Notes.

## [0.120.0] - 2026-10-10

### Changed

- **`bun run db:status`** names the last migration a database has applied and any pending, so production can be checked before a push to main (the v0.118.0 outage).
- **The mix page loses its tip and the info button that brought it back** (Kevin).
- **The account menu loses its Idea Recorder, Looper and Studio links** (Kevin): the Tools menu has them.

### Added

- **A song has a stage** (docs/mixes.md, "Phase 2"; on the `song-stage` branch to try first): Writing, Arranging, Mixing or Finished, read from what the song holds (a stem makes it Arranging, a mix Mixing) or set in song settings, where the stage control replaces the finished toggle (Finished is the last stage). The stage decides what the song page opens on (mixing and finished on the mixes, writing on the demos, arranging on the stems), a badge by the title, a notice over the stems in mixing and finished pointing at Mixes, the project page's sections (Finished Songs, Mixing, Arranging and Song Ideas, in that order, with the phase under each heading and no section for an empty stage) and what a tile and the playlist play (the newest mix in mixing and finished, the stems' bounce in arranging), with the stage named on the tile. `song.stage` (migration 0084), `setSongStage`, `StageControl`, `utils/songStage.ts`.

## [0.119.0] - 2026-10-10

### Fixed

- **A viewing link made from a mix's page opens the mix**: the share-link form remembered the song page's empty mix field and sent that, so the link landed on the song. The target is set at submit now.

### Changed

- **A page for every mix** (docs/mixes.md, "Phase 2"): `/<account>/projects/<project>/<song>/mixes/<id>` is where a mix is listened to and reviewed, with the song's title and a way back, the version and name, the player and waveform with the Comments row, the notes, the comments with Comment here (positions as time), download, share, the other versions and the song's chat panel. Share emails, viewing links and notifications open it (a mix link is the song's permalink plus `/mixes/<id>`; an older `?view=mixes&mix=` link redirects). The song page's Mixes view is a list of the mixes, newest first with their comment counts, each linking to its page, with Upload Mix; an upload from either page opens the new mix's page. The stems are out of the way during the mixing phase.

## [0.118.0] - 2026-10-10

### Changed

- **The song page's header loses its Idea recorder button** (Kevin: the global nav has it); Record Demo in the row under the player still goes there.
- **The attachments are a panel of their own** on the song page (Kevin), as the chat is: closed by default, opened by a paperclip button (its badge the file count) in the header beside the chat button, floating from lg and a block under the docs below; its + uploads, and the Uploads menu's Upload Attachments opens it to pick. The Docs panel's tabs are the documents and the comments now.

### Fixed

- **A PDF opened from the Chart tab's notation view filled only the top of its panel**, the rest a white box: the reader sat at its minimum height inside a box that only had a minimum. The box now fills the panel for a PDF, and the reader fills the box.

### Added

- **Mixes** (docs/mixes.md): a third view in the player beside Stems and Demos for the bounces an engineer or producer sends the band. Editors upload a mix (the Upload Mix button, or the Uploads menu); each takes the next version number on the song; the newest opens with a transport, its waveform (click to seek, ⌘-click for Comment here), a Comments row of the comments left on it, the engineer's notes (markdown, edited in place) and the mix's comments in a list, kept apart from the song's own. Rename, download (the file or its MP3), remove and share by email from the mix's menu; the share email, the viewing links made from the mix's Share popover and the mix's own address shown there to copy all land on the mix, as a notification's link does (`?view=mixes&mix=<id>`). Table `song_mix` and `mix_id` on `comment` and `share_link` (migration 0083), `/api/mixes` and `/api/mixes/[id]/ready`, `mixes.remote.ts`, `MixPanel.svelte`, notification kind `mix` under the demos opt-in; the browser decodes the file at upload for its length and peaks, the jobs function makes the MP3 (`mix-playback`).
- **The Mixes view restyled** (Kevin's pass): a dismissable tip, a Selected Mix picker when there is more than one, an icon toolbar (comment, download, share, upload, delete, tip), the name and version with the uploader and date, the waveform as the Comments row itself, a compact transport with the volume on a Slider, and the notes and comments under headings. The name is renamed in place (the pencil, Enter saves, Escape drops it) rather than in a prompt; a mix comment's position is shown and prefilled as time (1:23.4), never bars, since an upload's tempo, meter and offset are unknown; Download offers the MP3 rendition only when the upload is not already an MP3; the Demos tab's corners are square now that it sits between Stems and Mixes.
- **A song with a mix but no stems is a Song in Progress** on the project page, not a Song Idea (Kevin): its tile says "no stems" and plays the mix.
- **The project page plays a song's newest mix** (docs/mixes.md) from its tile and in the playlist when one has been uploaded, else the stems' bounce as before; the player names what plays ("Mix v4", "Stems mix") and the tile counts the song's mixes (Kevin: the latest content by default, said plainly).
- **Chat at a glance on the project page**: a song's tile counts its messages, and an unread badge beside the tile opens the song with its chat up (`chatSummaryOf`; members and the project's own people only). A project-level stream is considered and parked in docs/chat.md.
- **A chat on every song** (docs/chat.md): a panel of its own on the song page, opened by a chat button in the header beside Share (closed by default, so the docs stay readable beside it), for the people on the project (members and the project's own people, viewers included; a visitor never sees it). Plain-text messages, Enter to send, URLs as links and positions like `1:23` as seek buttons; a date line per day and same-author messages within five minutes under one header; a "New" line where the reader left off and a dot on the button while there is something unread (`chat_read`); the author edits and deletes their own, owners and admins delete anyone's; the panel polls every ten seconds while open and the page is visible (`chatSince`), and marks itself read as others' messages arrive. A message raises a `chat` notification for the project, folded per song, emailed under the comments opt-in; its link opens the song with the chat panel up (`?open=chat`, kept through the permalink's redirect). Tables `chat_message` and `chat_read` (migration 0082), `chat.remote.ts`, `SongChat.svelte`, `utils/chatTokens.ts` and `utils/groupChat.ts`; user doc `chat`.

## [0.117.1] - 2026-10-09

### Fixed

- **The Chord Player's sustain latch survives a tab switch.** Focus leaving the window released everything, the latch included, so a user coming back from another tab found the pedal up. The latch is a setting rather than a held key, so it stays now; the keys and a space bar held without the latch still let go.

## [0.117.0] - 2026-10-08

### Added

- **A device knob** (`src/lib/components/Knob.svelte`) in place of an `<input type="range">`: a 270° arc filled to the value (from the centre for a bipolar control), a pointer on the cap, and the value's text never, always, or in a small popover while it turns. Drag up or right (Shift for fine), roll the wheel, or use the arrows, Home, End and Page keys; a double-click returns to a reset value. A slider to assistive technology. First used for the **pan on the Studio's tracks**, 26 px tall, the value ("L 50", "C", "R 50") popping up while it is adjusted.
- **A device slider** (`src/lib/components/Slider.svelte`), the knob's sibling for a fader: a track filled in light blue to the value (from the centre when bipolar), a round thumb, horizontal or vertical, the value's text in the same popover over the thumb while it moves; a press anywhere on the track jumps there and drags from there (Shift for fine), the wheel and the keys as the knob's, a double-click to a reset value. First used for the **level fader on the Studio's tracks** (decibels, or a share of velocity on a MIDI track; a double-click returns to unity). Both snap through `utils/snapToStep.ts`.

### Changed

- **The Studio's input picker is the app's ComboBox** rather than the browser's select, at the same size and type; the list opens as a popover.
- **The Studio's track headers**, row by row: the name with the menu at the right edge; the input picker; then arm, mute, solo and the effects button (a MIDI track's badge in its place) leading the fader, with the pan knob at the end. The header is 200 px wide, the whole name fits, and the buttons are device buttons (`device-fader-button-sm` and friends in `uno.config.ts`, with `accent-2`, `on-accent` and `device-button-face` colours), an armed track showing a red left edge (Kevin's pass). `ContextMenu` takes `clearButtonBaseClasses` and `dataActive` and sets `data-open`/`data-active` on its button for the shortcuts to style.
- **The Built With page catches up with the stack**: the typefaces are Noto Sans, Serif and Mono from Bunny Fonts; AudioWorklet, the Web MIDI API, Verovio, IndexedDB, fflate, the QR code library, PDFKit, pdf-lib and PDF.js join the list; the AI section says which model does what (Gemini, Claude and Kimi) and that the beat and chord generators run on request; the checks line names the spelling, dead-code and house-rule checks.
- **The Studio's Songs panel is the Recordings panel** (Kevin: "Songs" read as the project songs). Same list, same menus; the toolbar button and the panel's title say Recordings.

### Fixed

- **The Studio's playhead no longer rides over the track headers** when the lanes are scrolled sideways: it sits below the sticky headers and the ruler now, and hides behind them as it should.

## [0.116.0] - 2026-10-08

### Fixed

- **Trimming a clip in the Studio no longer squeezes its waveform** (Kevin: it looked like the content was being sped up). The drawing keeps the clip's own width and place while an edge is dragged, so the trim masks it, and it is redrawn once the trim lands.

### Added

- **Studio phase 3b: the piano-roll editor** (docs/multitrack-recorder.md). **Edit notes** on a selected MIDI clip, or a double-click on the clip, opens its notes in a floating panel: rows of pitches (a drums track's are the kit's voices) against the song's beats, a keyboard column that sounds each row. A click on empty grid adds a note a grid step long (beat, half or quarter; Shift ignores the grid), a note drags in time and pitch with a live preview, its right edge drags its length, Shift-click extends the selection, the arrow keys nudge (Shift an octave), the Velocity slider sets the selection's, Delete removes; every gesture is one undo step (`PianoRoll.svelte`, `utils/pianoRoll.ts`, `studio.setClipNotes`, `studio.auditionNote`).

## [0.115.0] - 2026-10-08

### Added

- **Studio phase 3a: MIDI tracks** (docs/multitrack-recorder.md). **Add MIDI track** makes a track of notes whose input is the instrument that plays and records it (the piano, the chord player or the drum machine). Arm it and record: every note the panel, the computer keyboard, a Web MIDI device or the drum pads play lands in a clip drawn as a small piano roll, shifted earlier by the output latency as instrument takes are, cut per loop pass or to the punch region like audio. Playback schedules the notes through the hosted engines from the look-ahead (`piano.scheduleNote`, `drumMachine.scheduleHit`), with the track's fader scaling velocity and mute and solo skipping the notes. MIDI clips move, trim, split, duplicate and take lanes as audio clips do; the selected clip's bar offers Quantize (beat, half, quarter), Transpose (±1, ±12), a velocity slider and **Export MIDI** (a Standard MIDI File at the song's tempo); Import takes `.mid` files onto a MIDI track. **Render to audio track** in a MIDI track's menu plays its notes through the instrument into a new audio track in real time and mutes the MIDI track; Download mix, Add as demo and Add tracks as stems do this first for any MIDI track with notes, since an offline render cannot run the instruments. Notes are seconds like every clip (`StudioNoteSchema`: `{t, d, p, v}`, at most 2,000 a clip); the arrangement's version stays 1.

### Fixed

- **Download mix in the Studio works.** It fetched its own object URL first, which the page's Content Security Policy refuses for `blob:` addresses, so the download failed with "Failed to fetch" since phase 1a. The mix (and a MIDI export) now goes straight to a download (`utils/downloadBlob.ts`).

### Changed

- **The digest email carries only what you have not read.** An item already read in the inbox stays out of the daily or weekly digest (and is left unstamped, so it never goes out later either).

## [0.114.0] - 2026-10-08

### Fixed

- **Upload reserve routes check the same things everywhere** (found while testing them): the MIDI, stem-replacement, drum-sample, notation and attachment reserves now refuse a size that is not a whole number of bytes (a fractional or non-positive `sizeBytes` passed to the data layer before) and answer 400 to a body that is not JSON instead of a 500; a stem replacement counts against the account's storage like a new stem and can answer 409; the drum-sample routes check sign-in before looking a kit or sample up, so an unknown id tells a stranger nothing; and marking a notation file ready applies the restricted-project rule, as reserving it already did (`access.ts`).
- **Start New Idea in the recorder's menu is greyed while there is nothing to leave**, as the page asks it to be; the item ignored the switch. Found by the recorder's new component tests.
- **A take's resumed upload no longer saves the mix twice.** The Idea Recorder's queue remembers how far a take with sources got (the mix saved, N sources up) so a retry after a reload carries on from there, but it wrote that progress to IndexedDB through a reactive proxy, which the browser cannot clone, so the write failed quietly and a reload started the take over (`takeQueue.svelte.ts`: `$state.snapshot` before `put`). Found by the queue's new tests.
- **Markdown sanitizer hardening**: a protocol-relative `//host` link (and the `/\host` and `\\host` forms browsers read the same way) is dropped instead of passing as a local path; an `<input>` that is not a task-list checkbox is dropped whole instead of surviving as a disabled box; `name` on a link is dropped (a document named property, the same DOM-clobbering handle the id rule guards against); the footnotes keep their `aria-describedby` and `aria-label`, which screen readers need.

### Technical

- **Test coverage, the leftovers** (`bun run test`: 2,173 tests in 240 files; lines 31.7% → 34.9%): every API route now has a `server.test.ts` (thirteen were untested: MIDI reserve/ready, stem replace, drum samples, song files, notation, the digest, the charts and documentation zips and the documentation PDF), `transcode.ts` (ffmpeg's argv for the AAC, MP3, FLAC and silence-trim renditions, with ffmpeg and the file system doubled), `notifications.ts` (100% of its lines over the fakeDb double), `upload.ts` (every browser upload helper against Blob's client and `fetch` doubles), the two IndexedDB upload queues (`fake-indexeddb`, a new dev dependency), and component suites for the Idea Recorder's recorder (`DemoRecorder`, with Web Audio and MediaRecorder stood in: a Record → Stop cycle reaches `onqueued`), the Studio's lanes (`StudioTimeline`, over an engine double: headers, inputs, effects, clips, ruler, keys, pointer drags and trims) and the Attachments tab (`SongFilesPanel`).

## [0.113.1] - 2026-10-08

### Technical

- **SvelteKit 3** (`@sveltejs/kit` 3.0.1, `adapter-vercel` 7, `vite-plugin-svelte` 7.3) on **Vite 8** through Vite+ 1.1 (Vitest 5, Oxlint 1.87, Oxfmt 0.72), with Sentry 11. The migration (`sv migrate sveltekit-3`, then by hand): `$lib` is `#lib` with file extensions (`package.json` `imports`); `$app/environment` is `$app/env`; `invalidateAll` is `refreshAll`; the song-doc matcher lives in `src/params.ts` (`defineParams`); `handleError` receives every error sorted by `kind` and takes over `handleValidationError`; `tsconfig.json` extends `$app/tsconfig`; hook types come from `@sveltejs/kit/hooks`; the admin radios use `field.as("radio")`; Sentry's Vite plugin is imported from `@sentry/sveltekit/vite`, its server init drops `registerEsmLoaderHooks` for `dataCollection`, and `experimental.instrumentation` is gone (the file alone is the switch). Vercel Analytics and Speed Insights are injected from their generic entries (`src/lib/observability.ts`) because their `/sveltekit` entries still import the removed `$app/stores`; the root layout reports the route after each navigation. The API routes answer with `Response.json()` instead of SvelteKit's deprecated `json()` helper.

## [0.113.0] - 2026-10-07

### Changed

- **The Idea Recorder records one stereo take** (Kevin, after testing found the recorder and the Studio hard to tell apart): any mix of sources still goes into a take, as one file, like a handheld memo recorder; recording the microphone and each instrument as separate files is the Studio's job now. The Stereo/Multitrack buttons above the meter are gone, and with them the per-source recorders and the latency trim of each source's file (`DemoRecorder`). A loop saved from the looper still arrives as a take with its layers as sources, so the Tracks panel and **Add N stems to song…** stay for those takes and for takes made before this change.

### Fixed

- **A docs refresh no longer overwrites a page edited in the app** (Kevin: the Studio page's copy kept reverting): `bun run db:update-docs` skips a page whose newest version was written in the app, says so, and takes `--force` to overwrite; `--list <slug>` shows a page's versions and `--restore <slug> <n>` brings one back as the page.

## [0.112.0] - 2026-10-07

### Added

- **Studio phase 2b: effects on every track.** The sliders button in a track's header opens a compressor (amount, ratio, make-up), the tone stage (tilt, air, bottom) and a reverb send (level, size), the piano chain's own pieces on one chain per track (`src/lib/audio/trackChain.ts`) that the offline bounce builds too, so a mix, a demo and the stems sent to a song carry them. Saved on the track in the arrangement; a restored revision brings them back.
- **Studio phase 2a: the instruments as track inputs.** A track's input can be the piano, the chord player or the drum machine, hosted in the Studio's own audio context as the looper hosts them: what is played on the panel lands on the take sample-accurately, a piano or chord part is shifted earlier by the output latency (a Timing-menu switch), and a track armed to the drum machine makes the beat play along from the transport's start at the song's tempo. The instruments' settings (the beat, the piano's preset, the chord player's settings) are saved with the song when such a take lands and come back when it opens. The three panels sit in the toolbar as on the looper page.

### Technical

- **Browser tests** (`bunx varlock run -- bun run test:e2e`, `playwright.config.ts`, `tests/e2e/`): Playwright in Chromium against the running dev server as the Screenshot Bot with a fake microphone, reaching the engines through the dev build's `window.__*` hooks. Ten specs: the Studio end to end (a take as a clip and its upload; import, trims, a split, fades, gain, a duplicate and a reload; loop-recording takes, punch and a revision's restore; cleanup through the app), the Idea Recorder (a take recorded, uploaded, the ideas deleted), the looper (a microphone layer the length of the loop), the stem player (decode, play, mute, solo) and the drum machine, metronome and piano transports. The only tests that run the Web Audio engines and the pages; not part of CI.

## [0.111.3] - 2026-10-07

### Fixed

- **Open bug reports, support requests and feature requests list first**, then complete, then closed, as their pages say; the status column alone sorted "closed" ahead of "open" (`utils/byStatus.ts`).
- **A song whose project row is gone** answers its own privacy when its files' store is asked for, instead of failing.
- **Storage room for an account that does not exist is refused**, not granted.
- **A project-viewer invitation checks the project belongs to the account** (a viewer takes no seat, so the seat cap stays out of it); the command answers 404 otherwise.

### Technical

- **`bun run test:coverage`** (`@vitest/coverage-v8`, text summary plus HTML and JSON reports in the gitignored `coverage/`), and **tests for the rest of `data.ts`**: accounts, projects, songs, stems, comments, ideas and recordings, files and notation, docs and notes, admin and support, libraries, mixes and renditions, views (300 cases over twelve files, through `tests/helpers/fakeDataLayer.ts`; the fake db learned raw `sql` predicates, aggregates, joins, `like`, `exists` subqueries and conflict-aware inserts). The suite stands at 1,923.

## [0.111.2] - 2026-10-07

### Fixed

- **An upload can be no larger than its reservation claimed.** The reserve routes for stems, demos, takes and take sources now require the claimed size to be a whole number of bytes from one up (zero, negatives and NaN were accepted), and the upload token is capped at that claim rather than the kind's ceiling, so the storage quota the claim was checked against holds. The ready routes bound what the browser reports: a length up to a day, one to eight channels, a source's order within a song's stems.
- **Every member-gated function and route answers 401 to a signed-out caller**, the stem and demo routes included; the upload token route passes a refusal's own status through instead of 400, and the Studio reserve answers 413 for an oversize file as the other reserve routes do.
- **Reordering stems with the arrow keys keeps the grip focused**, so a second press moves the row again; **a floating panel whose remembered place is corrupt opens where a panel with none does**.

### Technical

- `FADER_MAX` lives in `src/lib/constants/fader.ts` (the engine re-exports it; the default-mix schema and the Studio's fader read it); `src/lib/constants/audioBounds.ts`; `utils/validSizeBytes.ts`; `parseBody` beside `parseJsonBody`.

### Technical

- **The rest of the coverage plan**: frozen golden links for every drum-machine share-link version (v1–v9, each made by that version's own encoder) and piano presets, round trips of the bit packer and the MIDI writers, `peaks.ts`, nine more valibot schemas, component tests for FloatingPanel, ContextMenu, StemRow, StemPlayer and Waveform (`tests/helpers/fakePopover.ts`), `hooks.server.ts`, and the reserve/ready API routes, the upload token route, the jobs endpoint and the mix route (`tests/helpers/fakeApiEvent.ts`; route tests are named `server.test.ts` since SvelteKit reserves the `+` prefix). 273 cases; the suite stands at 1,620.

## [0.111.1] - 2026-10-07

### Fixed

- **A session that ended reads as one.** A save or an action after the sign-in expired answered "Not found"; every member-gated action now answers 401 and the page says "Your session has ended. Sign in again to keep working." (`requireMember` refuses the signed-out first; `errorMessage` names the 401).
- **Editing, deleting or restoring a comment needs current access to the song**, not authorship alone: a viewer who left a project can no longer change their old comments, and an admin of another account gets "not found".
- **An artist member or a credit whose parent row is gone answers "not found"** instead of failing.
- **Viewer-role memberships behave the same everywhere**: the beat, chord-style, piano-preset, progression and drum-kit libraries are listed for every member as their notes say (a viewer-role member was refused), while creating a project and revoking a share link need an editor like every other change (a viewer-role member could do both). Found by the new authorization tests; the account viewer role is retired, so no live account changes.
- **Deleting a user clears the uploader of their attachments and notation files**, as the other uploads already were (the cascade test now derives every user reference from the schema).

### Technical

- **Authorization tests for every remote function** (32 `*.remote.test.ts`, 690 cases): signed out, an outsider, a member of the wrong role, the owner, and the creator-ownership rules for ideas, takes and Studio songs, against the real `access.ts` checks with the data layer mocked (`tests/helpers/fakeRequestEvent.ts`, `fakeServerModules.ts`). A fake drizzle `db` (`tests/helpers/fakeDb.ts`) that evaluates real `where` clauses and logs every write, with tests for `access.ts` (23), `cascade.ts` (16, every foreign key derived from the schema) and the Studio functions in `data.ts` (18).
- **Tests for the Studio's arithmetic and the HTML sanitizer.** The engine's trim, split, snap, take-lane and loop/punch piece rules, the ruler's ticks, the live-waveform peak reduction and the buffer slice and normalize helpers moved into `src/lib/utils/` as pure functions with tests (43 cases); `src/lib/server/sanitize.test.ts` documents the allowlist with 53 cases (dropped elements, event handlers, obfuscated `javascript:` URLs, GFM output surviving, idempotence).

## [0.111.0] - 2026-10-07

### Added

- **Studio editing (phase 1b)**: trim a clip by dragging either end (non-destructive), split at the playhead (S), duplicate (⌘D), a bar under the timeline with the selected clip's name, gain and fades (drawn as wedges), **Import audio…** onto a track at the playhead, **Punch** (a take keeps only the loop region), and take lanes: a take that covers an older clip end to end keeps it as an alternate, loop recording makes a take of every full pass, and arrows step through them. A take saves the arrangement at once, and leaving with an unsaved edit asks first.

## [0.110.1] - 2026-10-07

### Fixed

- **A tool page's intro renders its markdown** (Kevin: a link typed into the Studio's copy doc showed as markdown): the intro line goes through the same sanitized renderer as the tips under the device, inline; the phone tooltip and the page title keep a plain-text copy with links reduced to their words (`utils/stripMarkdownInline.ts`).

## [0.110.0] - 2026-10-06

### Added

- **The Studio, a multitrack recorder** at `/studio` (docs/multitrack-recorder.md, phase 1a): tracks of clips on a timeline, recorded from the microphone, a line in or the computer while the rest of the song plays, with a count-in, a click, a bar grid, per-track fader, pan, mute, solo and meter, a loop region, undo and redo, and clips that drag along and across tracks. Takes are captured losslessly by an AudioWorklet from the frame the transport starts on and shifted earlier by the input's measured latency; they upload in the background as 24-bit WAV. A song is an idea of kind "song" with a note board; its arrangement autosaves and can be kept under a name as a revision and restored from the Songs panel. The song's menu bounces the mix to a WAV, adds it to a song as a demo, or adds each track to a song as a stem. An empty song opens with one track armed to the microphone; the take under way draws its waveform as it records; the Timing control is a split button (the tempo toggles the click, the caret opens the menu with Tap, the count-in and beats per bar).

### Fixed

- **A remembered input device that is gone no longer blocks recording** (Kevin: "input not found" on the Studio with the MacBook's microphone present): a microphone or line-in device id kept from an earlier session (Safari renews them; an interface may be unplugged) made the request fail; the shared inputs module now falls back to the default input and forgets the stale choice, on the Studio, the looper and the Idea Recorder alike.

### Technical

- **Tables `studio_source` and `studio_revision`** under an idea, `idea.kind` gains "song" (migration 0081), routes `POST /api/studio/sources` and `/api/studio/sources/[id]/ready`, remote functions in `studio.remote.ts`, the `track-capture` worklet, `StudioEngine` (`src/lib/audio/studio.svelte.ts`), `StudioQueue`, `StudioTimeline.svelte`; user docs `studio` and `studio-page` seeded.

## [0.109.3] - 2026-10-06

### Fixed

- **The Attachments tab stands as tall as the other Docs tabs** (Kevin): the icon-only tab was shorter; every tab has the same minimum height now.

## [0.109.2] - 2026-10-06

### Fixed

- **Documentation downloads say what they are doing** (Kevin: a slow zip looked like nothing was happening, then an error page): Download All Charts, Download All Song Documentation and Song Documentation (PDF) now fetch the file with a "Preparing…" notification, hand it to the browser when it arrives, and show a failure as a notification with the server's reason (`utils/downloadBuilt.ts`).

### Added

- **Attachments' links are short by default** (Kevin): Copy link on an attachment or score tile, and in the viewer's header, copies the permanent link in its short form (shvl.me), the permanent link itself when no code can be had; emails and mentions keep the permanent link.
- **Share on the piano's face** (Kevin): a Share button in the More row from the wide width, and a Share section of the settings menu on a phone, copying the short link to the sound as it stands; the presets' manage menu keeps its links to saved presets.

## [0.109.1] - 2026-10-06

### Changed

- **The chord player starts from the first preset** (Kevin): on a first visit, with nothing of the chord player saved in this browser, preset 1 loads (`hasSavedChordSettings`); a browser with settings keeps them.

### Fixed

- **A preset without a sustain lock setting unlocks the pedal** (Kevin): presets saved before the lock was kept applied over a locked pedal and left it locked; now absent means not locked.

## [0.109.0] - 2026-10-06

### Changed

- **Short share links** (Kevin: the instruments' links were long): Copy link on the chord player, the drum machine and the piano mints a code (`short_link` table, migration 0080; `mintShortLink` command, rate-limited, anonymous links expiring after ninety days) and copies `https://shvl.me/<code>` in production (`SHORT_LINK_ORIGIN`), `/x/<code>` on the app's own origin elsewhere; the short host resolves in `hooks.server.ts` with a 302 that keeps the `#` settings, and the long link is copied when no code can be had (`utils/shortenShareLink.ts`). Kevin attaches shvl.me to the Vercel project and sets the env.
- **Chord player presets keep the sustain lock** (Kevin): the lock moved into the engine (`sustainLock`, `setSustainLock`) and into the preset's chord settings beside the strum latch and the arpeggiator's latch, which were already kept; applying a preset puts the pedal down or lifts it.

## [0.108.1] - 2026-10-06

### Fixed

- **Song page tips read light** (Kevin: the strip under the comments row was too dim).

### Changed

- **Project page polish** (Kevin): the intro under every section heading is prose-width, Song Ideas says to click a song's name to open it, and a divider with room above and below separates the download buttons from the attachment tiles.

## [0.108.0] - 2026-10-06

### Added

- **Version history for the song's texts** (Kevin): History in the Docs panel's ⋯ menu lists the ten most recent versions of the chart text, the lyrics, the notes or your own note (now kept for private notes too, `song_doc_version.user_id`), each viewable and restorable (a restore is a new save, so the text it replaces is kept); an edited comment's "edited" badge opens its earlier titles and bodies (`comment_version`, written by `updateComment`), restorable by its author or an admin (`history.remote.ts`, `DocHistoryPanel.svelte`, migration 0078).
- **Attachments & Downloads on the project page** (Kevin): a section below Song Ideas with every song's attachments and scores plus the project's own files (a file now belongs to a project and optionally to a song: `song_pdf.project_id`, `song_id` nullable, migration 0079 rebuilding the table), the same tiles and menus as a song's Attachments tab, each naming its song, with Attach to move a file to a song or back to the project (`attachFile`) and uploads to the project itself (`/api/files` with `projectId`, `MAX_FILES_PER_PROJECT`). Download All Charts zips every score's rendered PDF and MusicXML, every chart file and the chart text (as text and as a PDF) per song (`/api/projects/[id]/charts.zip`); Download All Song Documentation zips a PDF per song of its lyrics, chart and notes (`/api/projects/[id]/documentation.zip`), rendered from markdown with pdfkit (`utils/markdownToPdf.ts`, `server/documentation.ts`, `fflate`); a song's Downloads menu has Song Documentation (PDF) (`/api/songs/[id]/documentation.pdf`). A song's notation is merged into its documentation PDF after the text (Kevin): every score's rendered PDF and every PDF or image marked as notation, appended with `pdf-lib` (`utils/appendToPdf.ts`, tested); a score with no rendered PDF yet (uploaded before the renders existed) is scheduled on the song page's next visit. The section's header says a song's lyrics, chart text and notes have no tile there (Kevin).
- **Remove a demo from its row** (Kevin: there was no way on a song with stems): the demo's menu in the player's Demos view has Remove demo for editors (`removeDemoById`).
- **The player's tips** (Kevin: the comment gesture was not obvious): under the comments row, the space bar, Home, clicking a waveform to jump, and ⌘-click, Ctrl-click or right-click to leave a comment, in the instruments' strip style.
- **Project page tiles** (Kevin): a song idea's tile has a play button for its demo (the playlist switches to the demos), every tile shows an arrow saying it opens the song, and the meta line counts charts (the chart text plus the scores and chart files attached) and notes (the project's plus your own); idea tiles run full width.

### Changed

- **The Attachments tab is a paperclip** (Kevin): the icon with its count in place of the word, the word in the tooltip and for screen readers.

## [0.107.0] - 2026-10-06

### Added

- **Notation on the Chart tab** (Kevin: Dorico scores): the Chart tab has a Text / Notation toggle (remembered per browser, notation first when there is no chart text but there is notation); Notation holds MusicXML files (`.mxl` or `.musicxml`, 10 MB each, 20 a song) as tiles like the PDFs', with a ⋯ menu (Open, Download, Edit, Remove) and a Share menu, Upload Notation at the foot, in the panel's ⋯ menu and in the Uploads menu. A tile opens the score in a `FloatingPanel`, every page engraved by Verovio for the panel's width and re-engraved as it resizes; Verovio (7 MB) runs in a module worker (`workers/notation.worker.ts`, `utils/renderNotation.ts`) that starts only when a score is rendered, and its SVG is sanitised before it enters the page (`utils/sanitizeSvg.ts`, tested). The first page is drawn at upload time into a WebP thumbnail (`utils/notationThumbnail.ts`). A `song_notation` table (migration 0074) with the PDFs' lifecycle: `/api/notation` reserves, the browser uploads, `/api/notation/[id]/ready` sniffs the bytes (a zip for `.mxl`, MusicXML text otherwise; the server never parses XML), cascade, relocation, storage accounting, `/f/<code>` links and downloads under the original name; the CSP gains `wasm-unsafe-eval` for the engine.
- **PDFs on the notation view, and a PDF of every score** (Kevin): the Chart tab's notation view also shows the song's PDFs marked as notation, uploads a PDF straight into it (the PDFs' flow with `notation: true`, `song_pdf.is_notation`), and a PDF tile's ⋯ menu on the PDFs tab has a Notation switch (`updatePdf` with `isNotation`), so a chart printed from Dorico and its MusicXML sit side by side. Every MusicXML upload is rendered to a PDF on the server once it is ready (`notation-pdf` in the jobs function, Verovio in Node on A4 with `pdfkit` + `svg-to-pdfkit`, `song_notation.pdf_*`), offered as Download as PDF in the tile's ⋯ menu and the viewer's header (`/f/<code>?download=pdf`); the PDF viewer in the panel shows a notation PDF in the browser's reader.
- **A private notepad on the Notes tab** (Kevin): signed in, the Notes tab has a Project / Mine toggle (remembered per browser); Mine is a note of one's own on the song that nobody else sees, saved as the documents are (`saveDoc` kind `mynotes` into `song_user_note`, migration 0076), open to any signed-in user who can view the song.
- **The PDFs tab is the Attachments tab** (Kevin: files that may or may not be charts, scraps of audio for discussion): the song's files of every kind, PDF, image, audio, text, MIDI or other (`song_pdf` keeps its table name, a `kind` column tells them apart, new uploads at `files/<id>.<ext>`; per-kind size caps and byte-signature checks in `utils/fileSignatures.ts`, 40 files a song), the scores from the Chart tab listed too, filter chips once a song has a few kinds, audio playing on its tile, images shown as themselves, a viewer panel for the rest. A PDF or image can be marked as notation; an audio file's Use as demo copies it into the song's demos (`files.remote.ts` `useAsDemo`). `@Title` in a chart, lyrics, notes or a private note links to the file when shown (`utils/linkMentions.ts` at page load and on save, tested) and Copy mention puts it on the clipboard. Routes `/api/files`, `/api/files/[id]/ready` replace `/api/pdfs/*`; `SongFilesPanel.svelte` replaces `SongPdfPanel.svelte`; `constants/fileFormats.ts` replaces `pdfFormats.ts`.
- **Counts on the Chart and Comments tabs** (Kevin): Chart carries its uploads' count (notation files and PDFs marked as notation), or 1 for chart text alone; Comments its count, as PDFs already did.

## [0.106.0] - 2026-10-06

### Changed

- **The song page's player in a panel of its own** (Kevin): the stems or demos, with their tabs and the decode status in the header, dock in their column, pop out into a draggable, resizable panel from lg, or minimise to a Player button beside Docs in the action row, which brings it back as it was (remembered per browser, `stemshovel.song.player-mode`). A minimised player stays mounted (`keep` on `FloatingPanel`), so decoded stems and playback survive and the button lights while it plays; the Docs panel takes both columns while the player is away.
- **Lyrics is the Docs panel's first and default tab** (Kevin), before Chart and Notes.
- **Rich Text or Markdown as a toggle on the panel** (Kevin): while a document is edited, a two-way switch sticks to the Docs panel's top right in place of the ⋯ menu's two items.

## [0.105.1] - 2026-10-06

### Changed

- **The Demos playlist is the song ideas' by default** (Kevin: as the Song Ideas section; a song with stems leaves it): an All demos switch on the tab brings every song's back, remembered per browser (`stemshovel.project.all-demos`); `idea` on the demo tracks.
- **The PDFs tab counts its files** (Kevin): "PDFs (2)", as the player's Stems and Demos tabs do.

## [0.105.0] - 2026-10-06

### Added

- **A Demos tab on the project playlist** (Kevin): the player plays the songs' demo recordings (ideas included, in the songs' order, each named by its song and label; the AAC rendition where it is ready) as well as the stem mixes, on two tabs with counts; it opens on the mixes when any song has one and on the demos otherwise, and a song row's play button brings the mixes tab back. `getProject` carries the demos' playback columns and the load presigns them.

### Changed

- **The song page's Docs panel, with the PDFs as its fifth tab** (Kevin): the chart, lyrics, notes, comments and PDFs panel is a `FloatingPanel` now, docked in its column, popped out into a draggable, resizable panel from lg, or minimised to a Docs button in the row under the player, which brings it back as it was (remembered per browser, `stemshovel.song.docs-mode`); its tabs, edit button and ⋯ menu moved into the panel's header (the ⋯ and the phone's picker are `ContextMenu`s). The PDFs tab has smaller tiles, each with a ⋯ menu (Open, Download, Open in a new tab, Edit, Remove) beside a Share menu (Copy link, Share via email), Upload PDFs at the foot and in the panel's ⋯ menu as well as the Uploads menu; the player takes both columns while the panel is away. The PDFs section at the foot of the page is gone.
- **A PDF opens in its own panel** (Kevin): a tile's page opens the file in the browser's reader inside a `FloatingPanel`, dragged and resized, Download first in its header beside Open in a new tab and Copy link; the CSP's `frame-src` allows the stores. Downloads go through `/f/<code>?download=1`, which streams the file as an attachment under its original name (`utils/attachmentDisposition.ts`, tested), since the store named it by its id.

## [0.104.0] - 2026-10-06

### Added

- **Steps from the computer keyboard on the drum machine** (Kevin): an arrow key shows a window of eight steps on the first row, outlined in blue with the key's digit in each cell; the arrows move it a row up or down or eight steps along (a shorter window at the end of a 12- or 24-step pattern), 1 to 8 switch its steps, Shift with a digit steps a cell's velocity, Esc puts it away, and a click on a cell brings the window to it; the digit is dark on a sounding cell, and a shortcuts strip at the device's foot says so from the wide width. Only the instrument that owns the keyboard on a shared page (the looper, the home page) answers.

## [0.103.0] - 2026-10-06

### Changed

- **The Effects menu is an accordion** (Kevin: it had grown unwieldy): a drawer per effect, Reverb to Compressor, Bounce beside Rotary (Kevin), one open at a time, the header lit and reading its level (off, a percentage, the rotary's speed, the tone flat or shaped), the controls in two columns inside; the popover is the other menus' width on the piano and the chord player.

## [0.102.0] - 2026-10-06

### Changed

- **The chord player's space bar locks the sustain with a double tap** (Kevin): a second press within 400 ms locks the pedal down, as a double tap on the sustain pad has, and the next double tap or Escape lifts it; the shortcut strip says so. The pad and the key share one `sustainPress`.
- **The Strum menu in the Arpeggiator menu's shape** (Kevin): two columns of ComboBoxes with an InfoTip beside each label (Speed and Direction, Pattern and Rate, a divider, Accent and the session Swing, a divider, Latch), the explanations moved from paragraphs into the tips, the rate disabled with Once; `StrumMenu.svelte`, out of `ChordPlayer.svelte`.
- **The Timing and UI menus in the same shape** (Kevin): Timing with the tempo slider, steps, Tap and number across the top, Beats to the Bar as a ComboBox (the beat counted beside it while the click runs) and Click as a switch; UI with Layout, Key Position, Key Center, Notes in the Readout and Computer Keyboard as ComboBoxes and Show Key Signatures and Dim Outside the Key as switches, each explained in an InfoTip (`TimingMenu.svelte`, `ChordUiMenu.svelte`).
- **Style is Chord Palette on the chord player** (Kevin): the dropdown's label, its caret menu (the seventh on a major chord as a ComboBox with an InfoTip, and below a divider New palette, Edit and Delete for a member who can edit, `ChordPaletteMenu.svelte` in the Arpeggiator menu's shape), the phone's Chords section, the editor's Palette name and Save palette, and the user doc; the engine, presets, progressions and share links keep `style`.

## [0.101.0] - 2026-10-06

### Added

- **PDFs attached to songs** (Kevin's request: charts and notation for the band): a PDFs section on the song page where editors upload one or more PDFs (up to 25 MB each, 20 a song), each with an optional title and description, its first page as a thumbnail, pages and size, a download and a permanent link (`/f/<code>`) that follows the file through renames and privacy moves. The upload is the demo's lifecycle (`/api/pdfs` reserves, the browser sends the bytes to Blob, `/api/pdfs/[id]/ready` reports): the browser renders the first page with pdf.js (`utils/pdfThumbnail.ts`, loaded on first use) and the server reads the file's first bytes from the store before calling it a PDF (`utils/fileSignatures.ts`, tested), checks the thumbnail's bytes the same way and stores it beside the file. A `song_pdf` table (migration 0073) with cascade, relocation and storage accounting; `remote/pdfs.remote.ts` edits and removes.

### Changed

- **The piano's device row and Arpeggiator menu, Kevin's pass**: the Arpeggiator menu explains each setting in an InfoTip beside its label and chooses with ComboBoxes; the Effects group shows from the medium width (a lightning icon, its label from the widest); the presets sit on the face at every width; MIDI, High Fidelity (Hi-res renamed) and the Scale Guides live in the settings menu, which shows at desktop too; the power switch stays at every width. Fixes from the review: the menu's choices persist again and show the current tempo ratio and bar alignment, and the alignment select is disabled while patterns are not lined up.
- **The piano's layout pass, Kevin's second**: the controls row lays out by container width up to a nine-column desktop row, the power switch and the settings button shrink to their icons at the widest, the settings menu's sections (Metronome and Volume on narrow faces, Arpeggiator and Effects below the wide, Fidelity, MIDI, Scale Guides) are two-column blocks with a divider, the Arpeggiator menu's labels read Key Plays Chord, Align with Bars and Changes on Beat, the MIDI button reads Enable MIDI Control, and a keyboard-shortcuts strip (Space, Esc, the octave arrows) sits at the foot of the device from the wide width. A dev-only `CQMeasuring.svelte` overlay shows the container breakpoint in play, and the container theme gains an 8xl step.

## [0.100.0] - 2026-10-05

### Changed

- **The piano's guides are switches, and the key is C major by default** (Kevin): choosing a key no longer marks the keyboard by itself; Dots (new) and 1–7 in the Key menu each switch their guide on, disabled until a key is set, and Turn Off All Guides clears both. The Scale choice stays in view, None is gone (the key is C major to begin with and a stored none reads as C), and the Arpeggiator menu's key choice says the same.

### Added

- **A staff on the piano's screen** (Kevin): the notes sounding, on a small treble staff beside the chord name from the medium width, spelled in flats in a flat key and sharps otherwise, the arpeggiator's note lit (`StaffReadout.svelte`, the chord player's drawing as a component).
- **An arpeggiator on the piano** (Kevin: the chord player's, backfilled): held keys play one at a time at the session tempo, a chord built up a key at a time joining the pattern as it grows, with the rate, pattern, octaves, gate, tempo ratio, session swing, latch, bar alignment and on-beat changes of the chord player's; an Arp split button beside the octave (double-click to latch), an Arpeggiator section in the phone's menu, "arp" on the screen, the settings in presets (`arp` in `PianoPresetDataSchema`); and a single key held alone plays as a chord, the triad on its degree of the lit key, C major's chords with no key lit (Kevin: every key came up major), a major triad outside the scale (`utils/chordFromKey.ts`, on by default, "A single key plays as a chord" in the menu, in presets as `guess`); the Arpeggiator menu carries the key and scale choice too (Kevin), the Key button's. The arpeggiator is a class of its own now (`audio/arpeggiator.svelte.ts`, modes "replace" for chords and "add" for keys) with one menu (`ArpeggiatorMenu.svelte`) for both instruments; the chord player's behaviour is unchanged.

## [0.99.1] - 2026-10-04

### Fixed

- **A chord tapped near the bar line with the arpeggiator latched** now takes over at the change point and the readout names it (Kevin: it sometimes stayed blank). A chord let go before its change point was never reported to the arpeggiator, so it took over with no holder: with Latch on it is now the latched chord from its change point; with Latch off the change is cancelled and the old chord runs on, or the pattern stops when nothing is held.

## [0.99.0] - 2026-10-04

### Changed

- **One swing for the page** (Kevin: recording in the looper or the recorder wanted the drums and the chord player swinging together): `metronome.swing` is the session swing beside the tempo, remembered with it; the drum machine following keeps its beat's swing at it and its slider sets it, a loaded beat adopts its swing into the session, and the chord player's swing is the session's, set from its arpeggiator or strum menu. The drums' follow switch reads "Follows the session tempo and swing" and sits, with the ratio, on the caret of a Tap Tempo split button (Kevin) rather than on the face of the device; the phone's tempo menu keeps it.

## [0.98.1] - 2026-10-04

### Fixed

- **A pressed note's name darkens** on the chord player in Notes mode, as a pressed chord's does (Kevin: it stayed light on the lit wedge).

## [0.98.0] - 2026-10-04

### Added

- **Text-to-Progression on the chord player** (Kevin: as Text-to-Beat): a Describe menu beside Demos asks a language model for a progression from a description; it lands on the pad in the key and meter, with the model's tempo and, when the description calls for it, the player set up by the model (sound, style, voicing, mode, strum and pattern, arpeggiator, key, octave, sustain, effects: anything a preset holds) (`server/textToChords.ts` through Text-to-Beat's gateway call, `val/TextToChordsSchema.ts`, `utils/parseTextToChordsReply.ts` tested, `remote/textToChords.remote.ts` at 20 an hour; logged as "text-to-chords").
- **Share links for the chord player** (Kevin: as the drum machine's): Share, beside UI at desktop and a section of the phone's wrench menu, copies `/chord-player#<payload>` carrying the sound and effects, the chord settings, the circle's look and key and the session tempo (`val/ChordShareSchema.ts`, `utils/encodeChordShare.ts` with the defaults dropped, `decodeChordShare.ts` parsing through the schema); the page applies a link over the remembered settings and says so.

### Changed

- **Bebop and Cool styles and seven jazz demos** (Kevin, from jazzguitar.be's chord progressions): the Jazz palette's hot and cool halves (`styledChord`, tested), and demos for the I–vi–ii–V and iii–vi–ii–V turnarounds, the minor ii–V–i, a jazz blues, rhythm changes' A section, the backdoor ii–V and descending ii–Vs, each with a setup.
- **One swing for the chord player** (Kevin): the arpeggiator's and the strum pattern's swing are one setting (`chordPlayer.swing`, `setSwing`), shown and adjustable in both menus; presets still carry it under both the arpeggiator and the strum, the arpeggiator's read first.
- **The pad's click follows the Metronome button** (Kevin: it clicked with the metronome off): playback clicks only when the button is on, the button toggles the click while the progression plays, and a running metronome hands over to the pad's click and comes back when the progression ends; the Timing menu's separate click checkbox is gone. A single click on the Arp or Strum button switches it off latch and all, and the padlock shows only while it is on.
- **Strum is the mode** (Kevin): the separate auto-strum switch is gone. With the strum on, a press strums the chord and holding the wedge strums it in the pattern at the session tempo (a new "Once" pattern keeps to the press); the direction turns the pattern's strokes over or alternates each time through; a double click on the Strum button latches the pattern (a padlock icon), as the Arp button's does; switching the strum off ends a running pattern. Presets keep the pattern, speed, latch and swing; demo setups name a pattern.
- **A Stop button on the chord player**: a segment of the Play group beside Chords and Notes (a round button beside the 7 pad on a phone), lit only while something plays on its own, a latched arpeggio or strum pattern or the pad, and greyed otherwise; it and Escape stop everything, the pad included.
- **The chord player has a piano engine of its own** (Kevin: the home page's piano demo changed the chord demo's sound): `chordPiano`, a second `PianoEngine` instance with its own preferences key, drives the chord player, the pad, the device and its Effects menu (`PianoEffectsMenu` takes an `engine` prop); the looper hosts and taps it as its own source and the recorder captures it under `chords`, so the piano and the chords can both be in a take. Sounds and effects set on the chord player before this start from the defaults once.

## [0.97.0] - 2026-10-04

### Added

- **A compressor and a stereo bounce on the piano engine** (Kevin; docs/piano.md, "Effects"), on the piano and the chord player alike, in the preferences and in presets. The compressor sits first in the chain, where the electric bass wants it: Amount (0 off; the threshold down to -40 dB, the ratio to 1:1 at zero), ratio, attack, release, make-up gain, and a gain-reduction bar in the Effects menu read each frame while it is open; the two sections sit last in the menu, after Tone (Kevin: reverb, delay and fuzz come first). The bounce is a panner after the rotary and before the sends, written ahead on the clock in steps of the session tempo (every eighth, beat, two beats, bar or two bars at the metronome's meter, following tempo changes through `metronome.listen`): depth, glide (a jump to a smooth sweep), side to side or via the centre (a stop in the middle), with a dot showing where the sound is. Reset all clears both.

## [0.96.0] - 2026-10-04

### Added

- **One tempo for the page** (docs/audio-engine.md, "One tempo for the page"): the metronome's tempo is the session's, and the drum machine, the chord player's arpeggiator, the progression pad and the looper follow it, so the recorder, the looper page and the home page keep one tempo across their instruments. The drums follow at a ratio (half-time, with the session, double-time) or come off it for a tempo of their own ("Follows the session tempo" under the tempo slider, per browser); a beat that arrives with a tempo (a preset, a saved beat, a generated one, the remembered project) sets the session's. The arpeggiator has a Tempo setting of its own (with the session, half-time, double-time; `constants/tempo.ts`), saved with presets and demo setups, and the screen shows ½× or 2×. The looper's page effect now follows the session tempo rather than the drums'.

- **An auto-strum on the chord player** (`constants/autoStrum.ts`, `chordPlayer.#autoSchedule`): a held chord strummed again and again in a pattern of down and up strokes at the session tempo (down on the beat, down up, folk D DU UDU, country, island, waltz, driving eighths), each slot an eighth or a sixteenth, with Latch and a swing of its own (the arpeggiator's rule); on and off from a double click or tap on the Strum button (its icon a padlock while on) or the Strum menu; the arpeggiator wins while both are on; in presets and demo setups (Amazing Grace strums a waltz, the I–♭VII–IV the folk pattern); the screen shows "auto-strum".

### Changed

- **Chord player presets carry every chord setting** (Kevin's review): the strum's direction and accent, the seventh's kind and the Touch join the mode, style, voicing, octave, strum and the arpeggiator block (on, rate, pattern, octaves, gate, latch, bar alignment, on-beat changes, swing, tempo ratio). A preset saved before a setting existed still lights its button: the match counts only the settings it carries, nested ones included.

## [0.95.0] - 2026-10-04

### Changed

- **The chord player's metronome button stands on its own**, labelled Metronome, out of the Settings group; the strum is a split button beside the arpeggiator's, on or off on the left and its speed and direction on the caret (a Strum section in the phone's wrench menu), the Chords menu keeping the accent; small octave up and down buttons sit above the sustain and 7 pads at the device's edges, and the up and down arrow keys change the octave; the sustain pads use the piano's sustain icon; the screen shows the octave, and a change from the buttons or the arrows shows the new octave in the centre for a moment. The Chords and Strum menus' options read short (Root bass, Top note, Alternate), with a Learn more link to the user docs under each select in place of the long hints. The velocity slider is now Touch, a slider on the device beside Volume (a wrench-menu section on a phone) read as a dynamic marking from pp to ff. At desktop the Chords menu is gone: Style is a split button whose caret holds the seventh's kind and your own styles, Accent sits in the Strum menu, and Effects has its own group between Metronome and Settings (which keeps UI); the phone's wrench menu keeps a Chords section. The UI menu's options read short too (Circle, Arch, At the bottom, Written, By degree), with Learn more links under Layout, Key center and Computer keyboard. The metronome button shows the tempo alone.
- **The arpeggiator lines its pattern up with bars** (on by default, every bar or every two): the pattern restarts from its first note at the bar, dropping what was left, so it lands the same way each bar however many notes the chord and voicing gave it; saved with presets. And chord changes land on the beat (on by default): a chord pressed while the pattern runs joins the running grid at the next change point (a quarter in eighths, an eighth in sixteenths, a beat in triplets), waiting for it when pressed just before and coming in on the next step in its place when pressed just after, latched or held alike, and a chord let go within the last bar at the same tempo leaves its grid behind for the next press to join (`utils/arpSwitch.ts`); off, a new chord restarts the pattern on the press. A Swing slider in the arpeggiator menu pushes the odd eighths or sixteenths late, up to a triplet feel (`utils/arpSwingDelay.ts`, the drum machine's rule); saved with presets. The readout lights the note the pattern is on (a white head with a halo on the staff, the written name bold in the accent), and with Latch on it keeps naming the latched chord and its notes after the wedge is let go.
- **A double click or tap on the Arp button latches the arpeggiator** (and unlatches it), the button's icon a padlock while Latch is on; a chord let go with the next already pressed (legato) now hands over at the change point instead of stopping the pattern.
- **A double tap locks the sustain pad** on the chord player, at desktop and on a phone: the pad stays down (its icon a padlock, "locked" under it) until the next double tap, Escape or the window losing focus; the space bar is unchanged.
- **Demo progressions set the player up**: each demo in `constants/demoProgressions.ts` carries a `setup` (the key, the sound, the style, the voicing, the strum and its direction, the arpeggiator on or off with its rate, pattern, octaves, gate, latch and swing, the octave, the sustain pedal and reverb, delay and chorus levels) applied by `progressionPad.loadDemo` before the chords are laid out, so the twelve-bar blues comes up in E in the Blues style over a bass root, the Canon in D on the arpeggiator with a long reverb, the ii–V–I in F on the electric piano in the Jazz style, the folk tunes on the acoustic guitar with a strum.

### Added

- **An Acoustic Guitar sound** on the piano engine: FreePats' Spanish classical guitar (CC0), forty-eight notes from G1 to C6 as mp3 in static/kits/guitar (`bun run samples:guitar`). The bass and the guitar share one sampled-instrument module (`audio/sampledInstruments.ts`): nothing is fetched until the instrument is chosen, the files nearest middle C land first, each note plays from its own sample as soon as that one is decoded while a synthesized stand-in covers the rest, and a note plays the nearest sample by the smallest shift (octaves of the same pitch class preferred, so the bass's one octave covers the range).
- **Learn mode and demo progressions on the chord player**: Demos puts a progression on the pad in the current key (the pop four, the doo-wop turnaround, ii–V–I, the twelve-bar blues, Pachelbel's Canon, the Andalusian cadence, Amazing Grace, When the Saints, Greensleeves, House of the Rising Sun and more, written by degree in `constants/demoProgressions.ts`); Learn outlines the next chord on the circle and names it in the readout, waiting for it to be played before moving on, on any progression on the pad; Play hears it.
- **Chord inversions by dragging**: drag a little way up within a held wedge for the first and second inversion (C/E, C/G), back down for root position; the readout names the bass note.
- **Preset buttons on a phone**: the five presets as small round buttons at the device's lower right, above the badge.
- **A Minor style**: the key's relative minor as home, with a dominant seventh on its V (the III wedge's major) and a half-diminished ii.
- **Strum direction and accent** in the Chords menu: down, up or alternating strums; the top or bottom note a touch louder.

## [0.94.0] - 2026-10-04

### Added

- **The chord player on the looper and the Idea Recorder** (docs/chord-player.md, phase 3): a "Chords" source beside the piano and a chord player button in each toolbar, opening it in a floating panel of its own (no pad); it is the piano engine, so its capture is the piano's under its own name, a chords layer is shifted like a piano layer, and on the recorder one of the two is in the take at a time. Its settings (`IdeaInstrumentsData.chords`) go with a take or an exported loop and come back with the idea.

## [0.93.0] - 2026-10-03

### Fixed

- **The chord player's text cannot be selected** (the whole device is select-none, the iOS callout off): holding the 7 or sustain pad on a phone was selecting the label instead of pressing (testers).

### Added

- **An arpeggiator on the chord player** (docs/chord-player.md, "The arpeggiator"): Arp beside Chords and Notes makes a held wedge play its notes one at a time at the Timing tempo; the Chords menu sets the rate (quarters to sixteenths and triplets), the pattern (up, down, up and down, as played, random), the octaves, the gate and Latch. A new chord restarts the pattern on the press; the pad's playback goes through it too; styles and voicings decide the notes.
- **An Electric Bass sound** on the piano engine, for the chord player's Notes mode and the piano: FreePats' Finger Bass YR (Andrea Biasior's Yamaha RBX, CC0), twelve notes as half a megabyte of mp3 in static/kits/bass (`bun run samples:bass` rebuilds them), shifted by octaves for the rest of the range and an octave under the key played; a synthesized stand-in sounds until they are decoded.
- **The arpeggiator has its own split button** at desktop size: Arp toggles it, the caret beside it opens its settings; on a phone an Arpeggiator section in the wrench menu. Chord player presets carry the arpeggiator too, on or off and its pattern.
- **The chord player demo on the home page**, after the piano demo, with the site's chord player presets, no pad; the computer keyboard plays whichever demo is in view.

## [0.92.0] - 2026-10-03

### Added

- **Chord player presets carry the chord player's settings**: chords or notes, the style, the voicing, the octave and the strum are saved with the sound and come back when the preset is pressed there; a preset from the piano has none and leaves them alone.

### Changed

- The home page's sign-up line adds "No ads, no trackers." (Kevin).

### Fixed

- **fifths.app and chordplayer.dev** (with or without www) send every path to the chord player from the app's own server hook, after the vercel.json rules proved not to apply on the deployment.

## [0.91.0] - 2026-10-03

### Added

- **The keyboard plays by degree from the start** (1, 4, 5 is I–IV–V); the UI menu's "Where the key sits" is a plain choice, at the bottom (the default) or the top, where a checkbox under the keyboard setting used to be.
- **The chord player's tempo button is a split button**: the tempo starts and stops the click, the caret beside it opens the Timing menu.
- **Honky-tonk, Ragtime and Bossa styles**: sixths and secondary dominants for country; chains of dominant sevenths with diminished sevenths under the pad for stride; maj7, 6/9, 9 and 7♭9 for Brazilian and Cuban tunes. Their recipes (6, 6/9, m6, 7♭9, °7) are in the custom style editor too.
- **Folk and Fifths styles** on the chord player: Folk is a guitar's open shapes (add9 on I and IV, sus4 on V, m7 minors; the 7 pad suspends, or augments I), Fifths is power chords on every wedge (the minor wedge its root's: A5). The new recipes (add9, sus2, sus4, 7sus4, augmented, m(add9), power chords) are in the custom style editor too.

## [0.90.0] - 2026-10-03

### Changed

- **fifths.app and chordplayer.dev redirect to the chord player** (vercel.json, Kevin).

- **Dropdown lists mark the chosen option in bold on a highlight** instead of a check mark, so the lists are narrower (every dropdown: Sound, Style, Voicing, Key, the kits and the rest).
- **The arrow keys turn the chord player's key**: left a fifth down, right a fifth up, as the Key buttons do.
- **The chord player's readout** names the chord at the centre of the hole on every layout (it sat higher or lower by layout) and shows its notes beneath, written out or on a small treble staff with ledger lines and accidentals, spelled in flats on the flat side of the circle and sharps on the sharp side; the UI menu chooses written, staff, both (the staff above the names, the default) or off.

## [0.89.0] - 2026-10-03

### Changed

- **Chord numerals on every wedge**: the chord player's Roman numerals are a device button (IV, beside the keyboard button) and cover every chord relative to the key, the key's six in yellow and the rest (♭VII, ♯iv…) in grey, where the old option wrote only the six; the keyboard and numerals buttons sit in a Guides group.
- **An arch layout for the chord player**: the UI menu's Layout (the Circle menu, renamed, with the layout, the key's place, the signatures, the dim and the keyboard map) swaps the circle for an arch, the key and three fifths each way drawn big across the top, the four far keys as straight buttons continuing its two ends down the page, the tritone left out, so the chords a song mostly uses get the room. With the key at the bottom (the UI menu) the arch turns over, a bowl with the key at the bottom for a thumb on a phone. Remembered per browser. The dim on the chords outside the key is on by default, the key signatures are off by default, and the key sits at the bottom by default (so the arch starts as the bowl). The number row and the row below follow the key wherever it sits: 1 and Q are always the key's chords.
- **Chord styles** (the Chords menu): Plain is the triads with the 7 pad's seventh; Blues puts a dominant seventh on every wedge; Jazz gives each degree its own (maj7 on I and IV, m7 on ii, iii and vi, 7 on V and the borrowed chords, m7♭5 on vii); Lush stacks ninths, elevenths and thirteenths. The 7 pad adds the next extension, the names say what sounds, the style is saved with a progression, and the voicing spreads whatever the style gives.
- **Style and Voicing on the device**: two dropdowns beside Sound, no longer only in the Chords menu (a phone keeps them in the wrench menu).
- **The chord player's own presets** on the shared library (migration 0072 `piano_preset.chord_slot`): the five buttons are the chord player's, their manage menu saves the sound playing to a button, puts any saved preset on one, renames or clears it, and a system admin keeps the site's defaults for them; the library of sounds is the piano's, so a preset saved on one instrument goes on the other's buttons too. The link to the piano page is gone.
- **A sustain pad** beside the 7 pad, held for the pedal, for a tablet with no space bar; from desktop size the two are round pads in the empty corners either side of the arch (the bowl's bottom corners).
- **The arch is the default layout**, and the wedges' names follow the style and the 7 pad: Cmaj7 on the C wedge in Jazz, Cmaj9 while the pad is held.
- **Gliding on the circle**: drag from one wedge onto another without lifting and the chord changes (the first lets go as the next sounds); sliding off the wedges keeps the chord until you lift, as before.
- **Custom chord styles** (migration 0071 `chord_style`): a member's own style from the Chords menu, starting from the one in use, a row per degree with the recipe for the major and minor wedge and what the 7 pad raises each to; saved to the account by name, edited and deleted there, listed under the built-in four.
- **A keyboard map by degree** (the UI menu): 1 to 7 play I to VII as majors, 8 to = the five chromatic roots in rising order, the row below the minors on the same roots, so I–IV–V is 1, 4, 5 and ii–V–I is W, 5, 1. The key labels and the shortcut strip follow the map.
- **Key signatures run along the rim**, turned with their wedge, so a long one no longer runs past the edge.
- **The keyboard key labels on the circle are the piano's blue**, not the accent.
- **The keyboard shortcuts on the device**: Space sustain, Shift seventh and Esc all off sit under the circle from desktop size; with the key labels up, the two rows join them.

## [0.88.0] - 2026-10-03

### Added

- **The Chord Player's progression pad and Timing menu** (docs/chord-player.md, phase 2). With Jot on, the pad under the circle writes every chord played, lasting until the next starts (one, two or four beats at the metronome's tempo; a silence of two beats or more is a rest), grouped by bar; tap an entry to change its beats, make it a rest or remove it, with undo and clear. Play runs the progression through the chord player with the pad's own click on the piano's clock (loop or once), lighting each chord; MIDI exports a `.mid` on a format-0 writer (`utils/midiFile.ts`) the drum machine's export now shares. The pad persists per browser; a signed-in member saves progressions to the account by name (migration 0069 `progression`; `progressions.remote.ts` mirrors the beats: every member opens, editors keep, rename and delete). The Timing menu holds the metronome's tempo (slider, steps, number, Tap), beats to the bar, a free-running click to jot against and the playback click switch. Both are for wider screens; a phone keeps to the circle.
- **Notes with a progression** (migration 0070 `progression.notes`): a member's chord player page has the Idea Recorder's note board under the device, saving as you type and kept with the progression; a note on a pad never saved makes a progression for it, so notes stand alone, and one emptied of both chords and notes goes. The Saved menu's New starts a fresh pad.
- **The chord player and its notes pop out into panels** on a wide screen, draggable and resizable like the looper's, remembered per browser.
- **Reset all to defaults in the Effects menu**, on the piano and the chord player: every effect back as the piano starts, the sound untouched.
- **Roman numerals and a key highlight on the circle**: the Circle menu writes I, ii, iii, IV, V and vi on the key's six diatonic chords and dims the chords outside the key.

## [0.87.0] - 2026-10-03

### Added

- **The Chord Player** at `/chord-player` (docs/chord-player.md, phase 1): the piano's sounds, presets and effects played from a circle of fifths. Press and hold a wedge for a chord, the outer ring the majors and the inner their relative minors, the 7 pad or Shift for a seventh, Notes mode for single notes, the key center turning the circle; the Chords menu's voicings, strum, velocity and octave; the computer keyboard's number row and the row below. In the nav and footer, the sitemap, indexable, open to everyone, with its user doc and page copy. The piano's Effects menu is a shared component (`PianoEffectsMenu.svelte`). On a phone the device is one row (Power, Sound, a Key dropdown, a wrench menu) with the 7 pad under a thumb at the lower left; a keyboard button shows each wedge's key.
- **A limiter on the piano** (and so on the chord player): a fast compressor at the end of the chain catches the peaks of a thick chord, and a chord's notes play a little softer the more of them there are, so chords no longer clip.

### Changed

- **A note the sustain pedal holds plays again when pressed again**, on the piano and the chord player (it kept sounding and ignored the press).

## [0.86.0] - 2026-10-03

### Added

- **Custom drum kits** (docs/drum-machine.md, "Custom kits"; migration 0067 `drum_kit`, `drum_sample`). An account's editors make kits from their own one-shots in the drum machine's Kit row: a name, then a file per drum (uploaded like a demo, counted against the account's storage), replaced or removed one at a time, played by every member. System admins make the site's kits the same way at `/admin/drum-kits`, listed for everyone beside the built-in three, and replace any drum of the built-in Acoustic and Room kits with a file of their own (an override: every other drum stays the built-in file, so nothing loads slower). Every sample shows its filename, format, size, date and uploader with a listen button, and carries a source note for provenance (migration 0068); the built-in drums show their Groovie file and licence. The kit id in a beat is any kit's now; a kit a page was not given falls back to Acoustic, and a share link, with two bits for the kit, encodes a custom kit as Acoustic.
- **Piano: the site's five default presets managed in full** by a system admin (docs/piano.md, "Presets"): a Site defaults list in the manage popover with save-here, rename, move and clear per slot, whatever the admin's own buttons show.

## [0.85.0] - 2026-10-02

### Added

- **One Recordings panel with search** on the Idea Recorder (docs/demo-recording.md). The search field sits at the top of the Recordings panel and narrows the list in place; the panel docks, pops out, or minimises to the toolbar's Ideas button, which brings it back as it was. On a phone the same list opens as a full-screen sheet from that button. The separate search sheet is gone.
- **Calibrate on the Idea Recorder.** The microphone's menu has the looper's Calibrate button: three clicks through the speakers measure the input latency, now kept with the shared inputs (`inputSources.calibrate()`), so a multitrack take's stems line up without a trip to the looper.

### Changed

- **Drum machine styling pass** (Kevin): the readout is unselectable and the layout tightened.
- **Notification links are permanent.** The inbox and digest emails now store an id-based address (`/go/song/<id>`, `/go/project/<id>`, `/go/account/<id>/settings`) that redirects to the page's current URL, so a rename, or a slug reused by a new item, never changes where an old notification leads (docs/notifications.md). Links stored before keep working through the slug redirects.

## [0.84.0] - 2026-10-02

### Changed

- **The free plan holds 20 GB and 6 members** (was 10 GB and 5): `PLAN_LIMITS`, the pricing page, the home page's FAQ, the plan terms and the accounts user doc (docs/billing.md).

## [0.83.0] - 2026-10-02

### Added

- **Idea Recorder page copy** (docs/page-copy.md). The page's title, intro and a "How to use" section with Quick Tips under the recorder come from a copy doc a system admin edits in the app, as on the looper and the other tool pages; the tips show from sm up.

## [0.82.0] - 2026-10-02

### Added

- **Idea Recorder: a Tracks panel for multitrack takes** (docs/demo-recording.md, "Tracks panel"). A take with stems in the player gets the song player under the recorder: each stem with its waveform, mute, solo and fader, a transport and a master. It pops out and docks like the notes.
- **Multitrack by default** once two or more sources are in the take; Stereo stays a choice.
- **Multitrack stems line up.** The input latency (measured by the looper's Calibrate, or the browser's figure) is trimmed off the front of microphone and line-in stems, and the computer capture's latency off the computer's, as a multitrack take is saved, so they sit with the piano's and the drums'. The latency slider now lives in each input's menu on both pages; the looper keeps Calibrate.

## [0.81.0] - 2026-10-02

### Added

- **Idea Recorder: input sources as on the looper** (docs/demo-recording.md, "Input sources"). An Input Source row under the screen with Microphone, Line in, Computer, Piano and Drums, each a toggle into the take with its meter, a settings menu joined to its button (device and channels, the share picker, latency, monitor, normalize) and its gain slider or, for the instruments, their own master volume. Any mix of sources is in a take; the microphone is no longer required, and multitrack is offered with two or more sources in. Meters run before Record. Normalize writes a file from the inputs as 24-bit WAV scaled to −1 dBFS.

### Changed

- **The microphone, line in and computer are shared between the looper and the recorder** (`src/lib/audio/inputs.svelte.ts`, `SourceButton.svelte`, `InputSourceSettings.svelte`): one device, channel and gain setting each, remembered per browser as `stemshovel.inputs.*` (the looper's earlier keys are read as a fallback), and an input opened on one page is open on the other. The recorder's settings menu loses its Stereo input switch and Microphone picker, which live in each source's menu now.

### Technical

- The dev server logs server errors to its console (`handleError`); before, they went to Sentry only.

## [0.80.0] - 2026-10-02

### Added

- **Old addresses keep working.** Renaming a project, a song or an account so that its URL changes records the old address (`slug_alias`, migration 0066; docs/data-model.md), and a visit to it redirects permanently to the current page, query string included, so links already shared do not break. A rename reverted leaves no circle: the live slug always wins and its alias is removed. An account's old slugs stay reserved for it.
- **Share links at their own address.** A share link is now `/s/<code>`, which finds the song or project the code was made for and opens its current page with the code attached; the share popover and the share email use it. Links copied before carry on through the redirect above.

### Changed

- **The URL field no longer follows the name** as you rename an existing project, song or account; "Use name" fills it on request, with a note that the old address keeps redirecting. The account settings page now says what the slug is for.

## [0.79.0] - 2026-10-02

### Added

- **Looper: Line in and Computer sources** (docs/looper.md, "Inputs"). A second input for an instrument on an audio interface, with a device picker for it and for the microphone and a channel mode (stereo, or one channel on both sides); audio from another program through the browser's share picker (Chrome and Edge; a tab anywhere, the whole computer on Windows; on a Mac a loopback device as the line in), with its own latency slider. Each outside source has a gain slider under its button (−12 to +24 dB) and recorded input layers can be normalized to −1 dBFS; the piano and the drums have their own master volume under theirs, the same one their panels move. Each source but the drums has its own settings menu on a small button joined to its right (device, channels, monitor, normalize, latency; the share picker for the computer; the output-latency shift for the piano) in place of the Mic/Inputs menu, and the rows under the screen run sources, settings, transport.

### Fixed

- **Looper: opening the audio twice** (a pointer-down and the click after it) could leave the second caller without the capture node; the device menus open to the right so they fit.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Looper: the Computer source never opened the share picker**: the Permissions-Policy header had `display-capture=()`; it is now `(self)` (securityHeaders.ts and vercel.json).

## [0.78.0] - 2026-10-02

### Added

- **Looper: Save, Save as new loop, Export** (docs/looper.md, "Save and Export"). Save stores the loop with every layer under an idea of the new kind "loop" (migration 0065 adds `idea.kind`), with no dialog (the loop's name is a field above the screen, a placeholder until typed, as the recorder's idea title), and saves again in place after that; Export lists it in the Idea Recorder as an idea. The recorder hides loops unless **Show loops** is on, marking them with a loop icon.
- **Looper: notes on a loop**, the recorder's note board under the device, saved with the loop and back on load.
- **Looper and notes pop out** into draggable, resizable panels on a desktop, as on the recorder page.
- **Page copy on the drum machine, piano, tuner and metronome pages**: their titles, intros and tips are now copy docs edited in the app (`drum-machine-page`, `piano-page`, `tuner-page`, `metronome-page`, seeded by `bun run db:seed-docs`).

### Changed

- **Looper: "Input Source"** names the source group. The Stereo or Multitrack choice is gone: a saved loop always keeps its layers.

### Fixed

- **The piano page's header** was clipped away at every width; it is visible from the small breakpoint and screen-reader-only on phones.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Added

- **Looper: import a take.** The Load menu lists recent Idea Recorder takes; one comes in as layers (a multitrack take one per source, a stereo take as one), with the loop's length taken from the take on an empty loop or the take fitted to the loop otherwise, and a start offset (docs/looper.md, "Importing a take"). `loopSources` hands back the take's own file beside its sources; `looper.importTake`.

## [0.77.0] - 2026-10-02

### Added

- **Looper: Load.** A Load menu lists the loops you exported to the Idea Recorder and brings one back into the looper from its sources, with its tempo, bars and layer levels (`listUserLoops`, the `loopSources` query, `looper.loadFrom`); the Save menu is now **Export** (docs/looper.md, "Export and Load").

### Changed

- **Looper: Record is one lit button.** It starts a layer and, pressed again while recording, makes the pass under way the last; the screen says so. Stop halts the loop and drops a pass still recording. The separate Finish layer and Cancel buttons are gone (Kevin: a relabelled button that seemed to do nothing).

## [0.76.0] - 2026-10-02

### Changed

- **The looper works signed out** (docs/looper.md, "Signed out, and kept in the browser"): the page needs no account; the loop is kept in the browser (IndexedDB) for everyone, written after every change and restored when the looper opens, with "back from last time" on the screen; saving a take still needs an account, which the Save menu says with a sign-in link. The Tools menu and the footer list the looper for everyone.
- **The looper and the piano are indexable**: both on the sitemap, in `isIndexablePath`, robots.txt and the X-Robots-Tag rule, the looper with a title and description like the drum machine page's; the piano had been on the sitemap alone.

## [0.75.0] - 2026-10-02

### Added

- **Page copy edited in the app** (docs/page-copy.md): a page's title, intro and the tips under its device are a user doc of kind "copy", edited by a system admin at `/docs/<slug>/edit` as the releases page is, rendered by `PageCopyHeader` and `PageCopySection` with `pageCopy()` and `splitPageCopy`; the looper page is the first (`looper-page`, seeded by `bun run db:seed-docs`), with a "How to use the Looper" box and quick tips under the device.
- **Looper: Stereo or Multitrack take** in the Save menu, multitrack (the layers as the take's sources) by default.

### Changed

- **Looper: skinned as a device** like the drum machine and the piano (docs/looper.md): the chassis, a screen with the loop's position, status and progress, labelled button groups, and the "SS Loop 001" badge, the page header as the other instrument pages', and the settings in three menus on the device, Timing (tempo with Tap, bars, beats, count-in, click), Mic (monitor, latency and Calibrate, the output latency and the piano shift) and Save (title, passes, Save as take); the layout by container queries. Choosing Piano or Drums as the source opens that instrument's panel.

## [0.74.0] - 2026-10-02

### Added

- **Looper** at `/looper` (docs/looper.md, phase 1): a loop of 1 to 8 bars at a tempo plays round and round while layers are recorded onto it one pass at a time from the microphone, the piano or the drum machine; layers have level, mute, solo and delete, with undo and clear; a count-in and a click; microphone latency compensation with a Calibrate measurement; **Save as take** renders the layers' mix and files it in the Idea Recorder as a take with each layer as a source, ready to go to a song as stems. One AudioContext hosts the instruments (`hostContext`, `output`, `startAt` on the engines), capture is an AudioWorklet (`static/worklets/loop-capture.js`) that copies exactly one loop length per pass from the loop's bar 1, layers are 24-bit WAV (`encodeWav24`), and `findLatency` measures the clicks; piano layers played by hand are shifted earlier by the device's reported output latency, the microphone's by the measured round trip. Tools menu, footer, smoke row and user doc.

## [0.73.0] - 2026-10-01

### Added

- **Idea Recorder: multitrack takes** (docs/demo-recording.md, "Multitrack takes"). With an instrument in the take, the recorder offers **Stereo** (the default on every visit) or **Multitrack**: beside the mix, the microphone and each instrument are recorded to a file of their own (a MediaRecorder per source started in the same tick as the mix's, the same format), uploaded after the take as its sources (`recording_stem` table, migration 0064; `POST /api/recordings/[id]/stems` to reserve, `/api/recording-stems/[id]/ready`; kept in IndexedDB with the take, so a retry after a failed source does not save the take twice). The take lists with its source count, and **Add N stems to song…** in its menu (and the recorder's ⋯ menu) copies the sources onto a song in any account the user edits as stems with their labels (`addRecordingStemsToSong`, `copyRecordingStemsToSong`), the song's playback renditions following in the jobs function. Sources count against the account's storage and go with the take when it or its idea is deleted.

### Changed

- **The Idea Recorder is the user's own page at `/ideas/recorder`** (docs/demo-recording.md). Ideas belong to the user, whichever account they were recorded in, and list together; the old `/[account]/ideas/recorder` and `/[account]/ideas` redirect, `?song=` kept. New takes are filed under the current account (the one neutral pages treat as the user's), where their storage counts, and a take can go to a song in any account the user edits (the song picker labels projects with the account's name when there is more than one). Ownership checks (`ownIdea`, `ownTake`, the take reservation, ready and upload-token routes) go by the user who recorded, not membership. `listUserIdeas`, `deleteEmptyIdeas(userId)`; `copyRecordingToSong` and `mergeIdeaNotesIntoSong` file the demo and the notes under the song's account.

- **Idea Recorder: instrument settings are saved by takes, not by every change.** A recorded take carries the drum machine's project and the piano's sound and effects to its idea (saved once the take lands, on the idea it went to), each unless the new **Settings with the idea** switch beside "in the take" is off; the server merges an instrument at a time. An idea is no longer stamped with the current settings the moment it is shown, which had made switching among older ideas look like nothing changed (Kevin). `SavedTake` carries `ideaId` and the take's `instruments`; the unused `stableStringify` util is gone.

## [0.72.0] - 2026-10-01

### Added

- **Idea Recorder: the instruments travel with the idea** (docs/demo-recording.md, "The instruments travel with the idea"). The drum machine's project and the piano's sound and effects are saved on the idea as they change (`idea.instruments`, JSON, migration 0063; `saveIdeaInstruments`, debounced a second) and put back into the instruments when one of the idea's takes is shown; an idea without any leaves the instruments as they are. The piano's panel gets the site's and the account's presets, so its preset buttons show there (Kevin: they were missing from the panel at every size).

### Changed

- **Idea Recorder: the drums and the piano join the take whenever their "in the take" switch is on**, their panels open or not, so an instrument started after Record still lands; an idle instrument contributes silence at no cost to the recording.
- **Idea Recorder: a meter per instrument.** The piano and the drums each get their own level meter above the microphone's while they play into the take, with their icons, in place of one combined meter under a piano icon (Kevin: "I don't see an input level indicator for the drums"), and the microphone's meter then reads the microphone alone rather than the whole mix. `DemoRecorder`'s `instruments` now returns `{ label, icon, stream }` per instrument.

## [0.71.0] - 2026-10-01

### Added

- **Idea Recorder: the drum machine in a floating panel** (docs/demo-recording.md, "The drum machine panel"). On a desktop, the toolbar's drum button opens and closes the full drum machine in a panel dragged by its header and resized by its corner, its place remembered (below the large breakpoint the compact play/stop/tempo control stays). The space bar goes to the instrument touched last, the drums (play and stop) or the piano (sustain), and toolbar buttons blur after a click so a focused one never swallows it. A second meter above the microphone's shows the instruments' level while any play into the take. A click or focus inside any panel brings it to the front. The recorder device lays itself out by its own width (container queries), so it fits its panel or column. **The recorder and the recordings list can pop out** of their column into a panel and dock back (a button in the header), so the whole screen can be arranged; a docked panel goes back to its original size, and the drag grip shows only on a floating one. **The metronome, the tuner and the notes get panels too**: on a desktop the metronome button opens the full metronome in a panel (the compact control stays below the large breakpoint), the tuner opens from its button into a panel in place of its popover, and the notes pop out of their column into one (a button in their header; the same button docks them back). **The piano gets the same panel** on a desktop, "Piano in the take" in its header, and the microphone has a mute button beside its meter (on by default, back on with every visit) in place of the piano's "Microphone in the take"; below the large breakpoint the panel docks under the recorder, one instance either way. **The drums go into the take** while they play, as the piano does (the engine's capture stream joins the recorder's mix, asked at Record so a beat started later still lands), and **Drums in the take** switches them out so a beat can be a click track that stays out of the recording.

## [0.70.0] - 2026-10-01

### Added

- **Idea Recorder: a waveform on the screen** (docs/demo-recording.md, "Waveform"). While recording, a strip scrolls as the take grows, one bar per frame of the input's level; once a take is in, the whole take's waveform with a playhead, clicked or dragged to seek, arrow keys to nudge. The take is decoded once in the browser (its own recording, or the MP3 made for playback); a file the browser cannot decode keeps the centre line and the slider still seeks. Both views scale to their loudest moment with a curve that lifts quiet detail, as a phone's voice memos do, so a quiet take still looks like it captured something.

## [0.69.0] - 2026-10-01

### Changed

- **Each drum sits where it usually does** (Kevin): hats and ride a little right, the floor tom and crash left, kick, snare and clap centred, from the audience's side. Preset rows that name no pan, generated rows, Text-to-Beat rows (unless the model pans one itself; the prompt offers it) and rows added by hand or by a MIDI pad take it. The starting beat and the tutorial kit stay centred.
- **The generator's hip-hop style and the boom bap preset arrive on the electronic kit** (Kevin: it just sounds better), as house and half-time do, and **every style brings its tempo** (rock 120, hip-hop 90, house 124, breakbeat 138): a generated replacement takes it, a pattern added after yours keeps yours.
- **"Use as the home page beat" on the drum machine page too** (system admins; Kevin asked where it was): the ⋯ menu item that makes the beat in the machine the home page's starting one was only on the home page's own demo.

## [0.68.0] - 2026-10-01

### Added

- **Piano and drum machine: a Tone section** (docs/effects.md, "Tone"). One shared stage on the master of both: Tilt (a low shelf and a high shelf moving opposite ways, dark to bright), Air (an exciter after the Aural Exciter: harmonics made above 3 kHz and mixed back, sparkle a dull sound never had) and Bottom (after the intent of the same unit's Big Bottom: the band under 100 Hz boosted and gently warmed in place, bass that feels bigger with the mids untouched; the fundamental up 5.3 dB at full, measured, after four designs that cancelled themselves or read as grit). In the piano's preferences and presets (`tone`) and the beat's effects (`toneTilt`, `toneAir`, `toneBottom`; share links at format version 9, older links open flat). The hip-hop and dance presets and generator styles bring Bottom, disco, pop and funk a touch of Air, and Text-to-Beat knows all three.

## [0.67.0] - 2026-10-01

### Added

- **Drum machine: a master volume** (docs/drum-machine.md, "Master volume"): a Volume slider beside Humanize (in the tempo menu on a phone), a listening choice remembered per browser and not part of the beat, the link or the WAV.

### Changed

- **Drum machine: presets, generated beats and Text-to-Beat choose their kit** (Kevin): every preset names one (trap, house, techno and drum and bass on the electronic kit, the rest acoustic), each generator style names one (house and half-time electronic; the fill keeps the kit in use), and the model picks acoustic or electronic from the description. Only those two for now; the Room kit waits on an identity Kevin is happy with.

## [0.66.0] - 2026-10-01

### Changed

- **Drum machine: generated and AI-generated beats reset or apply swing and humanize** as presets do (Kevin). Each generator style names its feel (funk and hip-hop swing, house barely humanizes) and Text-to-Beat's reply may name a humanize amount beside its swing; a replacement resets swing to straight and humanize to the usual amount before applying what came with the pattern, and adding a pattern applies only what came with it.
- **Drum machine: every preset arrives with its own effects** (Kevin): a room on the rock and pop beats, tempo-locked echoes on house, techno and trap, tape-style delay on motown, boom bap, the shuffle and the one drop, more room on the ballads and waltz, a little fuzz on boom bap. Loading a preset resets the effects to its own; adding one as a pattern leaves yours alone. A test holds every preset to a room or an echo within tasteful levels.

## [0.65.1] - 2026-10-01

### Fixed

- **Account settings said sign-up was invitation-only** even with sign-up open (Kevin). The Invite codes section, and the admin's new-account codes page, now word themselves by the sign-up mode: with sign-up open, a code is what joins the newcomer to the account.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.65.0] - 2026-10-01

### Added

- **Piano: a metronome** (docs/piano.md, "Metronome"). The page's metronome behind a metronome-icon button in the More strip (lit while it runs) that opens a small menu: start or stop (the icon swells on the downbeat), a tempo field, Tap and the beat, with the tempo and the beat on the screen while it runs; in the compact layout a section of the device menu. The piano page only; the recorder keeps its toolbar metronome.

- **Drum machine: effects in the tutorial, the generator and Text-to-Beat.** The tutorial gains "Put the kit in a room" and "An echo between the beats" after Humanize, with Do it for me and the Effects button outlined; starting it resets every effect level and send (the test holds the tutorial project to the defaults). Each generator style brings its own effects (a room on rock, a dotted-eighth delay on house) and a generated beat resets to those. Text-to-Beat's reply may carry effects when the description asks ("with a big room", "a dub-style delay", "fuzzed up"), and a beat without any arrives dry.

### Changed

- **Drum machine: wah gain compensation.** The wet is lifted by 3.5 dB at full mix, scaled with the mix (Kevin: more wah read as less volume; the starting beat measured 3 dB quieter fully wet).
- **Drum machine: the foot's buttons in two rows until the device is wide.** On a phone the Text-to-Beat, Generate, Presets and Play buttons stack full width as before; from the small container breakpoint they are a wrapping row of same-size, natural-width buttons under the Row, Clear, Undo, Effects, MIDI and ⋯ row (Kevin: the two groups got messy sharing a row in between); from the large breakpoint the two groups share one row. Between the small and large breakpoints Play sits at the right end of its row, where the eye looks for it.
- **Drum machine: layout by container, not viewport** (docs/drum-machine.md, "Layout by container"), as the piano's: every breakpoint class in the full view is a container query (`@xl-`, `@2xl-`, `@4xl-` for `sm-`, `md-`, `lg-`; the device root is the `@container`), so it can open in a popover or a panel and lay itself out by the room it has.
- **Links to the user docs** at the foot of the piano and drum machine pages ("Learn more about using the piano in the user docs", a button to /docs/piano; the same for the drum machine), and a "Free standalone version" link from the home page's drum machine demo to /drum-machine, as the piano demo has.
- **Drum machine: the usual sends roughly double or triple.** Reverb: kick 5% to 30%, snare 40% to 80%, clap 45% to 90%, hats 30% and 50%, toms and ride 60%, crash 70%, rim and cowbell 40% and 30%. Delay: kick 0% to 15%, snare 15% to 45%, hats 30% and 40%, clap 50%, rim 80%, toms, ride and crash 30%, cowbell 70%. Kevin: a master at 100% with the per-drum defaults should sound like too much, not a tasteful amount, so the useful range is the middle of the slider; at 5% the kick needed the master reverb pushed a long way before it changed. New beats, added rows, Reset to defaults and links from before the sends existed use them; saved beats keep their own.
- **Piano: layout by container, not viewport** (docs/piano.md, "Layout by container"). Every breakpoint class in the piano is a container query (`@xl-`, `@2xl-`, `@4xl-` for the old `sm-`, `md-`, `lg-`; the root is the `@container`), so the piano lays itself out by the width it is given and can sit in a popover or a panel; the save popover asks which manage button the container shows instead of `matchMedia`. Two of Kevin's classes that were never valid became `@4xl-w-32px` and `!@4xl-text-slate-400`.
- **Piano: the compact device menu in sections.** Below the wide layout the menu is an accordion of Metronome, Presets, Volume (open to start), Effects and More, one open at a time, so it stays short.

## [0.64.0] - 2026-10-01

### Added

- **Drum machine: a wah** (docs/drum-machine.md, "Wah"). The piano's wah stage on the drum bus after the fuzz, now shared in `src/lib/audio/fxStages.ts`: a filter sweep timed to the beat (one cycle per beat, two beats, one, two or four bars) with range, resonance (capped at 10 dB on drums) and level, in a third column of the Effects menu. Part of the beat: saved, in the link (format version 8; older links open with it off) and in the WAV; Reset to defaults covers it.

## [0.63.0] - 2026-10-01

### Added

- **Piano: a wah** (docs/piano.md, "Effects"; docs/effects.md). A Wah section in the Effects menu between the fuzz and the chorus: a resonant low-pass whose cutoff an envelope follower opens with how hard you play (Touch, with a sensitivity slider), or an LFO sweeps (Sweep, with a rate), with range and resonance (the low-pass's Q, in decibels, 0 to 15) and a mix. A MIDI mod wheel, expression pedal or foot controller (CC 1, 11, 4) rides the wah while it sends. Off by default, remembered, and part of a preset.

## [0.62.0] - 2026-10-01

### Added

- **Piano: presets** (docs/piano.md, "Presets"). Five numbered buttons under a Presets label hold named presets of the sound and every effect; the screen names the one the sound sits on, "edited" once a slider moves. Click loads; ⌘-click, Ctrl-click or a hold opens a save popover for that slot; a bookmark button opens the full list with search, rename, slot assignment, delete and share links. Three layers: the site's defaults, which a system admin saves from the piano ("Save as site default"; one app setting), a signed-out player's own slots in the browser, and a signed-in member's presets in the account (`piano_preset`, migration 0062; up to 100; at most one per slot; editors save, viewers load). A link, `/piano#preset=…`, opens the piano with a preset for anyone, nothing kept until they save. The home page demo shows the site's presets.

### Fixed

- **Menus opened by code lost their place.** A ContextMenu opened through `bind:openState` called `showPopover()` directly, which gives CSS anchor positioning no anchor, so the menu landed in the viewport's corner; it now opens through its own trigger. The piano's and drum machine's effects menus and the presets menu are capped to the space beside their button (`max-h: calc(100% - 0.5rem)` in the anchor's grid area) and scroll, instead of running past the bottom of a short window.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.61.0] - 2026-09-30

### Added

- **Drum machine: MIDI input** (docs/drum-machine.md, "MIDI input"). A MIDI menu beside Effects (where Web MIDI exists) connects a pad or keyboard: General MIDI drum notes play their voices, any other note plays the open pattern's rows in order, each hit through the row's level, pan and sends. With **Record hits into the grid** on, a hit while the beat plays lands at the nearest step as a ghost, normal or accent by velocity, adding a row for a drum the pattern lacks; off by default. The one-hit player is the step player's, factored out (`playDrumHit`).
- **Drum machine: analog delay and fuzz.** The Effects menu gains the delay's Digital/Analog choice and a fuzz (drive and tone) on the dry drums, the sends staying clean; both from the stages the piano and the drum bus now share (`src/lib/audio/fxStages.ts`). Part of the beat: saved, in the link (format version 7; older links open with them off) and in the WAV. Reset to defaults covers them.
- **Piano: a flanger**, in the phaser's place: a Phaser/Flanger switch heads the section and the mix, rate and depth sliders serve whichever is chosen (Kevin: one or the other, to save menu space). Remembered as `phaser.mode`.

## [0.60.1] - 2026-09-30

### Changed

- **Piano page copy** (Kevin): the "How to Play" section gains an introduction and sub-headings (The Basics; Instruments, Octaves & Effects; Playing on the Computer Keyboard; MIDI), names the letters toggle, and points at the MIDI button by its icon. Review fixes: grammar, MIDI casing, the inline icon hidden from screen readers.

## [0.60.0] - 2026-09-30

### Added

- **Piano: fuzz, phaser and rotary speaker** (docs/piano.md, "Effects"). Three more sections in the Effects menu: a fuzz (drive into a soft clipper with a tone control after, its make-up holding the loudness where the clean sound sits), a phaser (four swept all-pass stages, mix crossfading to half and half where the notches are deepest) and a rotary speaker (the sound split into a horn and a drum spun through Doppler, level and pan, Off/Slow/Fast with the rotors gliding between speeds). Off by default and remembered; the menu takes three columns from lg.

### Fixed

- **Web MIDI was blocked by our own Permissions-Policy header** (`midi=()`), so Connect MIDI failed on the deployed site while it worked on the dev server (a user report); the header constant and vercel.json now allow `midi=(self)`, and vercel.json's copy matches the constant again (it had fallen behind on `microphone` and `screen-wake-lock`).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Piano: the tremolo's Chop shape crunched** on a sustained note: the square LFO stepped the level instantly. It now passes an 80 Hz low-pass so each edge takes about 5 ms, still a chop, without the click.

## [0.59.0] - 2026-09-30

### Added

- **Piano: analog delay, chorus and tremolo** (docs/piano.md, "Effects"). The Effects menu gains a Digital/Analog choice for the delay (Analog puts a soft clip and a darker low-pass in the feedback loop and a slow wobble on the time, so repeats darken and soften like tape), a chorus (mix, rate, depth: two swept delay lines panned apart) and a tremolo (depth, rate, Smooth or Chop). The chain now lives in `src/lib/audio/pianoFx.ts`, plain Web Audio that an OfflineAudioContext renders the same, with `update` ramping every level so sliders never click. The menu lays out in two columns from sm and scrolls when the window is short; the button lights while any effect is up; every new setting is off by default and remembered.

## [0.58.0] - 2026-09-30

### Added

- **Piano: an Effects menu with a delay** (docs/piano.md, "Effects"). An Effects button in the controls row, as the drum machine's, holds the reverb level (moved out of the row) and its room size (the impulse is synthesized again as the slider moves) and a new delay with its time (50 ms to 1 s), feedback and level; the button lights while either is up. The delay is the drum bus's shape in the piano's graph, ramped so sliders do not click, and the settings are remembered. On a phone the sliders sit in the levels menu.
- **Piano: Kevin's layout pass.** The controls in one row that grows with the width (a compact icon strip for pedal, MIDI, hi-res, key guides and letters from lg up; a single menu holding volume, effects, hi-res and MIDI below it), the key guides in their own menu with a "Turn Off All Guides" button, the page heading hidden on a phone, the key marks in blue with the root in purple, the octave name at the top of each C key. Review fixes: labels that were not labels became spans, turning the guides off saves like any other change, the connected MIDI button's words hide at lg like its other state, and the device group-label shortcut keeps its dark text (the drum machine's labels had gone light).
- **Piano: a small toggle for the key letters.** A keyboard-icon button beside the octave control hides or shows the computer-key letters printed on the keys (`labels` in the preferences, on by default); degrees still show when chosen.

## [0.57.0] - 2026-09-30

### Added

- **Piano: a key and a chord readout** (docs/piano.md, "Key and chords"). A Key group chooses a root and a scale (nine of them); the keys in it carry a mark, the root a yellow one, the rest go a shade darker, and 1–7 numbers them by degree. The screen names what is held: a note, an interval, or the chord with inversions as slash chords, and in a key its Roman numeral. `scales.ts`, `scaleDegrees.ts`, `chordName.ts` (tested); remembered in the preferences.

### Fixed

- **Piano key labels line up.** The octave name on the C keys pushed their letters up; every white key now has two fixed rows, the name above and the letter below.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.56.1] - 2026-09-30

### Added

- **Hi-res piano samples for browsers without FLAC** (docs/piano.md). The piano decodes a tiny FLAC probe once at load; where the browser cannot, the Hi-res button fetches the same six layers and release samples as the best mp3 instead (`piano/v1/hires-mp3/`, 55 MB, the encode script's fourth tier; upload it per stage with `bun run samples:piano -- --upload --tier hires-mp3`), and says so in its size and title. `pianoTierFiles` takes the choice (tested).

## [0.56.0] - 2026-09-30

### Added

- **The piano records into the Idea Recorder** (docs/piano.md, Phase 2; docs/demo-recording.md). A piano button beside the drums in the recorder's toolbar (the wrench menu on a phone) opens the full piano under the recorder, and its sound goes into the take, mixed with the microphone, or alone with "Microphone in the take" unticked. `piano.captureStream()` (a MediaStreamAudioDestinationNode on the piano's master) feeds `DemoRecorder`'s new `instrument` prop, mixed in its metering context into the stream the MediaRecorder records; the meter reads the mix. The recorder page's load passes the sample tiers' base so the Grand Piano fills in there too.

## [0.55.1] - 2026-09-30

### Fixed

- **The piano's Hi-res button hid behind another sound.** It only showed while the Grand Piano was chosen, so a browser remembering the Organ had no button. It shows whatever the sound now, and pressing it with another sound chosen switches to the Grand Piano and starts the download. And the tiers decode through an offline context until the piano is on, so a remembered Hi-res choice no longer waits at 0% for the switch.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.55.0] - 2026-09-30

### Added

- **The Grand Piano in three sample tiers** (docs/piano.md, "Sample tiers"; Kevin's ask): the first subset was a 39 kbps mp3 and sounded thin. `scripts/piano-samples.ts` (`bun run samples:piano`, with `--download` and `--upload`) now makes, from the Salamander's lossless recordings: a demo tier (one layer, mp3 VBR q2, 10 s, 3.4 MB in `static/kits/piano`, what the home page plays and the piano page's first sound), a standard tier (four velocity layers and the 88 release samples, mp3, 14.5 MB) and a hi-res tier (six layers and the releases as 16-bit FLAC, 72 MB), the last two in each stage's public Blob store under `piano/v1/` (production uploads from Kevin's machine). The piano page loads the standard tier in the background, middle octaves first; a **Hi-res** button fetches the lossless tier once through the browser's cache and the choice is remembered. Notes crossfade between the two layers around their velocity (`src/lib/utils/pianoLayers.ts`, tested), release samples play on key-up (about 40 dB under the note at most and high-passed, a whisper on a tap, quieter the longer it rang; the first levels were a clunk), and the velocity filter only closes for a light touch now. The screen names the tier and its progress.
- **The piano's Grand Piano** (docs/piano.md, Phase 2): a sampled concert grand, first in the sound list and the default. Thirty notes of the Salamander Grand Piano (Alexander Holm, CC BY 3.0) in the mp3 subset Tone.js publishes, one every three semitones, two megabytes in `static/kits/piano/`, fetched at the piano page's load (the home page's demo fetches on its first touch) and decoded once there is a context (`src/lib/audio/pianoSamples.ts`); a note plays the nearest sample pitched by its playback rate, through a low-pass that closes for a soft touch, damped on release. The screen says "loading the piano…" until the samples are ready, and the Electric Piano stands in meanwhile. Credited on /built-with and in the piano's doc.
- **A piano demo on the home page**, full width under the drum machine, with a "Free standalone version" link to /piano beside the call-out; the piano's demo samples and the drum kit are fetched as their sections scroll into view, never at load; the computer keyboard goes to whichever demo is in view, now the piano too.
- **An Instruments menu** in the nav, between Projects and Tools, with the drum machine and the piano; the Tools menu keeps the Idea Recorder, the tuner and the metronome. The footer has an Instruments row above the Tools row. On a phone the nav's menus sit closer together and the account button shows its icon alone, like the other two.

## [0.54.1] - 2026-09-30

### Fixed

- **Piano on iOS: notes came late, together.** The AudioContext opened on the first note and the note was scheduled at its time before it had resumed, so on iOS (which starts contexts suspended and resumes them slowly) every note pressed in that moment sat at time zero and sounded a second or two later, all at once. The piano now warms the context on the first touch or key (`piano.warm`) and, when the context is not yet running, starts a note only once it is (skipping it if the key was let go meanwhile); the context asks for interactive latency. And a **power switch** (Kevin's ask, as the tuner has): full width under the screen on a phone, in the controls row on a desktop; On warms the audio ahead of the first note so it is not late either, Off silences and suspends it; the screen says "off" or "starting…" and dims until then (as the tuner's). The wake is watched by polling the context's state rather than the promise from `resume()`, which on iOS never settled and left the switch on "Starting…"; a silent buffer plays as the old iOS unlock, and the switch gives up after three seconds. On a phone the keys carry no computer-key letters.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.54.0] - 2026-09-29

### Added

- **A piano and synth** at `/piano` (docs/piano.md, Phase 1), in the Tools menu and the footer. Five synthesized sounds (`src/lib/audio/synthVoice.ts`: Electric Piano, Organ, Synth Lead, Pad, Pluck), played from the on-screen keys (three octaves, two on a phone where they stand on end down the screen; multi-touch; a slide across the keys; lower on a key is louder), the computer keyboard (the two-row mapping by physical key, arrows for the octave, space for the pedal, escape for silence) or a MIDI controller (`Connect MIDI`, Web MIDI on Chrome and Edge: velocity, the sustain pedal, all-notes-off). A sustain pedal with proper bookkeeping (`HeldNotes`, tested), twenty-four voices with the oldest stolen, a small reverb, volume, and the choices remembered per browser. On a phone the volume, reverb and MIDI controls sit in a menu beside a compact octave control, and the Sustain button is not shown. The engine is `src/lib/audio/piano.svelte.ts`; the user doc is `scripts/user-docs/piano.md` (seed it with `bun run db:seed-docs`).

## [0.53.0] - 2026-09-29

### Added

- **Songs can be reordered on the project page**, like stems in the player: a member drags a song by the grip before it, or focuses the grip and presses the arrow keys, within its list (Finished, In Progress or Ideas); one order runs across the three lists (`reorderWithinGroup`), so the others never shift. Saved to `song.sort_order` (`reorderSongs` in projects.remote.ts, editors only), and the playlist follows. A new song now takes the last place (`createSong` sets `sortOrder` to max + 1) instead of slotting in by title. The stem player's drag shares the helpers (`dropIndexAt`, `moveId`, tested).

## [0.52.0] - 2026-09-29

### Added

- **Stems can be reordered in the player** (a user's request). A member drags a row by the grip before its name, or focuses the grip and presses the arrow keys; the rows follow live and the order is saved to the song (`stem.sort_order`, `reorderStems` in songs.remote.ts, editors only), so everyone sees it and the downloads and the zip follow. Pointer events, so it works by touch. `StemPlayer` takes `onreorder` and draws the grips when it is given; `StemEngine.reorder` (through `reorderById`, tested) also follows a refreshed manifest's order.

## [0.51.1] - 2026-09-29

### Changed

- **Home page: the tuner is back to manual On / Off.** Opening the microphone as the tuner scrolled into view (v0.50.0) made the browser ask for permission again and again as the page went up and down; `Tuner`'s `startOnView` is gone.

### Fixed

- **/releases showed nothing newer than v0.48.0.** `parseChangelog` only knew `## [x.y.z] - date` headings, and the last three sections were written as `## x.y.z — date`; it now takes both spellings (and a hyphen or an em dash), with a test.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.51.0] - 2026-09-28

### Added

- **Drum machine: a pattern generator** (docs/drum-machine.md, "Pattern generator"). A Generate menu beside Presets draws a pattern from a style (rock, pop, funk, hip-hop, house, breakbeat, latin, half-time, fill) at a density: the style's backbone is always there and the density decides how many of its maybes come out. The draw fits the open pattern's meter and length and keeps its rows' settings; a drum the style needs is added, one it does not play is left silent; Undo brings the pattern back, and "Add as a pattern" puts the draw after the open one. `src/lib/constants/drumGenerator.ts` (the styles, in the presets' row-string spirit), `src/lib/utils/generateDrumPattern.ts` (pure, seeded through `seededRandom`, tested for every style, meter and length), `drumMachine.generate`. The usual level per voice moved to `DRUM_USUAL_LEVEL` in the constants, shared with the presets.
- **Drum machine: Text-to-Beat, a prototype** (docs/drum-machine.md, "Text-to-Beat"). A menu beside Generate, shown when the AI Gateway is configured, takes a description of the beat you want and asks a language model for it: the answer fits the open pattern's meter and length, brings a tempo and swing when the model suggests them, lands in the open pattern (Undo as for a preset) or as a new one, and the menu shows a loading state while it waits and the model's note after. `src/lib/server/textToBeat.ts` over the AI Gateway's REST endpoint with reasoning off (a thinking model takes minutes over a beat and does no better; with it off Kimi answers in about four seconds), the model from the new `TEXT_TO_BEAT_MODEL` (default `moonshotai/kimi-k2.6`, open-weight; swap it to compare), the reply in the presets' row-string form validated by `parseTextToBeatReply` (tested) with one retry on a bad answer, every call logged in `ai_request`, 20 an hour per user or address (`textToBeat.remote.ts`). `drumMachine.placePattern` is the shared way a pattern from the generator or the model lands with undo.
- **Home page: the drum machine demo fills its column** (the 860 px cap is gone).
- **Drum machine: a timeline, built but hidden** (docs/drum-machine.md, "Timeline"): the row carries a `hidden` class while Kevin refines its design, everything behind it stays, and the user doc's Timeline section waits in docs/drum-machine.md. A row under the patterns arranges them into a song: bars, each a pattern, added from the open pattern, removed one by one or cleared, moved with shift + arrows; Pattern / Song buttons choose whether Play loops the open pattern or plays the bars in order. The song plays from the same scheduler (the bar's pattern chosen at the top of each cycle; a bar pressed while playing takes over at the end of the cycle; the sounding bar lights and the readout counts them). Song mode is engine state (`songMode`, on when a project with a timeline loads, off when the timeline empties); the timeline is project state (`timeline`, up to 64 pattern indices, `MAX_DRUM_TIMELINE`), so saved beats and share links carry it (links move to version 6; `DrumRowSchema` and older links unaffected). Downloads and "Add to … as a demo" follow the mode: `renderDrumSongWav` renders the bars once through with a two-second tail, `encodeDrumMidi` takes a sequence of bars and writes the time signature where it changes. Removing a pattern drops its bars and renumbers the rest. The recorder's compact picker offers "Song" beside the patterns.

## [0.50.0] - 2026-09-28

### Added

- **Drum machine: Reset to defaults** in the Effects menu: master levels back to zero, every drum in every pattern back to its usual sends (`drumMachine.resetFx`).
- **Home page: the demo's starting beat is chosen in the demo.** A system admin builds or loads a beat in the home page's drum machine and picks "Use as the home page beat" from its ⋯ menu (`setHomeBeat`, the `homeBeat` app setting, JSON of the project); a first-time visitor's machine opens with it (`DrumMachine`'s `starting` prop, `drumMachine.load(warm, starting)`), a browser that remembers a beat keeps its own, and a share link still wins. /admin/home shows the chosen beat with a way back to the built-in one (`clearHomeBeat`).
- **Home page: a metronome demo** beside the tuner. The Songwriting Tools section shows one of the two at a time, chosen by a pair of tabs (the tuner first and open by default); the copy names both. The tuner opens the microphone as half of it scrolls into view and closes it when it scrolls right out (`Tuner`'s `startOnView`, on the same `visibleShare` attachment); once the visitor turns it off, it stays off. Its On / Off button now carries `aria-pressed`.
- **One transport at a time** (`src/lib/audio/onlyOnePlays.ts`): the stem player, the drum machine and the metronome claim playback as they start, which stops whichever of the others was playing, so a visitor who presses play on the home page's player and scrolls to the drums does not hear both. The drums and the metronome already traded places; this brings the stem player in.

### Changed

- **Drum machine: beats and links from before the effects get the default sends.** A row stored without sends (a beat saved, or a link made, before 0.49.0) used to come back sending nothing, so raising a master level did nothing until every send was set by hand; it now gets its voice's usual sends (`DrumRowSchema` fills them in on read, `upgradeDrumProject` for version 1, the share-link decoder leaves it to the schema), the same as a new beat. Saved beats keep the effects they were saved with: the delay and reverb settings and the sends are part of the project.
- **Drum machine: a sounding cell stays lit under the pointer** (the accent at 85%, so the hover still reads); the device button's hover colour is for the empty cells only.
- **Home page: the space bar follows the scroll.** Space used to drive the stem player from anywhere on the page and never the drum machine. Now it goes to whichever of the two demos is in view (`src/lib/utils/visibleShare.ts`, an IntersectionObserver attachment; a demo counts once half of it, or half a screen of it, shows; the one showing more wins) and to neither when both are scrolled away, so space scrolls the page there. `Transport`, `StemPlayer` and `SongPlayerDemo` take a `keyboard` prop for it, like `DrumMachine` already did.

## [0.49.0] - 2026-09-28

### Added

- **Delay and reverb** in the drum machine (docs/drum-machine.md). A mixer bus (`src/lib/audio/drumBus.ts`): each row's panner feeds the dry input and, by two sends per row, a delay bus (a DelayNode with feedback and a low-pass in the loop, timed in sixteenths so it follows the tempo) and a reverb bus (a ConvolverNode over an impulse synthesized at load, no file). Per project the delay's time, feedback and return and the reverb's size and return, the returns being the master effect levels; per row a delay send and a reverb send in the row's mix menu (now at every width). An Effects menu at the foot of the device holds the master controls, at every width; its button lights in the accent colour while either master level is above zero. Defaults (Kevin's call): both master levels at zero and every drum sending a little (`DEFAULT_DRUM_SENDS`: snares and claps wet, kicks dry, rims into the delay), so the first master level someone raises is heard at once; a dotted-eighth delay, a medium room. The House, Reggae one drop and 6/8 ballad presets set sends of their own. Share links move to version 5 (older links and stored projects get the defaults); the offline render shares the bus, so WAV downloads carry the effects; MIDI is unaffected.

## [0.48.0] - 2026-09-28

### Added

- **Beats for a song** (docs/drum-machine.md, Phase 3). A song page's Uploads menu has Drum Machine: `/drum-machine?song=<id>` seeds a fresh beat at the song's tempo and meter (`songForBeat` reads the changes at 0; the previous beat stays behind Undo), Save attaches it (`beat.song_id`; the ⋯ menu lists it with the song's name), and "Add to … as a demo" renders the open pattern to WAV and sends it through the demo upload path, so it lands in the song's demo recordings with an MP3 rendition like any demo.
- **A pattern picker in the Idea Recorder.** When the beat has more than one pattern, the drums' compact view (the toolbar, the phone's wrench menu) offers a Pattern picker beside the tempo; while playing, the change waits for the end of the cycle.

### Changed

- ContextMenu has a `heading` item kind (the presets menu's styles) and popovers are capped at 400 px, scrolling inside (Kevin).

## [0.47.0] - 2026-09-28

### Changed

- **Humanize starts at 14 %** for a new project and for presets that set none (`DEFAULT_HUMANIZE`), so a beat does not sound like a machine out of the box (Kevin's call).
- **Swing has a grid: 1/16 or 1/8.** A toggle beside the Swing slider (and in the phone's tempo menu). 1/16 moves every second sixteenth, as before and as an MPC does; 1/8 moves the off-beat eighths, so swing is audible on a beat with nothing on the sixteenths, which is most rock. Per project (`swingGrid`), in share links from version 4 (older links and stored projects are 1/16), in the MIDI file too; the Shuffle preset is on 1/8. Swing is one rule (`drumSwingDelay.ts`) shared by the engine, the WAV render and the MIDI file, with unit tests, and `bun run check:swing` renders patterns through the machine and measures the onsets on both grids to prove swing reaches the audio (docs/drum-machine.md).
- Drum machine layout: the transport under the grid controls on a phone, larger phone buttons, the device name at the foot (Kevin).

## [0.46.0] - 2026-09-28

### Changed

- **Drum machine layout and buttons** (Kevin): a labelled row for the kit, steps, meters and patterns; the tempo, swing and humanize sliders beside Tap Tempo; smaller device buttons (`device-button-xs` / `-sm` / `-drum-combo` and label shortcuts in `uno.config.ts`); a status pill in the readout; Play at the right of the foot; level and pan from lg up; a how-to section under the device. ComboBox takes `clearDefaultButtonClasses` so a device button style can be its whole look. Undo is always shown, dimmed when there is nothing to undo. On a phone: a second Play / Stop under the display, a menu beside Tap Tempo with the tempo, swing and humanize sliders, and a menu per row with its level and pan (below lg); the device is named SS Drumbo 001 beside Play.

## [0.45.0] - 2026-09-27

### Changed

- **The drum machine's foot is tidier.** Save, the saved beats, Copy link and the downloads live in one ⋯ menu beside Presets; a row's drum and the kit are chosen with the ComboBox rather than a native select and a row of buttons (Kevin's request). ComboBox options show a pointer cursor. The readout names the preset or saved beat the project still matches, says "edited" after a saved beat changes, and Custom otherwise (Kevin's idea). The device is named SS Drumbo 001 under its display, as the recorder and the tuner are.

## [0.44.0] - 2026-09-27

### Added

- **A drum machine tutorial.** "Tutorial: a rock beat from scratch" on /drum-machine swaps in an empty five-drum kit (the machine's Undo keeps the beat that was there) and opens a step panel that sticks to the bottom of the screen: thirteen steps from the kick on 1 and 3 to a second pattern with a fill, each highlighting the cells or control it points at, ticking when the grid has caught up, with Do it for me. Steps are data in `src/lib/constants/drumTutorial.ts` (tested end to end: no step is done before its change, every step after), state in `src/lib/state/drumTutorial.svelte.ts`, the panel `DrumTutorial.svelte`.

### Fixed

- **⌘-click on the Comments row starts a comment.** The row under the stems took only plain clicks (a seek); ⌘-click, Ctrl-click and right-click there now open the same menu as on a stem's waveform (Seek here, Comment here), headed "Mix" and the time. Reported by Kevin: users tried it first and it felt broken. `CommentTimeline` takes `oncontext`; the hint and the comments doc say the row counts.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.43.0] - 2026-09-27

### Added

- **A Room kit** for the drum machine: a second acoustic kit with longer, roomier hits, twelve more of Groovie's CC0 samples (`static/kits/room`, about 1.2 MB, fetched only when chosen). `SampledKit` takes its folder from the kit id, so a further sampled kit is a folder and a constant.
- **The samples are credited** in the Drum Machine user doc, on /built-with and, file by file, in docs/drum-machine.md.

- **Saved beats.** A signed-in member's drum machine has Save and a Beats menu: the project is kept in the account under a name (`beat` table, migration 0061, applied on production by Kevin; `beats.remote.ts` saveBeat / renameBeat / deleteBeat / listBeats; the page load lists the current account's beats), every member can load one, editors save, rename and delete. Deletes join `cascade.ts` (a song going leaves its beat; an account going takes them).

### Changed

- The drum machine's Presets, Beats and Download menus open upward, above their buttons at the foot of the device. ContextMenu popovers are `position: fixed` and carry `position-try-fallbacks: flip-block`, so a menu that has no room on its side of the button opens on the other side, and a long one scrolls within the room it has.
- The drum machine's icon is Kevin's drum-kit glyph (`IconDrumKit.svelte`) in the header's Tools menu, the recorder's toolbar and the compact toggle. The footer's second row is labelled More and reordered (Kevin).

## [0.42.0] - 2026-09-27

### Added

- **Drum machine presets.** A Presets menu of 22 beats by style (`src/lib/constants/drumPresets.ts`, rows written as strings of `.`, `o`, `x`, `X`; `drumPresetProject` builds the project and the test checks every one): rock, pop and funk, hip-hop and electronic, world, other meters, and two-pattern fills. A preset replaces the project (Undo beside the menu brings the beat back until the next edit) or, with shift, adds its patterns to the project.
- **3/4 and 6/8.** A meter per pattern (4/4, 3/4, 6/8) with 12 and 24 steps; 6/8 shades in sixes, a phone shows its bar as two lines of six, and the MIDI file carries the time signature. Share links move to version 3 (a meter and a wider steps field); versions 1 and 2 still open.

## [0.41.0] - 2026-09-26

### Added

- **Drum machine, Phase 2** (docs/drum-machine.md). **Patterns**: up to eight per project as tabs above the grid (new, copy, delete); while playing, the chosen pattern waits for the end of the cycle. **Velocity per cell**: hold, shift-click or right-click a sounding cell for accent or ghost. **Pan per row** (double-click for the centre) and **humanize** (a little scatter in time and level). **Download** the open pattern as a WAV (one seamless cycle rendered offline, `renderDrumPatternWav`) or a Standard MIDI File on General MIDI drum notes (`encodeDrumMidi`, tested against the app's own MIDI reader). **In the Idea Recorder**: a drums toggle beside the metronome (a Drums row in the phone's wrench menu, the stop button taking the wrench's place while it runs); the drums and the metronome never play together, starting one stops the other and takes its tempo. The share-link format is version 2 (a project of patterns, pan, humanize); version 1 links still open, and a version 1 project in localStorage is upgraded on read. The acoustic kit is fetched when the drum machine page opens, or on the first play elsewhere, so the recorder never downloads it unasked. A user doc at /docs/drum-machine and a Drums section in the Idea Recorder doc. `ContextMenu` takes a `label` for its trigger.

## [0.40.0] - 2026-09-26

### Added

- **A Tools menu in the header**, on every width and for everyone: the Idea Recorder (members), the tuner, the metronome and the drum machine. It replaces the header's Idea Recorder link; a phone shows the wrench alone. The tuning-fork glyph is `TuningForkIcon.svelte`, shared by the menu and the recorder.
- **A drum machine demo on the home page**, after the tuner demo (`DrumMachine` takes `keyboard={false}` there, so the space bar stays the stem player's).

### Changed

- The footer's links are two rows: the tools (the Idea Recorder for a member, the front-page demo for a visitor, tuner, metronome, drum machine), then everything else.

## [0.39.0] - 2026-09-26

### Added

- **A drum machine** at `/drum-machine` (footer link, indexable; docs/drum-machine.md, Phase 1). A step sequencer of up to 12 rows over 8, 16 or 32 sixteenths: tap or drag across cells, Play / Stop (space), 40 to 240 bpm with tap tempo, swing, level, mute and solo per row, an acoustic kit (Groovie's CC0 one-shots in `static/kits/acoustic`, credited on /built-with) and an electronic kit synthesized in the browser, a four-to-the-floor starting beat, the pattern remembered per browser, and Copy link, which puts the pattern in the URL (`encodeDrumPattern` / `decodeDrumPattern`, a versioned bit-packed base64url string; pinned links in the tests keep old links opening). On a phone a bar shows as two lines of eight. `DrumMachine.svelte` is a view of the engine in `src/lib/audio/drumMachine.svelte.ts`; `src/lib/audio/kits/` holds the kits behind one interface; `DrumPatternSchema` checks what localStorage and links carry.

### Changed

- The metronome and the drum machine share one lookahead scheduling loop (`src/lib/audio/lookahead.ts`).

## [0.38.0] - 2026-09-26

### Added

- **A metronome.** In the Idea Recorder's toolbar, a compact one: a toggle with the icon and, once on, the tempo to adjust; it keeps clicking through a take. The full metronome is at `/metronome` (footer link, indexable): 30 to 300 bpm with steps and a slider, tap tempo, two to six beats to the bar with an accented first beat, and a beat indicator. `Metronome.svelte` (clicks scheduled ahead on the Web Audio clock), `tapTempo.ts` with tests, `metronomePreferences.ts` (remembered per browser). On a phone the recorder's toolbar folds the tuner and the metronome into a wrench tools menu (the menu row shows the tempo whether or not the click is on), and while the metronome runs its stop button takes the menu's place, so one tap stops it; the running toggle is filled accent. The metronome engine is one per page (`src/lib/audio/metronome.svelte.ts`), so every view shows the same click. ContextMenu takes an `iconClass` for its trigger, an `icon` snippet per item for a custom SVG, and `buttonBaseClasses` to replace the trigger's chrome (`button button-sm` makes it one of a toolbar's buttons). `Metronome` compact takes `tempo` ("auto" | "always" | "never") and `toggle` ("icon" | "text": the menu row says On / Off).

## [0.37.0] - 2026-09-26

### Added

- **An inbox.** Every signed-in person has one (`/inbox`, in the account menu with an unread badge on the menu button): comments on songs, new stems, new songs and new demos in the projects they belong to, invitations they sent being accepted, and, for an account's owners and admins, storage at 80 %, 95 % and 100 % and every seat taken. Nothing a person did themselves; a burst of stems, demos or comments on one song folds into one item. Opening an item marks it read and goes where it points; Mark all as read.
- **Email, off by default.** `/settings/notifications`: comments, stems, songs and demos each reach email only when switched on, at once or gathered into a daily or weekly digest (`GET /api/notifications/digest`, a cron once a day); storage and seat warnings and an accepted invitation are always emailed at once. A text-message hook (`deliverSms`, `sms_number`) is in place with nothing behind it yet. `notification` and `notification_preference` tables (migration 0060), `src/lib/server/notifications.ts`, `notificationPolicy.ts` with tests; docs/notifications.md.

### Changed

- The site icon is the Stem Shovel icon (`static/icons/stem-shovel-icon.svg`).

### Technical

- Migration 0060 (`notification`, `notification_preference`); `bun run db:seed-docs` adds the `notifications` user doc. A second cron in vercel.json (`/api/notifications/digest`, daily 13:00 UTC).

## [0.36.2] - 2026-09-25

### Fixed

- **A new take lists the moment Stop is pressed.** The Recordings list shows the take under its idea straight away, marked Saving… with its progress and without a menu until the upload lands, instead of appearing only once saved; a take for a brand-new idea sits under a pending group with that title until the idea exists. The Uploads box now shows failed uploads only (Retry, Discard).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Changed

- The recorder's tuner button is a tuning fork; the loop indicator and volume readout sit in a row on larger screens.

## [0.36.1] - 2026-09-25

### Changed

- **The recorder's list is "Recordings"**, styled like the device: each idea row shows its take count and date and unfolds its takes, whose ⋯ menu is the shared ContextMenu (add as demo, create a song, delete). The idea's own menu left the list; Delete Idea lives in the recorder's ⋯ menu. The tuner, settings and search popovers carry headings, and the search sheet is 640 px wide on larger screens.
- **Fonts** load at weights 400, 600 and 700; ContextMenu takes a `title` and applies its `popoverClasses`.

## [0.36.0] - 2026-09-25

### Added

- **People on a project.** A project's settings gain a People section: invite a **viewer** from outside the account by email (they play the project's songs and stems, read its docs and comment, change nothing and take no seat; any member who may edit the project can invite), and **restrict** the project so only the people added to it and the account's owners and admins can open it (other members of the account no longer see it; add the members who belong from the same section). `project_member` table, `project.is_restricted`, `invitation.project_id` (migration 0059); the rules are `canViewProject`, `canViewSong`, `canEditProject` and `canCommentProject` in `viewAccess.ts`, fed by the account layout, and `memberOf` enforces them for every mutation.

### Changed

- **Viewer is no longer an account role.** Accounts have owners, admins and members; migration 0059 turned every account viewer into a viewer on each of the account's projects and revoked viewer invitations and invite codes. The seat count is the account's members, as the pricing page says.

### Fixed

- **A super admin could not accept an invitation.** The invitation page took their acting-owner access to every account for membership and said they already belonged, leaving the invitation pending; it now counts real memberships only.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Technical

- Migration 0059 (`project_member`, `project.is_restricted`, `invitation.project_id`, the viewer data moves). The `accounts-and-members` and `downloads-and-sharing` user docs changed (`bun run db:update-docs accounts-and-members downloads-and-sharing`).

## [0.35.1] - 2026-09-25

### Changed

- **The recorder's popovers share one look**: settings and the ideas search fill a phone's screen and sit under their buttons on larger screens, each closed by a corner ✕ (`button-popover-close`); the recorder carries an "SS Recorder 001" badge. The ideas search anchors to the header's Ideas button whichever way it was opened (the ⋯ menu's item is hidden once the menu closes and would give it no anchor), keeps its search box in place while the list scrolls, and stands 85 % of the viewport tall on larger screens.

## [0.35.0] - 2026-09-25

### Changed

- **The Idea Recorder fills a phone's screen**: the recorder and the note board share the viewport with no page scroll (the document is locked while the phone layout applies and released on leaving), the header keeps an Ideas button, and the tuner and search popovers take the whole screen there; on larger screens the tuner popover sits under its button.
- **The docs editor** opens in the markdown view with a plain toolbar (view toggle, Discard, Save), an "Exit edit mode" link and no hint; the notes board says it saves as you type. The note board's trash button moved beside its title.
- The front page's recorder demo points registered users to the real Idea Recorder; the header's Beta tag is a shade quieter; the header takes an optional `collapsed` prop.

### Fixed

- **Notes stopped saving after being emptied.** Emptying a note board on an idea without takes removes the idea; the page now learns that from the save and drops the idea's id, so the next notes create a fresh idea instead of failing against a deleted one. An emptied board autosaves like any other edit.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **"Your Ideas" shows the first line of the notes as soon as they save**, not after the next take or reload.
- CSS changes hot-reload in dev again: the web-fonts preset is always present and uses the no-fetch provider under Vitest and CI instead of being spliced out.

## [0.34.1] - 2026-09-25

### Fixed

- **Download Source of a Chrome lossless take gave an unplayable file.** Chrome records raw PCM in WebM, which almost nothing opens; the download now decodes it in the browser and saves a 16-bit WAV (the menu says "WAV lossless"). A saved take is FLAC once the jobs function has converted it, and downloads as such.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **On the VM's dev server the background jobs never ran** (the self-call used the proxy's origin), so Chrome takes there stayed raw PCM with no MP3; the dev server now calls itself on localhost.
- The recorder's volume buttons and readout are for larger screens only (phones keep volume on the hardware buttons).
- The recorder's status light pulses again while recording, waiting for the microphone or playing.
- Download names no longer carry runs of dashes (`idea-take-1.wav`, not `idea---take-1.wav`).

## [0.34.0] - 2026-09-24

### Changed

- **The Idea Recorder looks like a device.** A bezelled panel with a screen for the clock, status and meter; the take picker is a ComboBox; Record, back-to-start, play, volume up and down, loop and a ⋯ menu (browse ideas, add to a song, new song, downloads, delete take, delete idea, new idea) sit in a control row. The position slider is always in place; playback can loop.
- **ContextMenu** items take an icon, a kind (link, button, notice, divider, snippet), a condition and a disabled flag; **ComboBox** hides an option's description on the trigger unless asked.

### Fixed

- **Download MP3 downloaded the source file.** It downloads the MP3 (and is disabled until the rendition exists); the source keeps the container it was recorded in.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Deleting a take shows the previous take** once the list has refreshed, instead of an empty player; deleting the idea in the player gives the title a fresh "Untitled Idea N" that counts without the deleted one.
- The recorder's status reads Saving and Microphone… in those states again.

## [0.33.0] - 2026-09-23

### Added

- **Sign-up is open.** Anyone creates a free account from Sign up; the front page's call to action is "Sign Up For Free · No credit card required", the pricing page's Free card and the sign-up page say the same, and the waitlist page points to sign-up. `/admin/sign-up` switches back to invitation-only, which brings the waitlist language back everywhere (`signUpMode` app setting, read by the root layout).
- **A plan step at sign-up.** Step 1 chooses a plan (only Free today, with what it holds) and accepts the plan terms, a new user doc at `/docs/plan-terms`; step 2 is the details. An invitee skips the plan and ticks the terms in the form. The server refuses a sign-up without the terms and records `user.plan_terms_accepted_at` (migration 0058).

### Changed

- **Links**: a shared `link` shortcut (and `link-dim` restyled, no-wrap) for inline links; the sign-up page's notes sit in small info boxes.

### Technical

- Migration 0058 (`user.plan_terms_accepted_at`); `bun run db:seed-docs` adds the `plan-terms` page and `bun run db:update-docs getting-started` refreshes that one. Smoke row for `/admin/sign-up`.

## [0.32.2] - 2026-09-23

### Changed

- **Front page copy**: the demo headings name what each section is (Stem Player & Mix Comments, Audio Recorder, Song Notes, Charts and Comments) and the recorder blurb mentions lossless recording and MP3 export; the demo notes box is taller.
- **Tuner styling**: a bezel around the display, the strings, the picker, the menu and the On / Off button; blue-tinted text.

## [0.32.1] - 2026-09-23

### Fixed

- **The tuner's On button shows it is starting.** On a phone the microphone permission and the audio context can take a moment; the button now spins and reads "Starting…" until the tuner is live, and a suspended audio context (iOS) is resumed so it never reads as on but silent.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.32.0] - 2026-09-22

### Added

- **The tuner on the front page**, as a fourth demo beside the song notes (two columns from lg); it listens only once switched on there.

### Changed

- **Front page demos**: each has a "Try the working demo below" call-out (`marketing-demo-cta`), lighter demo containers, the player's link reads "Song Page", the recorder's note says demo recordings are discarded on reload, and the notes demo is a little shorter.

## [0.31.1] - 2026-09-22

### Fixed

- **The Releases page went blank after an edit in the app.** The editor saves each version heading with its brackets escaped (`## \[0.31.0\]`), which the page's parser did not recognise, so every in-app edit emptied the page until the next script refresh restored it. The parser accepts both spellings (`parseChangelog`).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.31.0] - 2026-09-22

### Changed

- **The tuner looks like a device.** A dark panel with a power light and an input level, the note and needle in their own window, the strings as lit labels, the tuning in a combobox, A4 behind a ⋯ menu and an On / Off button; on `/tuner` it starts listening when the pointer enters the page and stays off once turned off (`startOnHover`; an instance in a closed popover, the recorder's, waits to be opened). The tuner page's intro sits in an info tip on a phone.
- **ComboBox is a native popover** placed by CSS anchor positioning with a JS fallback (`utils/anchorFallback.ts`), keyboard complete with `aria-activedescendant`; new **ContextMenu** component (a ⋯ button opening a popover menu of actions, links or snippets). docs/demo-recording.md.

## [0.30.0] - 2026-09-21

### Added

- **Storage and seat limits are enforced.** A free account holds 10 GB of stems, demos and takes and up to five members, as the pricing page says; a founder account has no limits. An upload past the limit is refused at reservation with what is used and what the limit is; a sixth member is refused at invitation, acceptance, invite-code redemption and sign-up. Account settings show usage against both limits, and `/admin/accounts` can raise one account's storage (`account.storage_limit_bytes`; `PLAN_LIMITS`, `accountLimits`, `storageRoom`, `memberHeadroom`).

### Technical

- No migration. The `accounts-and-plans` user doc changed (`bun run db:update-docs accounts-and-plans`).

## [0.29.0] - 2026-09-21

### Added

- **Passkeys.** Security in the account menu adds a passkey (a name, then the device's prompt) and lists or removes them; the sign-in page has "Sign in with a passkey" and offers saved passkeys in the email field. A passkey signs in with no password and no two-factor code. Emails confirm an added or removed passkey. `@better-auth/passkey`, the `passkey` table (migration 0057), `rpID` per stage (docs/auth.md).
- **A built-with page** at `/built-with` (footer link, indexable, in the sitemap): the technologies the app runs on, grouped, each with a line on what it does here.

### Changed

- **Navigation**: the footer's Feature Requests link shows to everyone (the page is public); a visitor's header has Pricing beside Sign in and a Sign up button. On a phone the header keeps Sign in alone (Pricing and Sign up are in the footer and on the front page); the Built With link sits beside Privacy and Copyright.

### Fixed

- **Passkey sign-in was blocked by our own Permissions-Policy header** (`publickey-credentials-get=()`); it now allows the page itself, in the header constant and vercel.json.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Technical

- Migration 0057 (`passkey`); `@better-auth/passkey` (pulls `@simplewebauthn/server`, dual-format, checked in the build output). The `security` user doc changed (`bun run db:update-docs security`).

## [0.28.0] - 2026-09-21

### Added

- **A pricing page** at `/pricing` (footer link, indexable, in the sitemap): the Free plan, the Professional plan marked launching soon, what every plan includes, and the tax disclaimer.

- **A blog** at `/blog` (footer link, indexable, in the sitemap), written by system admins in the same editor as the docs: a post is a draft until its settings publish it (`user_doc.kind`, `published_at`, migration 0056; the docs list and pages now select `kind = doc`), the index shows the date, author and first paragraph, and drafts show only to admins.

### Changed

- **The feature-requests page is public, read-only.** Anyone can read approved requests and their votes; voting and requesting still need a sign-in, and the page stays out of search engines. A new request shows once a system admin approves it (`approved_at`, migrations 0054 and 0055, the second approving the requests that already existed; Approve / Hide from public on the admin list), and a profanity check at creation flags words on the admin list and in the notification email (`src/lib/utils/profanity.ts`).
- **The tuner has a chromatic mode** for any instrument or tuning: it names whatever it hears, with no string row.

### Fixed

- **The tuner page was marked noindex in production**: vercel.json's `X-Robots-Tag` rule for static files was never widened for `/tuner` (nor now `/pricing`); it is.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Technical

- Migrations 0054 (`bug_report.approved_at`, `flags`), 0055 (approves the feature requests that existed) and 0056 (`user_doc.kind`, `published_at`). The `reporting-a-bug` user doc changed (`bun run db:update-docs reporting-a-bug`). The smoke test's blog rows expect a 404 until a stage has a published post.

## [0.27.0] - 2026-09-21

### Added

- **A tuner.** The ear icon in the Idea Recorder's header opens a chromatic tuner: the nearest note, a needle in cents, the string of the chosen tuning (guitar standard, drop D, half step down, DADGAD, open G, bass, five-string bass, ukulele) and a settable A4, remembered per device. Pressing Record closes it. The same tuner is public at `/tuner` (`Tuner.svelte`, `src/lib/audio/pitch.ts`).

### Fixed

- **A deploy no longer leaves open tabs unstyled.** The client polls for a new build once a minute and, after one, the next navigation is a full page load, so it never fetches the previous build's retired stylesheet or chunks (which showed as an empty-looking dark page).
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Changed

- **The Stems / Demos tabs show at every width** on the song page, not only with demos or at xl.
- **The docs and the Releases page are indexable.** On production, `/docs`, each doc page and `/releases` no longer carry the noindex header and meta; `robots.txt` allows them, `sitemap.xml` lists them with each doc page's last change (a route now, not a static file), and doc pages carry a meta description from their first paragraph. Everything else stays out of search engines.

## [0.26.0] - 2026-09-20

### Changed

- **Front-page demos.** The stem player demo hides the decoded-in-memory line and the download row; the documents demo has the real editor, with saves kept on the page and gone on reload (`renderPreview`, a public rate-limited markdown query, renders what was typed); the Idea Recorder demo lays out as its own page does, recorder and notes side by side from xl.

### Fixed

- **Deletes remove their children.** Turso does not enforce foreign keys, so the schema's cascades never ran: deleting a song, project, idea, artist, account, user, report or doc left the rows under it behind (files were already removed). Every delete now goes through `src/lib/server/cascade.ts`, and `bun run db:sweep-orphans [--apply]` reports and removes what earlier deletes left.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Added

- **Artists and credits.** Each account has an artist directory (`artist`, migration 0048), and a song credits artists by role (`song_credit`): performers make the artist line under the song's title (the account's name when there are none), composers the "Written by" line (the free-text Songwriter field is gone; the column stays until a later release), producers "produced by". Song settings has the editor: type a name (the directory suggests earlier ones, matched case-insensitively) and press Enter; credits save as you go.
- **Project type and artists.** Project settings has a type (album, EP, single, soundtrack, compilation, demos, other; migration 0049); the project page shows it with the artists on its songs, derived from their performer credits ("Various artists" from four, the names on hover), or the account's name.
- **An artist directory** at `/[account]/artists` (members only): every artist with its song and people counts; an artist's page edits its name, sort name, website and notes, lists the people in it (`artist_member`, migration 0050: name, what they do, email), marks those already in the account, and lets an owner or admin invite one by their email as the settings page does. An artist is a **solo artist** (one person, with an email on the record and the same member badge and invitation) or a **band or group** (its people listed under it; migration 0051 adds `kind` and `email`). As an email is typed, for the artist or a person, the page says whether it already belongs to a member of the account. Deleting an artist removes its credits and people. Linked from account settings and from a song's credits.
- **Pictures for the account, an artist and a project.** Account settings, an artist's page and project settings each take an image (JPEG, PNG or WebP, shrunk in the browser to 1024 px before upload, so a phone photo is a few hundred KB); it shows on the projects page header and list, the artist's page and the directory (round for a solo artist), and beside the project's name. Migrations 0052 and 0053 add `image_url` to `account`, `artist` and `project`.
- **A default artist for new songs**, chosen in account settings from the artist directory (`account.default_artist_id`): every new song is credited to it as performer until changed. None by default, for producers working with many acts.

## [0.25.0] - 2026-09-20

### Changed

- **"Discard takes shorter than 3 seconds" is off by default.** It throws a take away, so it is opt-in like Trim silence; a browser that had turned it on keeps it on.

### Added

- **The project playlist shows position and length** and gains a position slider that follows playback and seeks, like the Demos view.
- **The Idea Recorder shows a take's length and position.** With a take loaded the clock reads position / length, and a position slider under the meter follows playback and seeks.
- **A Demos view on the song page.** The player's box shows either the stems or the demo recordings, switched by Stems / Demos tabs above it (and the Demos entry in the Downloads menu); a song with demos but no stems opens on the demos. The demos view (`DemoPanel.svelte`) has a transport with previous, play/pause, next, a position slider and volume over the list of demos, each with its own play button and a ⋯ menu (Download MP3, Download original), and a Record Demo button in the action row for editors (demos upload from the Uploads menu or song settings). It replaces the Demos popover and the Demos button in the action row. At xl the Stems / Demos tabs always show, and the documents' tool bar moves into a row above its panel so the two boxes line up, and the demos box is at least as tall as the stem player's box was, so the columns keep their shape across the toggle.

## [0.24.0] - 2026-09-19

### Added

- **Vote on feature requests.** Signed-in users give a request a thumbs up or down on /feature-requests (a second press takes it back); open requests list by score, the admin list shows it. `bug_report_vote`, migration 0047.

## [0.23.0] - 2026-09-19

### Added

- **Trim silence** in Recorder settings, off by default: once a take is saved, the jobs function cuts the silence before the first sound and after the last from the source and makes the MP3 from the cut source, so both keep the same length and timecode (0.3 s left before, 0.5 s after; lossless sources re-encoded to the sample, compressed ones stream-copied). `recording.trim_silence` (migration 0046) carries the request and is cleared when done; `duration_seconds` follows the cut.

## [0.22.0] - 2026-09-19

### Added

- **Feature requests: an address for follow-up.** The form has a box to tick to be emailed about the request (prefilled with the account's address, editable); the admin list shows it, responses go there, and Mark complete emails the requester that it shipped (migration 0045, `bug_report.contact_email`).

### Changed

- **Feature Requests in the footer** links to the page that lists every request; "Request a feature" is a button at the top of that page, and system admins see a Manage requests link there. The form is `ReportForm.svelte`, shared with the footer's Report a bug.
- **Admin feature requests**: Mark complete, Close/Reopen and Respond are small buttons.
- **BETA** beside the wordmark in the header, 13px on the baseline.
- **Front-page demo notice** reads "Note: this demo does not store recordings beyond your current session."

### Fixed

- **CI**: the `songWantsNotes` test loaded the database through `data.ts` and failed without varlock; the function is a util now. The secrets workflow needs `gitleaks/gitleaks-action@*` on the repository's allowed-actions list.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.21.0] - 2026-09-19

### Security

- **Viewers can no longer edit.** Every mutation, upload and editing page now requires an owner, admin or member; a viewer sees the account's private work, can comment, and gets a 404 from everything else, and the pages hide the controls from them.
- **Rate limits are shared across function instances**: counted in Upstash Redis (one database per stage, `KV_REST_API_URL` / `KV_REST_API_TOKEN`), so the limits on invitations, share mail, AI, support requests, the waitlist and custom mixes mean what they say, and Better Auth's sign-in and two-factor limits count there too. Without Redis each instance counts in memory as before.
- **A secrets scan in CI** (gitleaks, whole history, every push) and the operator's address removed from the docs.
- **The stem-player test page** (`/test`) is gone.

### Added

- **Feature requests have a page** (`/feature-requests`, signed-in users): every request with its status (open, complete, closed), its priority and the admin's response, requesters unnamed. In the admin, a feature request can be marked complete, given a high, medium or low priority, answered (the response is saved on the request and emailed to the requester) and deleted; bug reports get respond and delete too. Migration 0044 adds `priority`, `response` and `responded_at` to `bug_report`.
- **Help / support requests** at `/support` (Help in the footer, "Need help signing in?" on the sign-in page), open to visitors since the trouble may be sign-in itself. A visitor gives the email of their account and picks it out of a line-up of five partly hidden account names ("M*KK", "M***ny"), four made up and one theirs, before writing the message; an unregistered email gets five made-up names and the page cannot tell the cases apart, so nothing reveals which account an email belongs to. The answer travels in a sealed token (AES-GCM under a key from the auth secret, 15 minutes), attempts are rate limited by address and by email, and a honeypot field catches bots. A signed-in member skips the line-up. Requests are stored (`support_request`, migration 0043), system admins get an email and read, close and delete them on `/admin/support-requests`.

## [0.20.1] - 2026-09-19

### Changed

- **The Releases page's notes live in the database** as a user doc (slug `releases`), edited in the app by system admins like every doc page and seeded once from `scripts/user-docs/releases.md`; it stays at `/releases` (its `/docs` address redirects there and it is not listed among the docs). The repository keeps CHANGELOG.md as the technical record, and the short-lived RELEASES.md is gone.

## [0.20.0] - 2026-09-19

### Added

- **A Releases page** at `/releases`: the user-facing notes per version from `RELEASES.md` (features, changes and fixes a user would notice; this changelog keeps the full record), newest first, rendered at build time; the footer's version number and a Releases link lead to it. The release skill adds a step for it.
- **A Record Idea button** beside Add New Song at the bottom of a project page, opening the Idea Recorder.
- **The recorder's input line wraps** onto two snug lines (the microphone, then the format being recorded) instead of cutting the format off.
- **The Idea Recorder on the front page**: the real recorder in its phone layout with a note board, nothing uploaded; takes stay on the page as playable, downloadable blobs (nothing is discarded for being short: a first try is often a two-second test), and the copy sends a visitor to sign in or a member to their own recorder.

## [0.19.0] - 2026-09-19

### Changed

- **Search in the Idea Recorder is a filter over every idea**: the sheet lists all ideas from the start (full screen on a phone, a tall sheet on a desktop), each unfolding to its takes; typing narrows the list by title, notes, take label or number and opens the ideas whose takes matched, with those takes highlighted. A take loads and closes the sheet.
- **The recorder's ⋯ menu downloads either file**: "Download source (ALAC lossless)", named for the take's codec, hands over the take as recorded; "Download MP3" the 192 kbit/s rendition, greyed out until it is made.
- **An empty song's player box offers three buttons** on their own row: Upload stems, Upload a demo and Record a demo, instead of a sentence with a link.

### Fixed

- **Switching takes in the Idea Recorder puts the transport back to zero**: the clock reads 0:00 and playback starts from the top, instead of carrying the previous take's position over.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Listening back at full quality.** The player prefers a take's original whenever the browser can decode it, and the MP3 rendition otherwise: the device that recorded a take hears it lossless, a Mac plays an iPhone's ALAC, everything plays FLAC, and a browser that cannot play the original (Chrome facing ALAC) gets the MP3. The take's codec is stored at reservation for that check (migration 0042). A take just made plays the browser's own recording at once and the page picks up its rendition within a minute; a media error on the original falls back to the rendition. After capture the audio session returns to its default category, so playback routes as it did before.
- **"AudioSession category is not compatible with audio capture"** on an iPhone when the recorder was opened after playing a song in the same tab: the stem player had set the page's audio session to playback (for the silent switch) and WebKit refuses to capture under it. The recorder now sets "play-and-record" before asking for the microphone, and the player sets playback again on every play.

### Added

- **Lossless takes.** The Idea Recorder records Apple Lossless on an iPhone, iPad or Mac running Safari 18.4 or later and raw PCM on Chrome and Edge, which the jobs function keeps as FLAC; elsewhere Opus or AAC at 256 kbit/s instead of 128. Recorder settings gain **Quality** (lossless where the browser can, or compressed for a metered connection), **Stereo input** for interfaces, and a **Microphone** picker that lists inputs after one permission grant, all remembered on the device. While recording, the line under the meter says what is really being captured ("ALAC lossless · 48 kHz · mono"). A take is at most 120 MB now. Playback stays the MP3 rendition, so a lossless take plays on every device.

## [0.18.0] - 2026-09-19

### Added

- **A user drill-down in the admin** (`/admin/users/[id]`, each name in the Users list links to it): joined, last sign-in and last seen (from sessions), open sessions and the newest one's browser and address, sign-in methods and whether a password is set, two-factor state, memberships with roles and founder status, and what the user has made across every account (ideas and takes with their length and size, projects, songs, stems, document edits, AI requests, bug reports, invitations, share links, invite codes), plus their recent audit lines. The list itself now shows two-factor state and the last sign-in date.

## [0.17.4] - 2026-09-19

### Fixed

- **The stem player is heard on an iPhone with the ring/silent switch on.** iOS mutes Web Audio under the switch but not media playback; before it plays, the engine now asks for the media rules (the AudioSession API on Safari 17+, a silent looping audio element on older iOS), the same way music apps play through the switch. The recorder, demos and playlist already used media elements and were unaffected.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.17.3] - 2026-09-19

### Changed

- **Password managers are told to leave every free-text field alone**: the markdown editor's textarea (song documents and idea notes) and the recorder's search field now carry the 1Password, LastPass and Bitwarden ignore attributes like the other fields, and the take field's placeholder and accessible name say "label" rather than "name", the word third-party heuristics read as a username. (A report of the password-manager prompt on iOS; Safari's own AutoFill only classifies a field as a credential when a password field is involved, and the page has none.)

## [0.17.2] - 2026-09-19

### Added

- **User docs for the Idea Recorder** (`/docs/idea-recorder`, seeded by `db:seed-docs`): ideas and takes, notes, the list, into a song, settings and limits, phone tips; Getting started mentions it.

### Changed

- **The recorder's volume slider is hidden on iPhone and iPad**, where iOS keeps playback volume on the hardware buttons and the slider did nothing.
- **README and CLAUDE.md** describe the Idea Recorder's modules, the jobs function rule (never import ffmpeg or tfjs modules from page code; decide on the row you hold before scheduling), how to ship a file with a function, and how to measure a cold start.

## [0.17.1] - 2026-09-19

### Changed

- **A song page visit no longer posts a notes job unless there is something to do.** Notes are transcribed after a stem upload; a member's visit now checks the song row first (`songWantsNotes`: missing, behind the stems, or a run stuck for over ten minutes) and only then hands the resume or recovery to the jobs function. Finished songs never touch it.

## [0.17.0] - 2026-09-19

### Changed

- **Faster first loads.** Song and project pages sometimes took five seconds to open: not the database (a few milliseconds away) but a cold start of the Vercel function. Three changes bring it down (docs/environment.md "Cold starts and the jobs function"): the background work (playback renditions, mixes, notes transcription) moved to the app's own jobs function (`POST /api/jobs`, a separate Vercel function with the 300 s budget), so the page function no longer carries ffmpeg or the transcription stack (its bundle went from 131 MB to 33 MB); Sentry on the server is `@sentry/node` without its ESM loader hook or the Vite plugin the SvelteKit entry drags in, errors only; and a cron calls `/api/warm` every five minutes on production to keep the page function warm. Page loads also run their independent queries together.

### Fixed

- **Notes transcription on Vercel.** The chart draft's notes were never transcribed in production: the transcription stack (tfjs, Basic Pitch) was not packed into the function, so every song page's background job failed with "Cannot find package '@tensorflow/tfjs'". The jobs function carries it now.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

### Added

- **Ceilings on a take**, so a recorder left running does not fill the store with silence: a take stops and saves at 15 minutes (a notice at 10), and after 2 minutes of silence it stops, saved when it had sound and discarded when it never did. The server refuses a file over 32 MB at the reservation and in the upload token, and the browser asks for 128 kbit/s. The numbers live in `src/lib/constants/takeLimits.ts`.

## [0.16.0] - 2026-09-18

### Added

- **Idea Recorder** at `/[account]/ideas/recorder` (Projects and Idea Recorder sit in the header for members; the song header has a microphone button and the song page's Uploads menu and empty player link to it). An **idea** is a title, a markdown note board and numbered **takes**, and ideas are the user's own within the account. Record starts a take from the microphone (voice processing off so instruments sound like themselves, a clock, an input level meter, a screen wake lock) and Stop saves it at once as the next number: the take goes to a background upload queue, so Record is free again in about a tenth of a second, uploads run in recording order, an Uploads strip shows progress with Retry and Discard, and every pending take is written to IndexedDB first so a refresh, a crash or a phone switching apps resumes it. A saved take stays loaded (Play, a volume slider, a "Take N" label that becomes a dropdown to jump between the idea's takes) and can be named before, during or after recording. The ⋯ menu offers Add as demo…, Create new song…, Download, Delete take, New idea and Delete idea; the song actions open a popover with a "Merge the idea's notes into the song's notes" box (ticked by default) and copy the take in as a demo, so it stays with the idea.
- **Ideas list.** Under the recorder, newest first, each row an accordion opening to its takes with a menu per take (Add as demo…, Create new song…, Delete take) and a menu per idea (Delete idea); clicking a take loads it with its idea's title and notes. A Search popover finds ideas by title or notes and takes by name or number. Ideas with neither takes nor notes are never kept: they go with their last take, with their cleared notes or with a discarded upload, and hour-old empties are swept on load.
- **Notes for an idea**: the panel beside the recorder is the song documents' embedded markdown editor, always in edit mode with autosave, and a trash button clears it.
- **Recorder settings** (the gear in the header): "Discard takes shorter than 3 seconds automatically", on by default and remembered per browser.
- **Phone layout**: the notes follow the recorder so both are in view, the ideas list gives way to a combo box above the recorder, and the header copy is short with an info button for the rest.
- **Reusable components**: `ComboBox` (a keyboard-complete single select with ARIA combobox and listbox roles) and `InfoTip` (a small info button opening an anchored native popover).
- **Page titles** say `DEV | ` or `STAGE | ` off production and use a plain hyphen before "Stem Shovel".

### Fixed

- **Landing on "/undefined" after the two-factor code.** The verify page reloaded its data before navigating; the reload redirected (the user was now signed in) and swapped the page data out, so the target read as undefined. Both the verify page and the sign-in page now capture the target first and navigate with a single reload.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **Sign-in on preview deployments** (staging): Better Auth's base URL was pinned to the production origin for every non-dev build, and its handler ignores requests from another origin, so every `/api/auth/*` call on a `*.vercel.app` preview answered the app's 404 page. Previews now infer the URL from the request like dev does.

### Technical

- **Migrations 0039–0041**: `recording` (takes; files in the private Blob store when one is configured; account usage counts their bytes and deleting an account removes them), `recording.notes` (unused since 0041, to drop in a later release) and `idea` (`recording.idea_id`, `take_number`; one idea per earlier recording). Permissions-Policy allows `microphone=(self)` and `screen-wake-lock=(self)`.
- **One environment per stage** (docs/environments.md): dev, staging and production each have their own 1Password environment, Turso database (Turso's newer platform, `turso://` URLs accepted) and Blob store pair; dev and staging were restored from a snapshot of the MMKK and sirrobert accounts (`db:snapshot-accounts`, `db:restore-accounts`, `db:reset-stage --restore`, which refuses production); `db:copy-database` moved production to `stem-shovel-prod`. Better Auth pins production to the domain Vercel reports and trusts `staging.stemshovel.dev` on previews; Sentry's browser tag distinguishes previews.
- **Staging and previews are never indexed**: every non-production stage sends `X-Robots-Tag: noindex`, the robots meta everywhere, and a robots.txt that disallows all (the file is a route now); production keeps its front-page-only rule.

## [0.15.0] - 2026-09-17

### Added

- **The AI listens when the time signature is a close call.** After a detection (at upload or from Scan stems) whose 3/4-or-4/4 lean is under 0.15, the song page asks the AI to check on its own, waits for the mix to render when the stems have just been uploaded, and shows the answer with "Use these"; the card says the check was automatic.
- **Notes on an idea.** The recorder page is laid out like the song page, the recorder on the left and a Notes panel on the right that works exactly like the song page's document panel (read view, pencil to edit, check or Escape to finish, Rich Text or Markdown in the ⋯ menu, edit-mode badge), so chords or a working title can be jotted before the take; the notes are stored with the recording when it is saved and autosave from then on (the song documents' embedded markdown editor). Each library row has a collapsible Notes section with a one-line preview. Migration 0040 adds `recording.notes`.
- **Page titles** say `DEV | ` or `STAGE | ` off production, and use a plain hyphen before "Stem Shovel" (one helper, `pageTitle`, builds every title).
- **Top nav links for members**: Projects and Idea Recorder sit in the header from tablet width up (the account menu keeps them on a phone); the recorder page has an All recordings button.
- **Instant next takes.** Stop hands the take to a background upload queue and Record is available at once (about a tenth of a second instead of the whole upload); takes upload one at a time in recording order, an Uploads strip shows progress with Retry and Discard on failure, and every pending take is written to IndexedDB first, so a refresh, a crash or a phone switching apps resumes the upload rather than losing the take.
- **A take into a song from a menu.** "Add as demo…" and "Create new song…" sit in the recorder's ⋯ menu and in a ⋯ menu on every take in the list; each opens a popover with the form (the on-page form is gone) and a "Merge the idea's notes into the song's notes" box, ticked by default, which appends the notes to the song's notes document under a heading naming the idea and take.
- **Idea Recorder refinements** (2026-09-18, later): a take can be named before or during recording as well as after; "New idea" sits in the recorder's ⋯ menu and each idea in the list has its own menu with Delete idea; the idea rows are a plain accordion (a click only folds or unfolds; a take loads); the notes panel is always the markdown editor with autosave and a trash button to clear it (no read view, no ⋯ menu); a Recorder settings popover (gear in the header) holds "Discard takes shorter than 3 seconds automatically", on by default and remembered per browser; ideas with neither takes nor notes are removed (after their last take or notes go, after a discarded upload, and a sweep of hour-old empties on load). Two reusable components: `ComboBox` (the phone idea picker) and `InfoTip` (the info button beside the page title).
- **Ideas and takes.** An idea is a title, a note board and numbered takes. Record → Stop saves the take at once as the next number (no pause, no review step); it stays loaded for playback and Record starts the next. New idea starts "Untitled Idea N" with an empty board; the list shows ideas opening to their takes, with a Search popover (title, notes, take name or number). Ideas are the user's own within the account. The separate recordings page is retired. When an idea has more than one take, the loaded take's "Take N" label is a dropdown that jumps to any other take. On a phone the notes follow the recorder directly, so both are in view, and the ideas list gives way to a picker above the recorder (with Search and New beside it); the full list shows from the two-column width up. Migration 0041 adds `idea` and makes one idea per earlier recording.
- **Idea Recorder as a voice-memo list**: the recorder page lists every recording under the recorder (newest first, title, length, date, first line of notes); picking one loads it into the player, its title into the title field and its notes into the panel; the title field renames on blur or Enter; the selected recording can be deleted or added to a song right there. Notes carry over from take to take until "Clear notes" in the panel's menu; "New idea" empties the player.
- **Idea Recorder playback**: the browser's audio player is gone; a Play button sits between Record and Stop, the clock follows playback, a volume slider and a ⋯ menu sit at the end of the row, and the menu offers Download once the take is saved. A saved take stays playable until the next one starts.
- **Idea Recorder controls**: the title field is always visible, prefilled "Untitled - <date> - <time>"; Record/Pause/Resume, Stop, Undo (Retake once a take is ready) and Save form one row that never changes shape, each greyed out until it applies; Save works from Paused and stops the take first.
- **Idea Recorder link on the song page**: an icon button between share and info opens the recorder for that song (members). The header's share, info and settings buttons share one style, and their icons no longer vanish on hover.
- **Build version in the footer**: the app version and the short commit of the running build, linked to the changelog.

### Fixed

- **Time signature detection votes per stem.** The detector used to sum every stem's onset envelope and compare the three- and four-beat autocorrelation of the sum, so a flat kick diluted the bar pulse and one riff with a three-note feel could tip a 4/4 song to 3/4 (as it did for a user's project). Each stem now leans 3/4 or 4/4 on its own and the leans are combined, weighted by how sure each stem is; the confidence shown reflects the strength of the agreement.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **"Use these" after Ask AI to check** now saves the tempo, key and time signature at once with a notification; before, it only filled the rows in the settings popover and waited for a Save changes click further down, which read as nothing happening.

### Changed

- **Project playlist player**: the slider is a volume control (it was a position control that looked like one); seeking within a track will come later.
- **Song settings is a panelled popover**: full screen on a phone, a wide card on a desktop, with a sub-navigation (Details, Sections, Tempo & key, Demos, Options) showing one panel at a time instead of the whole scroll. Section and change rows take two lines on a phone; the toolbar buttons keep their labels on one line; the Demos panel lists demos (or "No demos yet") with Upload demo on its own row below; the date field's calendar icon is light; helper text is brighter and the positions note is an info box across the form.
- **Mobile layout**: the Chart / Lyrics / Notes / Comments control is a dropdown on a phone (song page and the front-page demo); the front-page demos run edge to edge; the footer's links are 16px and wrap, with a wide gap above them; the sign-in and sign-up button rows wrap instead of the button label; the bug report and feature request fields tell password managers to stay out and the popover fits the visible viewport.
- **Monospace is a choice per document.** The chart is no longer monospace by default; the panel's ⋯ menu has a Monospace toggle for the chart, lyrics or notes, remembered per browser.
- **The phone's document picker is the app's own menu** (it opens downward with room for the caret; iOS put its native picker mid-screen), on the song page and the front-page demo. The song header's share, info and settings icons are real buttons on a phone, and the settings sub-navigation is a dropdown there. The footer puts its links above the copyright on a phone, at 15px. The docs index has space between New page and the list and no longer shows each page's updated date.
- **Uploads and Downloads menus** on the song page: Add Stems, Replace Stems and Upload Demos sit under an Uploads button (members), and Download Stems, the two mixes and the demo recordings under a Downloads button; Reset Mix and Save as Default Mix stay in the row.

## [0.14.0] - 2026-09-17

### Added

- **Your mix and the default mix**: fader, mute, solo and master changes are kept per browser (Reset Mix puts the default back); members save the current faders as the song's default mix for every listener, which the Original Mix MP3 and the project playlist follow.
- **Add Demos** beside Add Stems on a song that has no stems yet, since an idea usually starts with a demo recording.
- **Replace Stems** on the song page: pick the whole new set; matching names replace in place (name, order and MIDI kept), new names are added, and stems without a new file are removed, after one confirmation listing all three; nothing is removed unless every upload succeeds.

- **Founder status per user** on /admin/users: a super admin makes a user a founder, which flags every account they own (or revokes it); the users list shows who is a founder.

### Technical

- **`bun run smoke:urls`**: a repeatable smoke test of every route, signed out and as the Screenshot Bot, on the dev server or production; a route without a row in the script fails the run.

### Changed

- **Panel minimum heights**: the player and the documents panel keep at least 560px, so an empty song does not collapse.
- **Home page title** typo fixed.

## [0.13.0] - 2026-09-17

### Changed

- **The site moved to www.stemshovel.com.** Better Auth's base URL, the canonical and Open Graph tags, the sitemap, robots and the two-factor email link use the new domain; `stem-shovel.com`, `www.stem-shovel.com`, the apex `stemshovel.com` and `stem-shovel.vercel.app` redirect to it permanently with the path and query intact, so old bookmarks, invitations, invite codes, waitlist and reset links keep working. Everyone signs in once more on the new domain. Mail now comes from `no-reply@mail.stemshovel.com`.

### Technical

- **House rules as Fallow policy** (`fallow-rules.json`): no `$env/*`, no form actions, no zod/moment/lodash/dotenv/axios, warnings for `$effect` and raw global listeners, plus import boundaries between routes, lib, val, utils and constants; `fallow audit` runs in CI and reports to code scanning. `fallow guard <file>` shows what applies before editing.
- **Spell check** (cspell) over the prose in CI, with a project word list.
- **Validation failures are logged**: a remote-function payload that fails its schema logs the route, issue count and client address.

## [0.12.0] - 2026-09-17

### Added

- **Live demos on the front page**: a public song's player (transport, waveforms, mute/solo/faders, stem, mix and zip downloads, demo recordings) replaces the screenshot, and its chart, lyrics, notes and comments are a second demo further down. The player carries the comment timeline with example comments (never the account's real ones), and visitors can leave their own from a waveform's right-click menu; those live on the page only. System admins pick the song on /admin/home from every public song with stems; it falls back to Eat All the Clocks. The song page and the demo share one loader (`songView`) and the download helpers.
- **Beta waitlist**: a sign-up form on the front page and at /waitlist (email, optional name, and a separate, off-by-default consent to project-update email), a confirmation email that must be opened before the address counts, and a manage link in every email to change the consent or leave. System admins see the list at /admin/waitlist, resend confirmations, and invite confirmed addresses with a single-use 30-day code sent by email. The privacy policy says what is kept.
- **Two-factor authentication**: Security in the account menu turns on TOTP (QR code or key for any authenticator app, ten single-use backup codes), makes new backup codes, or turns it off, each with the password; sign-in then asks for the code (or a backup code) with a 30-day "trust this device" option, and an email confirms every change. Better Auth's twoFactor plugin, as in replicator.
- **Finished songs**: any member marks a song finished in its settings (a "finished" chip shows in the song header), and the project page files it under a new **Finished Songs** section above Songs in Progress and Song Ideas; the project playlist plays finished songs first.
- **Request a feature** in the footer, beside Report a bug: the same short form (title, description, page and browser attached), stored with `kind = feature`, emailed to system admins, and listed on /admin under Feature requests.
- **Sentry error reporting** in the browser and on the server (no user identity or request bodies; masked session replay on errors; source maps uploaded from Vercel builds with a token kept in 1Password); the privacy policy says so.
- **Vercel Web Analytics and Speed Insights**: cookieless page-view counts and Core Web Vitals per route, with query strings and one-time link tokens stripped before anything is sent; the privacy policy says so.
- **Open source under Apache-2.0**: LICENSE, a license note in the README, SECURITY.md with a private disclosure route, CODEOWNERS, a CI workflow (lint, check, test on pushes and pull requests) and Dependabot.

### Changed

- **The front page is open to search engines**: robots.txt allows `/` alone (with a one-entry sitemap), the noindex header and meta now apply to every other path, and the home page carries a title, description, canonical and Open Graph tags. New home page copy and screenshot (the free storage figure is 10 GB), a copyright line in the footer, and a README that describes the app as it is.
- **/admin is a section with a side navigation** (the docs layout): one page each for accounts, users, invite codes, waitlist, home page, bug reports, feature requests, AI requests and the audit log, each loading only its own data; /admin opens Accounts.
- **Charts are monospace** in every view (panel, home demo, full-page editor, rendered and markdown), so chord grids line up.

### Technical

- CI runs without secrets: the varlock Vite plugin is imported only when it is going to be used (`SKIP_VARLOCK`), and the tests mock the environment.
- Dependabot watches GitHub Actions only for now (its bun support reads lockfile version 1; Bun 1.4 writes 2), and a workflow approves and auto-merges its minor and patch bumps once CI and CodeQL pass.
- Migrations 0032–0037: account plans, song finished flag, report kind, two-factor, app settings, waitlist.

## [0.11.0] - 2026-09-16

### Added

- **Account plans**: every account is a free account for life (`plan`, `lifetime_free`), and the first twenty accounts ever created are **founders** (`is_founder`: never charged, unlimited data, every feature); super admins grant or revoke founder status from /admin. A plan badge shows in account settings, on Your accounts and in the admin list, and a user-docs page explains free-for-life, founder accounts and the paid tiers to come.
- **docs/billing.md**: the per-account cost estimate from measured stem sizes and current Vercel Blob, Turso and Vercel rates, and the plan for Stripe subscriptions.

### Changed

- **The document panel's ⋯ menu is always present** (a placeholder line when it has nothing to offer) so the toolbar keeps its width across panels, and sits closer to the edit button.

## [0.10.0] - 2026-09-16

### Changed

- **Editing in the song page panel** autosaves (1.5 s after the last change, ⌘S at once) with no header at all: no title, Save button, version, Done button or shading. The text keeps the reading view's margin, with the editor's block buttons tucked into the panel's padding on hover. The check button spins while a save is in flight, and an "Edit mode" badge sits at the box's bottom corner. The check button, Escape and switching documents save what is unsaved first. `MarkdownDocEditor` takes `mode`: `"standalone"` (the full-page editors, unchanged apart from the toggle reading "Rich Text" / "Markdown") or `"embedded"`.
- **A ⋯ menu beside the edit button** on the document panel switches the editor between Rich Text and Markdown while editing and, on the Chart panel, holds "Draft chart with AI" (with progress and Cancel while a run is listening or drafting) in place of the old top-left button. Song settings keep their buttons.
- **The document box is bounded** (70vh) and scrolls inside, like the comments panel, in both modes.
- **The AI draft previews** its suggested chart with the Chart panel's styling (rendered markdown), with the raw markdown folded beneath; the card has a Discard control, and a cancelled run's result is dropped when it arrives.
- **Deleting a project needs it archived first**: project settings offer Archive on an active project, and Restore or Delete (owners and admins) on an archived one; the server refuses to delete an active project.
- **The player's status bar** uses 16px text on small screens and 13px from the lg breakpoint.

### Fixed

- **The AI draft card crashed the song page** when the draft named two sections alike (two verses): the lists were keyed by section name.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
- **A failed chord detection or AI draft** now shows a notification with the reason; a remote function's `error()` was displayed as its JSON body (`errorMessage` util), and AI failures arrive as a 502 with their message instead of production's "Internal Error".

### Technical

- Dropped the unused `@tensorflow/tfjs-backend-wasm` dependency (transcription runs on the CPU backend in the server child process and WebGL in the browser).

## [0.9.0] - 2026-09-16

### Added

- **Detect chords** in song settings: the tonal stems are transcribed to
  notes in the browser (Spotify's Basic Pitch) and read as one chord per
  bar on the song's grid, shown as chart lines.
- **Archive, restore and delete projects** from project settings: any
  member archives a project (it moves to a collapsed "Archived" section on
  the projects page, everything in it kept) and restores it; owners and
  admins delete one with every song and file behind it, after a
  confirmation. An archived project's page carries a badge.
- **"Do not use AI"** on a project or a song, set by any member in its
  settings: no model is called for it and nothing is transcribed; the AI
  buttons disappear, the commands refuse, and the song shows a "no AI"
  chip. For artists whose contracts rule AI out.
- **Notes are transcribed on the server after upload** (in a child
  process, in resumable one-minute segments) and stored on the song, so a
  chart draft uses them at once instead of transcribing in the browser;
  the browser path remains as a fallback while the server copy is still
  being made.
- **Leaner chart drafts**: the model returns the chords as one compact
  line and a capped chart, cutting its reply to a fraction of the tokens.
- **Charts, lyrics and notes are edited in place**: the pencil on the
  documents panel opens the same editor inside the panel (rendered and
  markdown views, undo, ⌘S, versioned saves); the tick closes it, saving
  re-renders the document where it was, and switching documents or
  closing with unsaved edits asks first. The full-page editor route still
  works for deep links.
- **Draft chart with AI** sits at the top left of the Chart panel's
  toolbar and runs the chord detection itself when needed; the draft
  appears in the panel above the chart. It also stays in song settings.
- **Draft chart with AI**: the transcribed notes of every bar go to a
  frontier text model (Claude Fable 5.1 through the AI Gateway), which
  names the chords, the sections and each section's progression and
  drafts the chart in the account's own style, using the account's
  existing charts as examples;
  the sections and the chart can each be saved, with a confirmation when
  they would replace something.
- **Key detection ignores drums**: each stem's chroma is weighted by how
  tonal it is.
- **Scan stems** in the song's tempo, key and time signature settings: the
  upload-time detector run again on the stems the player has loaded. Empty
  settings are filled and the values shown; filled ones get an offer to
  replace, with the current values beside the suggestion.
- **Super admin**: a separate flag (`bun run db:super-admin <email>`) that
  makes its holder an acting owner of every account they are not a member
  of. The header shows "acting as owner", the account's settings carry a
  notice, and every request made that way is written to an audit log shown
  on `/admin`. Migration 0030.
- **AI request log on `/admin`**: every model call is recorded (the text
  sent, the reply, the parsed answer or the error, duration, tokens) and
  the latest fifty show with the prompt and reply expandable. New
  `ai_request` table (migration 0029).

### Changed

- **Detection accuracy on real songs**: the beat period is refined over up
  to 32 beats at twice the onset resolution, so declared DAW tempos come
  back exactly (145, 132, 120, 115, 112); the key uses chroma from
  spectral peaks, normalised per frame, so drums no longer smear it (four
  of five MMKK keys right, up from three); and the bass settles a key
  against its fifth when the profiles cannot.
- **Tempo detection prefers the 80–170 bpm band** when the half- or
  double-time pulse correlates as well as the beat; on the real mixes in
  MMKK every declared tempo now comes back within two bpm, where two of
  five had come back at half time.
- **The AI check can answer "no fixed tempo"** and report discrete tempo
  shifts (with the time and the new tempo), or "no meter"; "Use these"
  turns shifts into tempo rows at their times and leaves out what has no
  value.

### Fixed

- Spacing of the AI check's note after its confidence.
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).

## [0.8.0] - 2026-09-16

### Added

- **Tempo, key and time signature are detected from the stems as they
  upload** (in the browser, from the audio it already decodes: onset
  autocorrelation for tempo, beat groupings for 4/4 against 3/4, chroma
  against key profiles for the key). A song with none set yet gets them as
  its first tempo, key and meter changes, with a notice; a song that has
  them only hears what was detected.
- **New account** from the account menu or the Your accounts page: anyone
  who already belongs to an account can start another and owns it, no
  code needed.
- **Ask AI to check** in the song's tempo/key/meter settings: the rendered
  mix goes to a listening model through Vercel's AI Gateway and its answer
  can be dropped into the changes for saving. Needs `AI_GATEWAY_API_KEY`;
  hidden until it is set.

## [0.7.1] - 2026-09-16

### Security

- **Upload completion is pinned to the reserved file**: the URL a browser
  reports for a stem, MIDI file or demo must be that reservation's file in
  one of our Blob stores, and the server never fetches a URL outside them
  (closes a server-side request forgery through a reported URL).
- **Sign-in redirects stay on this site**: `?next=` refuses absolute and
  protocol-relative targets.
- **Rate limits** on custom mixes, bug reports, invitations, invite codes,
  viewing links and share emails.
- **Session cache shortened to a minute**, so suspensions, deletions and
  admin changes apply promptly; `Cross-Origin-Opener-Policy: same-origin`
  added to every response.
- A security model document, docs/security.md.

## [0.7.0] - 2026-09-16

### Added

- **Invitation-only sign-up**: creating an account needs an invitation link
  or an invite code; the sign-up page says so, locks the address to the
  invitation when it arrives from one, and reports a bad, used-up, expired
  or withdrawn code. Signing up through either joins the inviting account
  straight away. Owners and admins generate **invite codes** in account
  settings (role, note, use limit, expiry), copy the code or its sign-up
  link, and revoke them. New `invite_code` table (migration 0023).

### Fixed

- **Popover forms no longer show the previous entry**: a remote form keeps
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  what was last typed or submitted for the life of the page, so "Add a
  song" opened on the last title and settings popovers on the last edit.
  Popovers now open on saved values (or empty), the invite and invite-code
  forms clear after sending, and the new-project field starts empty.

### Added

- **Private storage for private songs**: the files of a private song
  (stems, renditions, MIDI, demos, mixes) now live in a private Vercel Blob
  store whose URLs are refused without a signature; pages hand the browser
  presigned URLs good for twelve hours, and uploads to a private song go
  straight there. Making a song or project private moves its files across
  in the background, and making it public moves them back. New variables
  `BLOB_PRIVATE_READ_WRITE_TOKEN`, `BLOB_PRIVATE_STORE_ID`,
  `BLOB_PRIVATE_WEBHOOK_PUBLIC_KEY`.
- **Belonging to several accounts**: the account menu shows your role in
  each account and links to a new "Your accounts" page (roles, project
  counts, leave). Neutral pages and the old `/projects` and `/settings`
  shortcuts go to the account you last opened, else one you own. In
  account settings owners change roles (handing over ownership) and
  remove members; admins manage members and viewers; anyone can leave
  except the last owner. Joining through an invitation or an account's
  invite code no longer also creates a personal workspace.
- **Private projects and songs with viewing links**: everything stays
  public by default; any member makes a project or a song private from
  its settings (a private project covers its songs). Private means
  members only, or a viewing link: any member makes one from the song's
  share popover or the project's settings (note, expiry, use limit, copy,
  revoke), and the link is the page address plus `?share=code`, remembered
  for the visit so playback and mix downloads keep working. Private things
  are left out of lists for those who cannot open them; a refusal shows a
  Private page with a sign-in button. Sharing a private song by email sends
  a viewing link made for the recipient. Migrations 0027 and 0028.
- **Starting user docs**: eight pages (getting started, stems and playback,
  song settings, charts/lyrics/notes, comments, downloads and sharing,
  accounts and members, reporting a bug) live in `scripts/user-docs` and
  `bun run db:seed-docs` adds any that are missing, never overwriting edits.
- **Acceptable-use rules** on the copyright page: hate speech, sexual
  content involving minors, pornography, graphic violence, illegal activity
  and harassment are banned, with removal and suspension as consequences.
- **Privacy policy and copyright policy** as docs pages, linked from the
  footer and from the sign-up form, which now states that creating an
  account means agreeing to them. Both are deliberately short.
- The `/admin` user list shows each user's role in each account ("owner of
  MMKK"); a new user is the owner of the workspace made for them.
- **Account management on `/admin`**: suspend an account (its pages close
  for everyone and its members lose editing until reactivated), reactivate
  it, or delete it with every project, song and file.
- **User management on `/admin`**: suspend (signs the user out and blocks
  sign-in), reactivate, and delete a user; deleting removes their sign-in,
  memberships and comments, and an account only they belonged to when it
  holds nothing.
- **The comment row is always there for members** on a song with stems,
  with a hint to ⌘-click, Ctrl-click or right-click a waveform to comment
  when there are none yet; visitors see it only when comments exist.
- **User docs** at `/docs`, linked from the footer: an index and one page
  per topic with a sidebar, readable by anyone. System admins add pages,
  edit them with the same editor as song charts, lyrics and notes (WYSIWYG
  and markdown views, undo, ⌘S, versioned saves), and rename, reorder or
  delete them from a settings popover. New `user_doc` and
  `user_doc_version` tables (migration 0026).
- **Report a bug**: signed-in users get a footer link that opens a form
  (title, what happened); the page they were on and their browser are
  attached. Reports land on `/admin`, where system admins close and reopen
  them, and every system admin gets an email with the report. New
  `bug_report` table (migration 0025).
- **System admin and new-account invite codes**: `bun run db:system-admin
  <email>` makes a user the operator; `/admin` (a 404 for anyone else)
  lists every account with members, songs and storage, every user, and
  issues invite codes that open sign-up without joining an account, so a
  newcomer gets a workspace of their own. Migration 0024 (`user.is_system_admin`,
  `invite_code.account_id` nullable).

### Changed

- **Account menu in the header**: the row of links (Projects, Settings,
  Admin, account name, user name, Sign out) is now one button showing the
  account, opening a menu with your name and address, Projects, Account
  settings, other accounts to switch to, Admin for system admins, and
  Sign out. Visitors still see the account name and Sign in.
- **Mix downloads carry the song version**: the original and custom mix
  MP3s (and the stems zip) are named `project-song-v1.2.3-mix.mp3` and so
  on.
- **Security headers and a Content Security Policy** on every response,
  after lj-website: no third-party scripts (SvelteKit nonces its own
  inline script), fonts from bunny.net only, audio and uploads limited to
  Vercel Blob, no framing, no sniffing, HSTS, device APIs switched off.
- The demo upload button on the song page uses the same size classes as
  the other section buttons.

- **Project page splits songs into "Songs in Progress" and "Song Ideas"**:
  a song is in progress once it has a finished stem; until then it is an
  idea, listed below with what it holds so far (lyrics, chart, notes,
  demos) and left out of the project playlist.

## [0.6.0] - 2026-09-14

### Added

- **Comments on songs**: a Comments tab in the documents panel lists them
  (author, date, an "edited" badge, a position that seeks); the + button
  opens a popover to post one with a title, text and an optional position
  in any format. Ctrl / ⌘-click or right-click a waveform or MIDI roll for
  "Seek here" / "Comment here" at that spot. Located comments sit as icons
  on a timeline under the stems, each opening a card anchored to it.
  Authors edit and delete their own; owners and admins delete any.
  The timeline row draws the mix's waveform (stems summed once decoded,
  their stored peaks combined before that) behind the icons, and the open
  comment is marked with a line on it. The row seeks like a stem row.

### Technical

- New `comment` table (migration 0022). `engine.mixPeaks` holds the
  summed waveform (`computeMixPeaks`; `combinePeaks` from stored per-stem
  peaks before decoding).

### Changed

- **Notifications instead of inline "Saved." lines**: confirmations (song,
  project and account settings, sections and changes, version bumps,
  invitations, shares) appear as notices fixed to the bottom-right corner
  that fade out after a few seconds or can be dismissed, so page content no
  longer shifts.

## [0.5.0] - 2026-09-14

### Added

- **Email through Resend**: sign-up now sends a verification link and
  sign-in needs a verified address (existing users were marked verified);
  "Forgot password?" emails a one-hour reset link; owners and admins invite
  people into an account from settings, with a role, and can revoke pending
  invitations; the song header gains a share-by-email button that sends the
  song's link with a note. New `invitation` table (migration 0021), new
  `RESEND_API_KEY` / `RESEND_MAIL_DOMAIN` variables.
- **MIDI file per stem**: upload one from the stem's row menu ("Upload
  MIDI", later "Replace MIDI" / "Remove MIDI"); a "MIDI" chip beside the
  stem name marks it and "Download MIDI" joins the menu. Clicking the chip
  swaps the row's waveform for a piano roll of the file's notes, and back.
  Migration 0020.

### Changed

- **Song info popover** (an info button in the song header) holds the
  description, writer and date, tempo · key · meter, version, stem count
  and last change, and the project; the header itself is one line again
  (Kevin's layout pass), and the transport shows the key, tempo and meter
  in force at the playhead beside the readout.
- The row menu's "Download" is now "Download Stem", and a truncated stem
  name shows in full on hover.

## [0.4.0] - 2026-09-13

### Added

- **Song version and "stems updated"**: each song carries a semantic
  version you manage (0.0.1 to start, editable in settings, shown under the
  title and on the project's song rows). It never bumps itself; after a
  stem is added, replaced or removed the page offers the next patch, minor
  or major version in one click. The header also shows when stems last
  changed. Migration 0019.

### Changed

- **Readout formats are timecode and bars** — digital time is gone from the
  display. A song with a tempo and a time signature shows bars by default;
  clicking the readout switches and the choice is remembered. Bars read as
  `45 | 1`, and positions typed with spaces around the bars parse too.
- **Stem rows and transport restyled** (Kevin): name, mute, solo and menu
  stacked in one column with wider waveforms; the section timeline follows
  the same columns and shows the current section as a chip; the transport
  readout sits in its own block with a format badge.
- **Project settings are a popover** opened from a gear in the project
  header, matching the song page, instead of a form that unfolded in place.

### Fixed

- **Typing a position in bars on a song without a tempo and time
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  signature** now says so and points at the settings section to fill in,
  instead of the generic "not a position" message.

## [0.3.0] - 2026-09-13

### Added

- **Song notes**: a third markdown document beside Chart and Lyrics, with
  the same editor, versioning and toggle (`…/[song]/notes`; migration 0012).
- **Song sections**: mark the structure (Intro, Verse…) with a start time
  each; a timeline row over the stems shows the blocks, highlights the one
  the playhead is in and seeks on click. "Add section at playhead" on the
  transport, or edit names and times (in the transport's `m:ss.s` format)
  in song settings. Hidden when a song has no sections. Migration 0013.
- **Tempo, key and time signature** as timed changes: each has a start
  time, so a song can change tempo or meter partway. Edited in song
  settings as rows of time, kind and value; the header shows the song's
  opening tempo, key and meter, and the timeline draws a lane for each kind
  that actually changes, highlighting and naming what is in force at the
  playhead. A song with fixed values and no sections shows no timeline. Migrations 0015
  (the `changes` column) and 0016 (drops `bpm` / `musical_key`).
- **Timecode and bars everywhere**: the transport readout cycles time,
  Logic-style timecode (`mm:ss:ff.sub` at the song's frame rate, a new
  setting) and bars; section and change times display in the same format
  and accept any of the three when typed. Times are now stored to a tenth
  of a millisecond instead of a tenth of a second. Section tooltips show
  the length in bars when the song has a tempo and a meter. Migration 0018.
- **"Add section at playhead" is hidden** for now; the player still
  supports it through its `onaddsection` prop.
- **Settings rows keep exact times**: a section or change saved without
  editing its time keeps its stored seconds, whatever the display format
  rounds to; editors show full precision (milliseconds, beat fractions).
- **Section index**: each section has a short index (roman numerals by
  default, filled in by position) shown on the timeline blocks, where names
  would not fit; the name shows on hover.
- **Bars on the transport**: with a tempo and a time signature set, click
  the time readout to count in bars and beats instead (remembered per
  browser). Song settings gain "Start of bar 1" and "End" times, each
  settable from the playhead, so tracks with leading silence or a count-in
  count from the right place; both show as dashed lines on the timeline.
  Migration 0017.
- **Tall popovers scroll** within the viewport instead of overflowing it.

### Technical

- **Test suite**: Vitest through Vite+ (`bun run test`) with a Node `unit`
  project and a jsdom `components` project using @testing-library/svelte —
  73 tests over the utils, bar math, dual-mono and peaks, the valibot
  schemas, the mix request parser and the screenshot bypass (database and
  Blob mocked), and the Transport, SectionTimeline and ProjectPlayer
  components. `/test` skill; `bun run test` opens the release gates.
- Helpers moved to `src/lib/utils/` (one function per file) and constants
  to `src/lib/constants/`, replacing `format.ts`, `slug.ts` and `keys.ts`;
  song change kinds live in `constants/songChanges.ts` so the schema and
  its validator no longer import each other.

### Fixed

- **Stem row menus close** on Escape, on a click outside them, and when
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  another row's menu opens.

## [0.2.1] - 2026-09-13

### Fixed

- **"Custom Mix (MP3)" said nothing was audible** even with stems soloed or
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  unmuted: the download row is rendered outside the player since the layout
  pass and no longer had the engine. The player now hands its engine to the
  page.

## [0.2.0] - 2026-09-13

### Added

- **Demo recordings per song**: upload phone memos or rough takes from song
  settings (up to 12; WAV, AIFF, FLAC, MP3, M4A/AAC, OGG/Opus, CAF, WebM,
  AMR, 3GP), remove them there, and listen to or download them from a
  "Demos" popover in the song's download row. Every demo is converted to
  MP3 on the server for listening and download, so a lossless Voice Memo
  plays everywhere; the original is kept. New `demo` table (migrations
  0010, 0011).
- **Songwriter and date first written** on a song, edited in song settings
  and shown under the title ("Written by …, first written June 2019").
- **Sign-in with Better Auth** (email + password; `/sign-in`, `/sign-up`,
  `/sign-out`). A new user gets their own account; existing users get a
  credential with `bun run db:set-password`. Anonymous visitors still see
  and play everything by URL; the controls and the members-only pages need a
  signed-in member. Tables `session`, `auth_account`, `verification`
  (migration 0006). No email verification or password reset yet (no email
  provider).
- **Playback renditions**: after an upload the server renders an AAC M4A
  of the stem with ffmpeg (about a tenth of the WAV) and the player streams
  that; the source file stays for downloads. Missing renditions are rendered
  on first view of the song. Migration 0007 adds the `playback_*` columns.
- **Download MP3** next to "Download Stems": a stereo MP3 mixdown rendered
  on the server with ffmpeg. "Original" is the full mix (cached per set of
  stem files); "Custom" is what is audible in the player — mute, solo and
  faders. Migration 0008 adds the song's mix cache columns.
- **Screenshot auth bypass** (replicator's `PREVIEW_AUTH_TOKEN`): with the
  token in `.env.local`, `bun run shot` renders pages as the Screenshot Bot
  user, enrolled per account with `bun run db:preview-bot <slug>`. Fail-closed
  when unset (`src/lib/server/previewAuth.ts`, docs/agent-screenshots.md).
- **No indexing**: robots.txt disallows everything, every page carries a
  `noindex, nofollow` meta tag and every response an `X-Robots-Tag` header.

### Fixed

- **Uploads of `.m4a` files from a Mac or iPhone** were refused: the browser
- **Looper: the level meters now run from the moment the audio opens**, so a chosen input shows its level before Record is pressed (they ran only while the loop played or counted in).
  labels them `audio/x-m4a` and the upload token only allowed `audio/mp4`.
  The content type now comes from the extension for stems and demos alike.
- **Switching tracks while playing** (project playlist, demo player) left the
  new track paused.
- **Hovering "Sign out" signed you out.** The nav link pointed at a page
  whose load ended the session, and links preload on hover. Signing out is
  now a POST (remote form); the `/sign-out` page is gone.

### Changed

- **Accounts are in the URL**: `/[account]/projects/…` and
  `/[account]/settings`; old `/projects…` and `/settings` addresses redirect
  to the user's first account. Viewing and playing are public by URL;
  uploading, renaming, deleting, settings and the editors need membership,
  which every mutation checks on the server (`src/lib/server/access.ts`)
  and pages use only to show or hide controls.
- **Stems load three at a time** instead of one after another (fetch and
  decode overlap); a six-stem song was ready in half the time on a fast
  connection, and with the renditions a 50 Mbps connection went from 68 s
  to 9 s until Play enables.
- **Adding a song is a popover** opened from an "Add Song" button beside the
  Songs heading on the project page (and from the empty state), replacing
  the form at the bottom of the page.
- **Project playlist**: the project page has a player that plays the
  songs' original mixes in order (previous / play / next, position slider,
  Space and Home), and a play button on each song row. Mixes are now
  rendered ahead of time whenever a song's stems change, and page loads
  catch up any that are missing. Migration 0009 adds the render lock.
- **Go to beginning** button on the transport, left of Play (Home does the
  same from the keyboard).
- **Two MP3 buttons** — "Original Mix (MP3)" and "Custom Mix (MP3)" — in
  place of one button with a toggle.
- **Song settings are a popover** opened from the gear in the song header
  (native `popover="auto"`: top layer, Esc and click-outside close it). The
  delete-song action lives at the bottom of that panel.
- **Layout and style pass** (brand font Bahiana, tiles and panels, two-column
  song page); validation and error text uses `text-red-400`, and the removed
  `solo`, `playhead` and `oxfordDark` palette tokens are no longer referenced
  by components.
- **Uploads report channels after the dual-mono collapse**, so a dual-mono
  file gets a mono rendition.

### Technical

- Migrations 0006–0011: Better Auth tables, `playback_*` on stems and
  demos, the song's mix cache and render lock, `songwriter` / `written_on`,
  the `demo` table.
- `ffmpeg-static` (in `trustedDependencies`; Vercel's tracer packages the
  binary), `server/background.ts` around Vercel's request-context
  `waitUntil`, `maxDuration: 300` on the routes that render after responding.
- Route `config` exports and `$val` schemas are ignored by Fallow's
  dead-code check; the transcode ↔ mix import cycle is gone.

## [0.1.0] - 2026-09-12

First versioned release: the proof-of-concept player became a working
multi-tenant app over 2026-09-11 and 12.

### Added

- **Projects → songs → stems in Turso** (Drizzle, per-table schema files,
  nanoid ids, ms timestamps), seeded with one account and owner until
  sign-in exists; `hooks.server.ts` puts them on `event.locals`.
- **Browser → Vercel Blob uploads** in three steps (reserve row, upload to an
  ID-based pathname, report decoded duration/channels/peaks), with an
  "Add New Stems" button, per-stem Download / Rename / Upload new version /
  Remove in each player row's menu, "Download All" as a client-built zip, a
  32-stem cap per song, and format validation by extension (WAV, FLAC, MP3,
  M4A, AAC).
- **Chart and lyrics** per song: markdown documents edited with
  `@kevinpeckham/woof-editor` (Rendered / Markdown toggle, undo/redo,
  Cmd/Ctrl+S, unsaved-changes guard), hash-gated version history (ten kept)
  and an accidental-wipe guard; the song page renders either behind a
  Chart / Lyrics toggle through an ESM allowlist sanitizer over parse5.
- **Settings** for projects (name, URL), songs (title, URL, description) and
  the account (name, slug, usage, members), all as SvelteKit remote `form`
  functions validated by valibot schemas in `src/lib/val/`.
- **Configuration with varlock + 1Password**: `.env.schema` declares every
  variable; secrets load from a 1Password environment at build time and are
  injected into the SSR bundle encrypted (`_VARLOCK_ENV_KEY`). Vercel holds
  only `OP_TOKEN`, `OP_ENV_ID` and the key.
- **Player**: renders immediately from stored peaks and durations and
  enables play/seek when every stem is decoded; dual-mono files collapse to
  one channel; Space is the transport from anywhere except text entry.
- **Tooling**: Fallow (dead code, health) with its MCP server, Playwright +
  Chromium with `bun run shot` for agent screenshots, `bun run smoke:blob`
  driving the real upload flow, Bun pinned via `packageManager` and installed
  on Vercel with `npx bun@<version>`.

### Changed

- **Redesigned to match lightningjar.com**: the UnoCSS config mirrors
  lj-website's (wind4 + reset, Atkinson Hyperlegible / Bungee Shade, palette,
  shortcuts, Phosphor icons); every style is a utility or shortcut, with no
  stylesheets of our own.
- Form actions were replaced by remote functions throughout; redirect
  targets are derived from the database, not the request URL.
- The test kick stem's synthesis integrates its pitch sweep into phase
  (it chirped).

### Technical

- Server dependencies must be ESM: Vercel's Node 24 launcher refused
  CommonJS `require()` of ES modules at cold start (jsdom via DOMPurify,
  then htmlparser2 via sanitize-html), which took every route down until the
  sanitizer was replaced. See `docs/environment.md`.
- Migrations 0000–0005 (initial tables, chart columns, description,
  lyrics + `song_doc_version`).
