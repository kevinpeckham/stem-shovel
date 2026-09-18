# Stem Shovel

A web-based collaboration tool for musicians, bands and producers, run as a
service at [www.stemshovel.com](https://www.stemshovel.com) by Lightning
Jar. Each account holds projects; each project holds songs; each song holds
its stems, a chart, lyrics, notes, comments pinned to moments in the music,
and demo recordings of the original idea. The song page plays every stem in
sync in the browser (fader, mute and solo per stem, waveform seek, a section
timeline, timecode or bars), downloads stems, mixes and a zip, and edits the
documents in place; the project page lists finished songs, songs in progress
and song ideas with a playlist of every mix. Tempo, key and time signature
are detected at upload, and, unless an account or song opts out, Basic
Pitch transcribes the stems so a model can draft the chart. Viewing is public
by URL unless a project or song is made private; editing needs a signed-in
member. Sign-up is invitation-only during the beta, with a waitlist.

Stack: SvelteKit 2 + Svelte 5 (runes, remote functions), TypeScript, UnoCSS
(wind4, lightningjar.com's config), Vite+ (Vite, Oxlint, Oxfmt in one `vp`
CLI), `@sveltejs/adapter-vercel`, Vercel Blob for audio (a public and a
private store), Turso + Drizzle for data, Better Auth (email + password,
optional TOTP two-factor), Resend for mail, Vercel AI Gateway for the AI
features, varlock + 1Password for configuration, valibot for validation,
Sentry, Vercel Web Analytics and Speed Insights.

## Run it

```sh
bun install          # Bun is pinned via package.json `packageManager`
vercel link          # once; also pulls OP_TOKEN + OP_ENV_ID into .env.local
bun run stems        # generates 4 synthetic WAV stems + manifest into static/stems/
bun run dev          # open http://localhost:5173/
bun run test         # Vitest, unit + component projects
```

URLs carry the account: `/[account]/projects` lists and creates projects;
`/[account]/projects/[project]` lists songs (finished, in progress, ideas),
plays the project playlist and holds the project's settings (name, URL,
privacy, no-AI, archive and delete); `/[account]/projects/[project]/[song]`
is the song page (player, stem rows with a per-stem menu, download row,
panelled settings popover (details, sections, tempo/key/meter, demo
recordings, options: privacy, finished and no-AI flags, delete), the chart / lyrics / notes / comments
panel with in-place editing and the AI chart draft); `…/[song]/chart`,
`/lyrics` and `/notes` are the full-page editors; `/[account]/recorder` is
the demo recorder and `/[account]/recordings` the library of scratch
recordings it makes (added to a song, one becomes a demo);
`/[account]/settings` is the account (members, invitations, invite codes,
usage, plan). Neutral
pages: `/` (the front page with live demos of a public song), `/waitlist`,
`/docs` (user documentation, editable by system admins), `/accounts`,
`/settings/security` (two-factor), `/admin` (operators). Old `/projects…`
and `/settings` addresses redirect to the user's current account.

**Viewing is public, editing needs a signed-in member.** Anyone with a URL
can open an account's projects and play its songs; the controls (upload,
rename, delete, settings, the editors) appear only for members, and every
mutation checks membership on the server regardless. Sign-in is Better Auth
with email + password and a verified address (`/sign-in`, `/sign-up`,
`/forgot-password`), optional two-factor (`/settings/security`), and
invitation-only sign-up: an invitation link or an invite code from an
account, or a new-account code from an operator; the waitlist hands those
out during the beta. Mail goes through Resend. See [docs/auth.md](docs/auth.md).

## Configuration

Secrets come from a 1Password environment through varlock; Vercel holds only
`OP_TOKEN`, `OP_ENV_ID`, `_VARLOCK_ENV_KEY` and the build-time
`SENTRY_AUTH_TOKEN`. Details, plus the Turso + Drizzle commands, Sentry,
analytics and the ESM-only rule for server dependencies, are in
[docs/environment.md](docs/environment.md). CI (GitHub Actions) runs lint,
check and the tests without any secret.

## Where things live

- `src/lib/audio/engine.svelte.ts` — `StemEngine`: one `AudioContext`, one
  `GainNode` per stem, all sources scheduled against the same clock timestamp.
  Public fields are `$state`, so components read `engine.position` directly.
- `src/lib/audio/peaks.ts` — reduces an `AudioBuffer` to 1024 peak values.
  Later this JSON is what gets stored in Turso alongside the Blob URL.
- `src/lib/components/` — `StemPlayer` (engine lifecycle + transport + rows),
  `Transport`, `StemRow`, `Waveform` (canvas + DOM playhead).
- `src/lib/server/data.ts` — every query, always scoped by `accountId`
  first. Projects, songs, and the three-step stem upload.
- `src/lib/server/blob.ts` — Blob auth + pathname layout
  (`accounts/<id>/songs/<id>/<stemId>.<ext>`, IDs so renames never move files).
- `src/routes/api/stems/` (reserve a row), `src/routes/api/upload/`
  (`handleUpload()` token exchange, only for reserved pathnames),
  `src/routes/api/stems/[id]/ready/` (browser reports duration, channels,
  peaks after decoding). `StemUploader.svelte` drives the three steps;
  `src/lib/upload.ts` is the shared browser half, also used by "Upload new
  version" (`/api/stems/[id]/replace` reserves a new `-vN` pathname for the
  same row — Blob serves files with a 30-day cache header, so a replacement
  needs a new URL — and deletes the old blob). Per-stem Download and the
  "Download Stems" button fetch the Blob files in the browser
  (`client-zip`, stored not compressed) so nothing goes through the server.
  Demo recordings (`src/routes/api/demos/`) and per-stem MIDI files
  (`src/routes/api/stems/[id]/midi/`) share the route and the three steps,
  minus the decode; `MidiBadge` / `MidiRoll` show a MIDI file as a piano
  roll in the row (`src/lib/audio/midi.ts` parses it in the browser).
- `src/lib/server/transcode.ts` — after an upload, ffmpeg (`ffmpeg-static`,
  traced into the Vercel function) renders an AAC playback rendition of each
  stem and an MP3 of each demo, in the background of the request
  (`server/background.ts` wraps Vercel's `waitUntil`); page loads schedule
  any that are missing. `src/lib/server/mix.ts` renders MP3 mixdowns from
  the renditions: the original mix is cached in Blob and kept current as
  stems change, custom mixes (`?stems=id:gain,…&master=m`) render on demand.
- `src/lib/remote/comments.remote.ts`, `CommentTimeline.svelte` — comments
  on a song (docs/audio-engine.md), with a `comment` table.
- `src/routes/+page.server.ts`, `SongPlayerDemo.svelte`, `SongDocsDemo.svelte`,
  `src/lib/server/songView.ts` — the front page demos a public song (chosen
  on /admin/home, stored in `app_setting`): the player with its downloads,
  and the documents panel, read-only; the song page loads through the same
  `songView`.
- `src/lib/remote/waitlist.remote.ts`, `WaitlistForm.svelte`, `src/routes/waitlist/` —
  the beta waitlist with email confirmation and a separate consent to
  project updates (docs/auth.md); invites go out from /admin/waitlist.
- `src/routes/admin/`, `src/lib/remote/admin.remote.ts` — the operator's area
  (a side-nav layout with a page per concern: accounts, users, invite codes,
  bug reports, feature requests, AI requests, audit log), for users flagged
  by `bun run db:system-admin`.
- `scripts/user-docs/*.md`, `scripts/seed-user-docs.ts` — the starting user
  docs; `bun run db:seed-docs` adds the missing ones.
- `src/routes/docs/`, `src/lib/remote/userDocs.remote.ts` — user documentation:
  public pages, edited by system admins with `MarkdownDocEditor.svelte`, the
  editor the song-document pages use too.
- `src/lib/remote/bugs.remote.ts`, `GlobalFooter.svelte` — "Report a bug" and
  "Request a feature" in the footer for signed-in users; a `bug_report` row
  (`kind`) and an email to every system admin; two lists on /admin.
- `docs/security.md` — the security model, what is enforced where, known gaps.
- `src/hooks.client.ts`, `src/instrumentation.server.ts`, `src/routes/+layout.ts` —
  Sentry in the browser and on the server, Web Analytics and Speed Insights
  (docs/environment.md); `src/routes/settings/security/` — two-factor.
- `src/lib/val/AccountPlanSchema.ts`, `PlanBadge.svelte`, `docs/billing.md` —
  plans: free for life, founder accounts, the cost model and the Stripe plan.
- `src/lib/audio/analysis.ts` — tempo, key and meter detection at upload;
  `transcribe.ts` + `chords.ts` — chords per bar via Basic Pitch;
  `src/lib/server/aiDetect.ts` — the AI Gateway second opinion (docs/audio-engine.md).
- `src/lib/server/viewAccess.ts`, `src/lib/remote/share.remote.ts` — privacy:
  private projects and songs, viewing links (docs/auth.md).
- `src/lib/server/signUpGate.ts` — sign-up is invitation-only: the rule
  Better Auth's user-create hook applies (docs/auth.md); invite codes live in
  `invite_code` and are managed from account settings.
- `src/lib/server/email.ts` — Resend: verification and reset mail for Better
  Auth, invitations (`/invite/[token]`) and share-by-email, from templates
  in `lib/utils/renderEmail.ts`.
- `src/lib/server/access.ts` and `src/lib/server/previewAuth.ts` — tenant
  checks (every query scoped by account; viewing public, editing for
  members) and the screenshot bot's token bypass (docs/auth.md,
  docs/agent-screenshots.md).
- `src/routes/[account]/…` — project list, project page (song list, "Add
  Song" popover, playlist player), song page (transport, stem rows with a
  per-stem menu, Uploads/Downloads menus, panelled settings popover,
  chart / lyrics / notes / comments), account settings; `src/routes/sign-in|sign-up`.
- **Chart, lyrics and notes**: three markdown documents per song
  (`song.chart_markdown`, `lyrics_markdown`, `notes_markdown`), edited at
  `…/[song]/chart`, `/lyrics` and `/notes` — one route, `[doc=songDoc]` — with
  `@kevinpeckham/woof-editor` (the same WYSIWYG-markdown editor replicator's
  blog uses) and a Rendered / Markdown toggle; the source pane is a textarea
  bound to the same editor state, so undo, discard and save cover both. Saved
  through the `saveDoc` remote form: `data.saveSongDoc` hash-gates a
  `song_doc_version` row (kind = chart | lyrics | notes) and keeps the last 10;
  blanking a document with content needs a second save. The song page shows
  one document at a time behind a Chart / Lyrics / Notes toggle; `server/markdown.ts` renders
  with barkdown's renderer (what the editor seeds from) and
  `server/sanitize.ts`, an allowlist pass over parse5 (ESM; see "Server
  dependencies are ESM only" below). Typography for both is the
  `chart-body` shortcut (and `chart-editor` for the editor chrome) in
  `uno.config.ts` — every style in the app is a UnoCSS class or shortcut;
  there are no stylesheets of our own.
- `src/lib/val/` — valibot schemas, one file per concept as in replicator:
  the value array, the schema and the inferred type (`ARCHIVE_STATUSES`,
  `ArchiveStatusSchema`, `ArchiveStatus`). Table files import only the types;
  remote functions validate with the schemas at the form boundary
  (`ProjectSettingsSchema`).
- `src/lib/remote/*.remote.ts` — every server mutation is a SvelteKit remote
  `form` function (no form actions remain): create/update projects, create/
  update/delete songs, delete stems and demos, save chart/lyrics, account
  settings, sign out. Each validates with a
  `$val` schema, reports domain errors onto fields with `invalid()`, and
  derives redirect targets from the database rather than the request URL
  (inside a remote function `url` is the calling page only when a browser
  supplies it). Enabled by `experimental.remoteFunctions` +
  `compilerOptions.experimental.async` in `vite.config.ts`. The smoke script
  submits them the way the browser does, to `/_app/remote/<id>`; the id is
  read from the dev server's transform of the module.
- `src/lib/utils/` — one function per file, as in replicator's `$utils`
  (`slugify`, `formatTime`, `parseTimecode`, `toRoman`, `isTextEntry`,
  `timelineKinds`, …); `src/lib/constants/` holds the shared constants
  (stem and demo formats and limits, frame rates, position modes, song
  change kinds). Imported as `$lib/utils/<name>` and `$lib/constants/<name>`.
- `src/lib/components/ProjectPlayer.svelte` — the project page's playlist
  (a plain `<audio>` streaming each song's cached mix); `src/lib/keys.ts`
  is the shared "is this text entry" rule behind the Space shortcut.
- `scripts/make-test-stems.mjs` — synthetic test audio, no ffmpeg needed.

## Documentation

- [docs/data-model.md](docs/data-model.md) — accounts → projects → songs → stems and demos, chart/lyrics/notes versions.
- [docs/security.md](docs/security.md) — the security model, what is enforced where, error reports and analytics, known gaps.
- [docs/billing.md](docs/billing.md) — what an account costs us (Blob, Turso, Vercel), the free/founder tiers, and the plan for Stripe subscriptions.
- [docs/demo-recording.md](docs/demo-recording.md) — the in-app demo recorder: what shipped, the plan it came from, and the phone realities.
- [docs/environment.md](docs/environment.md) — varlock + 1Password, Vercel, Sentry, the ESM-only rule, Turso + Drizzle.
- [docs/auth.md](docs/auth.md) — Better Auth: sign-in, two-factor, invitations and the waitlist, memberships, what is public, what needs a member.
- [docs/styling.md](docs/styling.md) — the lj-website UnoCSS setup and the "utilities only" rule.
- [docs/audio-engine.md](docs/audio-engine.md) — the engine, progressive loading, memory limits, keyboard.
- [docs/uploads-and-blob.md](docs/uploads-and-blob.md) — the three-step upload, replacements, renditions, mixdowns, demos, downloads.
- [docs/testing.md](docs/testing.md) — Vitest: unit and component projects, helpers, what is mocked.
- [docs/agent-screenshots.md](docs/agent-screenshots.md) — `bun run shot` and the Playwright MCP.
- [CHANGELOG.md](CHANGELOG.md) — releases; cut one with the `/release` skill.
- [CLAUDE.md](CLAUDE.md) — conventions and the working agreement for the agent.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Use the code in your own
projects, modify it, redistribute it; the license grants a patent licence
too and asks only for attribution. Stem Shovel the service is run by
Lightning Jar. Security reports: [SECURITY.md](SECURITY.md).
