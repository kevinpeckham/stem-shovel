# Stem Shovel

Proof-of-concept multi-stem player: synced playback of N audio files in the
browser with per-stem fader, mute and solo, waveform seek, and a memory
readout. Stems are uploaded straight from the browser to Vercel Blob and
played back from there; the original static-file test page still works.

Stack: SvelteKit 5 (runes), TypeScript, UnoCSS (`preset-uno`), Vite+ (Vite,
Oxlint, Oxfmt in one `vp` CLI), `@sveltejs/adapter-vercel`, Vercel Blob for
audio, varlock + 1Password for configuration. No database yet.

## Run it

```sh
bun install          # Bun is pinned via package.json `packageManager`
vercel link          # once; also pulls OP_TOKEN + OP_ENV_ID into .env.local
bun run stems        # generates 4 synthetic WAV stems + manifest into static/stems/
bun run dev          # open http://localhost:5173/
```

Pages: `/upload` sends stems browser → Blob, `/songs` lists what's in the
store, `/songs/[slug]` plays one song (and can delete it), `/test` plays the
static files. `bun run smoke:blob` uploads the generated WAVs through the real
client flow against the dev server.

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
- `src/lib/server/blob.ts` — songs are folders under `stems/` in the Blob
  store; a song's manifest is derived from a listing (title from slug, label
  from filename) until Turso holds it.
- `src/routes/api/upload/` — `handleUpload()` token route for client uploads.
  Validates the `stems/<slug>/<file>` pathname, audio content types and size.
  **No auth yet**; fine behind Tailscale, not for a public deploy.
- `src/routes/upload/`, `src/routes/songs/` — upload form, song list, player
  with a delete form action.
- `src/routes/test/` — loads `static/stems/manifest.json` and drives the engine.
- `src/lib/slug.ts` — slug + pathname helpers shared by client and server.
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
- Playback is verified in headless Chromium (load, play, mute/solo, seek,
  pause). Not yet tested on iOS Safari.

## Next (from the plan)

2. Peaks are already computed — persist them.
3. ~~Client-side uploads to Vercel Blob via `@vercel/blob/client`.~~ Done.
4. Load the manifest shape from Turso instead of a Blob listing (keeps the
   user's title and stem order; `onUploadCompleted` is where rows get written).
5. Share links.
6. Auth on `/api/upload` and the delete action before going public.
