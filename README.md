# Stem Shovel

Proof-of-concept multi-stem player: synced playback of N audio files in the
browser with per-stem fader, mute and solo, waveform seek, and a memory
readout. Stems are uploaded straight from the browser to Vercel Blob,
catalogued in Turso (accounts → projects → songs → stems), and played back
from there; the original static-file test page still works.

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
with email + password (`/sign-in`, `/sign-up`); a new user gets their own
account. See [docs/auth.md](docs/auth.md).

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
  "Download all (.zip)" button fetch the Blob files in the browser
  (`client-zip`, stored not compressed) so nothing goes through the server.
  **No auth yet**; fine behind Tailscale, not for a public deploy.
- `src/routes/projects/` — project list, song list, song page (player +
  files + uploader), all with form actions.
- **Chart and lyrics**: two markdown documents per song
  (`song.chart_markdown`, `song.lyrics_markdown`), edited at
  `…/[song]/chart` and `…/[song]/lyrics` — one route, `[doc=songDoc]` — with
  `@kevinpeckham/woof-editor` (the same WYSIWYG-markdown editor replicator's
  blog uses) and a Rendered / Markdown toggle; the source pane is a textarea
  bound to the same editor state, so undo, discard and save cover both. Saved
  through the `saveDoc` remote form: `data.saveSongDoc` hash-gates a
  `song_doc_version` row (kind = chart | lyrics) and keeps the last 10;
  blanking a document with content needs a second save. The song page shows
  either document behind a Chart / Lyrics toggle; `server/markdown.ts` renders
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
  update/delete songs, delete stems, save chart/lyrics. Each validates with a
  `$val` schema, reports domain errors onto fields with `invalid()`, and
  derives redirect targets from the database rather than the request URL
  (inside a remote function `url` is the calling page only when a browser
  supplies it). Enabled by `experimental.remoteFunctions` +
  `compilerOptions.experimental.async` in `vite.config.ts`. The smoke script
  submits them the way the browser does, to `/_app/remote/<id>`; the id is
  read from the dev server's transform of the module.
- `src/routes/test/` — loads `static/stems/manifest.json` and drives the engine.
- `src/lib/slug.ts` — slug, label and upload-limit helpers shared by client
  and server.
- `scripts/make-test-stems.mjs` — synthetic test audio, no ffmpeg needed.

## Documentation

- [docs/data-model.md](docs/data-model.md) — accounts → projects → songs → stems, chart/lyrics versions.
- [docs/environment.md](docs/environment.md) — varlock + 1Password, Vercel, the ESM-only rule, Turso + Drizzle.
- [docs/auth.md](docs/auth.md) — Better Auth: sign-in, memberships, what is public, what needs a member.
- [docs/styling.md](docs/styling.md) — the lj-website UnoCSS setup and the "utilities only" rule.
- [docs/audio-engine.md](docs/audio-engine.md) — the engine, progressive loading, memory limits, keyboard.
- [docs/uploads-and-blob.md](docs/uploads-and-blob.md) — the three-step upload, replacements, downloads.
- [docs/agent-screenshots.md](docs/agent-screenshots.md) — `bun run shot` and the Playwright MCP.
- [CHANGELOG.md](CHANGELOG.md) — releases; cut one with the `/release` skill.
- [CLAUDE.md](CLAUDE.md) — conventions and the working agreement for the agent.

## Next (from the plan)

2. ~~Peaks are already computed — persist them.~~ Done; the player draws
   them before decoding finishes.
3. ~~Client-side uploads to Vercel Blob via `@vercel/blob/client`.~~ Done.
4. ~~Load the manifest from Turso.~~ Done.
5. Share links (`share_link` table exists; no UI or `/s/[token]` route yet).
6. ~~Auth (Better Auth).~~ Done; email verification, password reset and
   invitations still need an email provider.
7. ~~Accounts in the URL.~~ Done. Stem ordering, saved mixes, document
   version restore UI.
