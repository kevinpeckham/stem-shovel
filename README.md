# Stem Shovel

Proof-of-concept multi-stem player: synced playback of N audio files in the
browser with per-stem fader, mute and solo, waveform seek, and a memory
readout. Step 1 of the plan — engine + test page against static files.

Stack: SvelteKit 5 (runes), TypeScript, UnoCSS (`preset-uno`), Vite+ (Vite,
Oxlint, Oxfmt in one `vp` CLI), `@sveltejs/adapter-vercel`. No database or
blob storage yet.

## Run it

```sh
bun install          # or npm install
bun run stems        # generates 4 synthetic WAV stems + manifest into static/stems/
bun run dev          # open http://localhost:5173/test
```

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

## Where things live

- `src/lib/audio/engine.svelte.ts` — `StemEngine`: one `AudioContext`, one
  `GainNode` per stem, all sources scheduled against the same clock timestamp.
  Public fields are `$state`, so components read `engine.position` directly.
- `src/lib/audio/peaks.ts` — reduces an `AudioBuffer` to 1024 peak values.
  Later this JSON is what gets stored in Turso alongside the Blob URL.
- `src/lib/components/` — `Transport`, `StemRow`, `Waveform` (canvas + DOM playhead).
- `src/routes/test/` — loads `static/stems/manifest.json` and drives the engine.
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
- **`vp migrate` writes a `devEngines.packageManager` pin** for whichever
  package manager it detects. It was removed here because it pinned npm 12
  and the CI image had npm 10; with Bun locally you'll want it to say bun.
- The context is created at 32 kHz; `decodeAudioData` resamples into it,
  which is why four 20-second mono stems decode to ~9.5 MB, not ~14 MB.
- Playback is verified in headless Chromium (load, play, mute/solo, seek,
  pause). Not yet tested on iOS Safari.

## Next (from the plan)

2. Peaks are already computed — persist them.
3. Client-side uploads to Vercel Blob via `@vercel/blob/client`.
4. Load the manifest shape from Turso instead of `static/`.
5. Share links.
