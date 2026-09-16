# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Releases are cut with the `/release` skill (see `.claude/skills/release/SKILL.md`).

## [Unreleased]

### Fixed

- Spacing of the AI check's note after its confidence.

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
  another row's menu opens.

## [0.2.1] - 2026-09-13

### Fixed

- **"Custom Mix (MP3)" said nothing was audible** even with stems soloed or
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
