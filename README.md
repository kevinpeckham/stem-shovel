# Stem Shovel

A multi-stem player for bands and producers: synced playback of a song's
stems in the browser with per-stem fader, mute and solo, waveform seek and a
memory readout; a section timeline over the stems; chart, lyrics and notes
documents per song; demo recordings of the
original idea; MP3 mixdowns (the full mix, or what is audible right now) and
a project-level playlist of every song's mix. Stems upload straight from the
browser to Vercel Blob, are catalogued in Turso (accounts → projects → songs
→ stems), get an AAC playback rendition from ffmpeg on the server, and play
back from there. Viewing and playing are public by URL; editing needs a
signed-in member of the account (Better Auth).

Stack: SvelteKit 2 + Svelte 5 (runes, remote functions), TypeScript, UnoCSS
(wind4, lightningjar.com's config), Vite+ (Vite, Oxlint, Oxfmt in one `vp`
CLI), `@sveltejs/adapter-vercel`, Vercel Blob for audio, Turso + Drizzle for
data, varlock + 1Password for configuration, valibot for validation.

## Run it

```sh
bun install          # Bun is pinned via package.json `packageManager`
vercel link          # once; also pulls OP_TOKEN + OP_ENV_ID into .env.local
bun run stems        # generates 4 synthetic WAV stems + manifest into static/stems/
bun run dev          # open http://localhost:5173/
bun run test         # Vitest, unit + component projects
```

URLs carry the account: `/[account]/projects` lists and creates projects;
`/[account]/projects/[project]` lists and creates songs and edits the
project's name and URL; `/[account]/projects/[project]/[song]` plays a song
(each row's ⋯ menu downloads, renames, replaces or removes the stem), adds
stems, downloads them all, shows the chart or lyrics and edits the song's
title, URL and description; `…/[song]/chart` and `…/lyrics` edit those
documents; `/[account]/settings` is the account. `/test` plays the static
files. Old `/projects…` and `/settings` addresses redirect to the user's
first account.

**Viewing is public, editing needs a signed-in member.** Anyone with a URL
can open an account's projects and play its songs; the controls (upload,
rename, delete, settings, the editors) appear only for members, and every
mutation checks membership on the server regardless. Sign-in is Better Auth
with email + password and a verified address (`/sign-in`, `/sign-up`,
`/forgot-password`); a new user gets their own account, and owners invite
others by email from account settings. Mail goes through Resend. See
[docs/auth.md](docs/auth.md).

## Configuration

Secrets come from a 1Password environment through varlock; Vercel holds only
`OP_TOKEN`, `OP_ENV_ID` and `_VARLOCK_ENV_KEY`. Details, plus the Turso +
Drizzle commands and the ESM-only rule for server dependencies, are in
[docs/environment.md](docs/environment.md).

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
- `src/lib/server/email.ts` — Resend: verification and reset mail for Better
  Auth, invitations (`/invite/[token]`) and share-by-email, from templates
  in `lib/utils/renderEmail.ts`.
- `src/lib/server/access.ts` and `src/lib/server/previewAuth.ts` — tenant
  checks (every query scoped by account; viewing public, editing for
  members) and the screenshot bot's token bypass (docs/auth.md,
  docs/agent-screenshots.md).
- `src/routes/[account]/…` — project list, project page (song list, "Add
  Song" popover, playlist player), song page (transport, stem rows with a
  per-stem menu, download row, settings popover with demo recordings,
  chart / lyrics), account settings; `src/routes/sign-in|sign-up`.
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
- `src/routes/test/` — loads `static/stems/manifest.json` and drives the engine.
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
- [docs/environment.md](docs/environment.md) — varlock + 1Password, Vercel, the ESM-only rule, Turso + Drizzle.
- [docs/auth.md](docs/auth.md) — Better Auth: sign-in, memberships, what is public, what needs a member.
- [docs/styling.md](docs/styling.md) — the lj-website UnoCSS setup and the "utilities only" rule.
- [docs/audio-engine.md](docs/audio-engine.md) — the engine, progressive loading, memory limits, keyboard.
- [docs/uploads-and-blob.md](docs/uploads-and-blob.md) — the three-step upload, replacements, renditions, mixdowns, demos, downloads.
- [docs/testing.md](docs/testing.md) — Vitest: unit and component projects, helpers, what is mocked.
- [docs/agent-screenshots.md](docs/agent-screenshots.md) — `bun run shot` and the Playwright MCP.
- [CHANGELOG.md](CHANGELOG.md) — releases; cut one with the `/release` skill.
- [CLAUDE.md](CLAUDE.md) — conventions and the working agreement for the agent.

## Next (from the plan)

2. ~~Peaks are already computed — persist them.~~ Done; the player draws
   them before decoding finishes.
3. ~~Client-side uploads to Vercel Blob via `@vercel/blob/client`.~~ Done.
4. ~~Load the manifest from Turso.~~ Done.
5. Share links (`share_link` table exists; no UI or `/s/[token]` route yet).
6. ~~Auth (Better Auth).~~ Done, with email verification, password reset,
   invitations and share-by-email over Resend (v0.5.0).
7. ~~Accounts in the URL.~~ Done.
8. ~~Playback renditions, MP3 mixdowns, project playlist, demo
   recordings.~~ Done (v0.2.0).
9. ~~Song version, sections, timed changes, timecode and bars, MIDI per
   stem.~~ Done (v0.3.0–v0.5.0).
10. Stem ordering, saved mixes, document version restore UI, share links,
    removing members, 2FA.
