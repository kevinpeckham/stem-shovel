# Stem Shovel

Proof-of-concept multi-stem player: synced playback of N audio files in the
browser with per-stem fader, mute and solo, waveform seek, and a memory
readout. Stems are uploaded straight from the browser to Vercel Blob,
catalogued in Turso (accounts → projects → songs → stems), and played back
from there; the original static-file test page still works.

Stack: SvelteKit 5 (runes), TypeScript, UnoCSS (`preset-uno`), Vite+ (Vite,
Oxlint, Oxfmt in one `vp` CLI), `@sveltejs/adapter-vercel`, Vercel Blob for
audio, Turso + Drizzle for data, varlock + 1Password for configuration.

## Run it

```sh
bun install          # Bun is pinned via package.json `packageManager`
vercel link          # once; also pulls OP_TOKEN + OP_ENV_ID into .env.local
bun run stems        # generates 4 synthetic WAV stems + manifest into static/stems/
bun run dev          # open http://localhost:5173/
```

Pages: `/projects` lists and creates projects, `/projects/[project]` lists
and creates songs, `/projects/[project]/[song]` plays a song, shows its
chart, uploads stems into it and deletes stems or the song.
`/projects/[project]/[song]/chart` edits the chart. `/test` plays the
static files.
`bun run smoke:blob` runs the whole flow (create project + song, reserve,
upload, report) against the dev server.

## Database (Turso + Drizzle)

Design and rationale: [docs/data-model.md](docs/data-model.md). Schema files
are the source of truth: `src/lib/server/db/schema/*.ts`, one per table, with
every `relations()` in `relations.ts`.

```sh
bun run db:generate   # write a migration from schema changes into drizzle/
bun run db:migrate    # apply migrations to the Turso database
bun run db:seed       # idempotent: the one account + user the app runs as
bun run db:studio     # drizzle-kit studio
```

drizzle-kit runs outside Vite, so those scripts go through `varlock run` to
get `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. Migrations are committed and
applied from a developer machine, not during the Vercel build.

**No sign-in yet.** `src/hooks.server.ts` puts the seeded owner of the
`lightning-jar` account on `event.locals`; every server function takes
`accountId` from there and scopes its queries by it. Adding Better Auth
replaces the hook, not the queries.

## Configuration (varlock + 1Password)

`.env.schema` declares every variable and is committed. Secrets are not: the
1Password plugin loads them from a 1Password _environment_ at build time.

- **Locally** `.env.local` (gitignored) holds `OP_TOKEN` and `OP_ENV_ID`;
  `vercel link` / `vercel env pull` writes it. Everything else comes from
  1Password. `bunx varlock load` shows what resolves.
- **On Vercel** the only project env vars are `OP_TOKEN`, `OP_ENV_ID` and
  `_VARLOCK_ENV_KEY` (per environment). The Blob token never lives in Vercel.
- **How it reaches the server.** `@varlock/vite-integration` runs in
  `vite.config.ts` with `ssrInjectMode: "resolved-env"`: the build resolves the
  schema and injects the values into the SSR bundle. In preview/production
  `@encryptInjectedEnv` encrypts that blob with `_VARLOCK_ENV_KEY`, which must
  be set at build _and_ runtime (`varlock generate-key --plain | vercel env add
_VARLOCK_ENV_KEY production --sensitive`). Server code reads
  `ENV.BLOB_READ_WRITE_TOKEN` from `varlock/env`; `src/env.d.ts` is generated
  from the schema (`@generateTsTypes`) and excluded from formatting.
- `@vercel/blob` calls always pass `token` explicitly. Left to its defaults
  the SDK prefers OIDC whenever `VERCEL_OIDC_TOKEN` is present (it is, in
  `.env.local`), and that fails in development.

To use your own bounces, drop WAV/FLAC/MP3/Opus files into `static/stems/`
and list them in `static/stems/manifest.json`:

```json
{
	"title": "Song title",
	"stems": [{ "id": "bass", "label": "Bass DI", "url": "/stems/bass.wav" }]
}
```

`bun run check` runs svelte-check. `bun run lint` runs `vp check` (format
check + Oxlint + tsgolint). `bun run format` runs `vp fmt`.

`bunx fallow` runs [Fallow](https://docs.fallow.tools/) (dead code,
duplication, health). Config is `.fallowrc.json`; its MCP server is
registered for Claude Code in `.mcp.json`.

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
  peaks after decoding). `StemUploader.svelte` drives the three steps.
  **No auth yet**; fine behind Tailscale, not for a public deploy.
- `src/routes/projects/` — project list, song list, song page (player +
  files + uploader), all with form actions.
- **Chart** (chords, lyrics, arrangement): markdown on `song.chart_markdown`,
  edited at `…/[song]/chart` with `@kevinpeckham/woof-editor` (the same
  WYSIWYG-markdown editor replicator's blog uses), saved through a form
  action. `data.saveChart` hash-gates a new `song_chart_version` row and
  keeps the last 10; blanking a chart with content needs a second save.
  `server/markdown.ts` renders the read view with barkdown's renderer (what
  the editor seeds from) and `server/sanitize.ts`, an allowlist pass over
  parse5 (ESM; see "Server dependencies are ESM only" below). Typography for both is
  `src/lib/styles/chart.css`.
- `src/routes/test/` — loads `static/stems/manifest.json` and drives the engine.
- `src/lib/slug.ts` — slug, label and upload-limit helpers shared by client
  and server.
- `src/lib/theme.ts` — colours shared by `uno.config.ts` and the canvas renderer.
- `scripts/make-test-stems.mjs` — synthetic test audio, no ffmpeg needed.

## Things worth knowing

- **The engine is loaded from an `$effect` with `untrack()`.** `load()` reads
  the engine's own `$state` synchronously; a bare `$effect(() => engine.load(...))`
  picks those up as dependencies, re-runs, and its teardown closes the
  `AudioContext` mid-decode (this showed up in the smoke test). Reading `data`
  outside `untrack` and calling `load` inside it gives exactly one dependency:
  the route data. `onMount` would also work but would not reload when `data`
  changes on the same page component.
- **The waveform canvas uses `{@attach}`**, following the inline-canvas example
  in the Svelte docs: the attachment gets the 2D context once, and a nested
  `$effect` does the redraws. Attachments are element-scoped, so they replace
  `bind:this` + null guards — they are not a replacement for page-level
  lifecycle like the engine load above.
- **Conditional UnoCSS classes are written as literal strings**
  (`{muted ? 'bg-ink text-panel' : ''}`), not `class:` directives, because the
  default extractor doesn't split on the `class:` prefix. Adding
  `@unocss/extractor-svelte` would lift that restriction.
- **Vite+ instead of Biome.** `vp migrate` rewrote the scripts to `vp dev/build/
preview`, changed the `vite` import to `vite-plus`, and aliased the `vite`
  package to `@voidzero-dev/vite-plus-core` via `overrides` — that alias is
  how SvelteKit's `vite` peer dependency resolves to Vite+'s bundled Vite.
  Lint and format config live in `vite.config.ts` (`lint:` / `fmt:` keys).
  Oxfmt formats `.svelte` files fully, templates included (`svelte: true`).
  Oxlint does not lint `.svelte` at all yet, so Svelte-specific problems are
  svelte-check's job, as before.
- **`vp lint` needs virtual-memory overcommit.** Oxlint's JS-plugin mode
  reserves a 2 GiB, 4 GiB-aligned block per thread. On a normal macOS/Linux
  box that's fine; in tight containers (e.g. minimal CI images) it panics
  with `oxc_allocator ... fixed_size.rs`. Plain `oxlint` without JS plugins
  works everywhere. Vercel builds only run `vp build`, which is unaffected.
- **Bun is the package manager.** `package.json` pins it with a
  `packageManager` field and `bun.lock` is the only lock file. Vercel's
  built-in Bun lags behind (1.3.x) and cannot read the v2 lock file Bun 1.4
  writes, so `vercel.json` sets an `installCommand` that runs the pinned Bun
  via `npx bun@<version>`; keep that version in step with `packageManager`.
  `vp migrate` had written a `devEngines.packageManager` pin for npm instead;
  that was removed.
- The context is created at 32 kHz; `decodeAudioData` resamples into it,
  which is why four 20-second mono stems decode to ~9.5 MB, not ~14 MB.
- **Server dependencies are ESM only.** Vercel's Node 24 function runtime
  (a custom launcher, `/opt/rust/nodejs.js`) has refused CommonJS
  `require()` of an ES module at cold start, taking every route down with
  `ERR_REQUIRE_ESM`, while local Node was fine. Two sanitizers hit it:
  DOMPurify's server build (jsdom → html-encoding-sniffer → `@exodus/bytes`)
  and sanitize-html (htmlparser2 10). Replicator ships the same jsdom chain
  and its three-day-older deployment loads it, so the exact trigger is not
  pinned down; the policy that avoids the whole class is: no CommonJS
  packages in server code. The chart's read view is sanitized by our own
  allowlist pass over parse5 (`server/sanitize.ts`), and the editor package
  is imported in the browser only. After `vp build`, the CommonJS packages
  left in `.vercel/output/functions/*/node_modules` all come from drizzle,
  libsql, varlock and @vercel/blob and predate the problem.
- **Dual-mono files are collapsed to one channel after decoding**
  (`lib/audio/mono.ts`): if every L/R sample pair is within 1e-3, the stereo
  buffer is replaced by a mono one and the row says "dual mono → mono". Real
  stereo is untouched. Memory is the binding limit — ~128 KB per second per
  channel — so a song is capped at `MAX_STEMS_PER_SONG` (32) stems, enforced
  when a stem is reserved; a phone will run out well before that.
- Playback is verified in headless Chromium (load, play, mute/solo, seek,
  pause). Not yet tested on iOS Safari.

## Next (from the plan)

2. ~~Peaks are already computed — persist them.~~ Done (`stem.peaks`); the
   waveform could now draw from the row before audio finishes decoding.
3. ~~Client-side uploads to Vercel Blob via `@vercel/blob/client`.~~ Done.
4. ~~Load the manifest from Turso.~~ Done.
5. Share links (`share_link` table exists; no UI or `/s/[token]` route yet).
6. Auth (Better Auth, as in replicator) before going public; today every
   request is the seeded owner.
7. Stem ordering / relabeling UI, saved mixes, chart version restore UI.
