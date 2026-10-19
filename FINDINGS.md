# Findings

Gotchas and insights from working on this code: what a package, a
browser API or a tool did that was not obvious, and what to do about it.
Add an entry whenever one surfaces (CLAUDE.md, "Working agreement").
Newest at the top of each section; say where the lesson came from so
the code can be found. Things the repo already documents as conventions
belong in CLAUDE.md or docs/, not here.

## Web Audio

- **`setValueCurveAtTime` curves may not overlap, not even at their
  ends.** A clip's fade-in and fade-out curves each take at most half
  the clip's span less a hair, and nothing else is scheduled inside a
  curve's interval (`scheduleFades` in `studio.svelte.ts`, D4). Setting
  `param.value` before the first curve replaces the usual
  `setValueAtTime(0, at)`, which would land on the curve's start time.
- **An `AnalyserNode` downmixes to mono.** For anything that needs the
  channels apart (the LUFS readout sums the channels' mean squares),
  split with a `ChannelSplitterNode` into one analyser per channel
  (`#readLoudness`, D3).
- **`IIRFilterNode` carries the K-weighting.** The BS.1770 shelf and
  high-pass as `createIIRFilter([b0, b1, b2], [1, a1, a2])`; the
  coefficients from libebur128's derivation land on the standard's
  48 kHz table (`utils/measureLoudness.ts`, with the test that checks
  them). The first derivation tried, pyloudnorm's shelf formula with the
  same parameters, does not.
- **An `AudioBuffer` plays on any context.** The piano's decoded samples
  and the drum kits, decoded on the live context, play fine on an
  `OfflineAudioContext`, which is what lets MIDI tracks render offline
  (`instruments.ts`, D3). `new AudioBuffer({ numberOfChannels, length,
  sampleRate })` needs no context at all (`#sourceFromChannels`).
- **An insert chain with no inserts must still connect input to
  output.** The chain compared "what is wired now" with "what the list
  says" to skip rewiring, and an empty list equalled the initial empty
  state, so nothing was ever wired: every track without an insert was
  silent, live and in a bounce, and no test had asserted sound. A null
  sentinel for "never wired" fixed it; the export spec now checks the
  rendered peak (`insertChain.ts`, found in D3).
- **A tempo change under a running metronome needs a restart.** The
  metronome's grid is fixed at `startAt`; a change inside a pass is
  queued like a note and, when it fires, stops the metronome and starts
  it again at the change's moment with the new tempo and meter
  (`#queueMidi`, D5).
- **Autocorrelation lags are whole frames.** A period that is not a
  whole number of 10 ms frames (93 bpm) scores low at its own lag and
  well at twice it, so a plain argmax reads half tempo. Score each lag
  with its neighbors and refine the period between lags
  (`utils/detectTempo.ts`, D5).
- **BS.1770 gating keeps edge blocks.** Blocks straddling a tone's end
  are part tone and pass both gates, so a tone-then-silence file reads a
  few tenths under the tone alone. Tests allow for it rather than
  tighten the gate.

## Browser platform

- **The CSP blocks worklets from blob URLs.** `script-src 'self'
  'wasm-unsafe-eval'` governs `audioWorklet.addModule`; `worker-src
  'self' blob:` does not reach it. signalsmith-stretch builds its
  worklet as a blob URL and would fail in production, so the stretch is
  a pure WSOLA in `utils/stretchChannels.ts` (D5). A third-party worklet
  must be served from `static/worklets/` as the amp's and the capture's
  are. The same policy rules out WAM plugin hosting from other hosts
  (D6).
- **The dev server serves code live; the build needs a restart.** A
  Svelte or TS edit is in the next page load. After `bun run build`, and
  after a new route or static file, `systemctl --user restart
  stem-shovel-dev` and wait for a 200 before browser tests.

## Svelte and the page

- **Page data is not deeply reactive.** Setting `song.shared = true` on
  an object inside `data.songs` changed nothing on screen; the menu
  label stayed. After a mutation on the server, `refreshAll()` and let
  the load bring the new row (D7).
- **A `$effect` on a flag fires on the transition, not while it holds.**
  The autosave effect watched `studio.dirty`; a save in flight cancelled
  the debounce timer, an edit during the save left the flag true, and no
  save was ever scheduled again. After a save, compare the snapshot
  sent with the state now and reschedule when they differ
  (`studioPersistence.svelte.ts`, D7/D8).
- **Serialize the page's own saves when the server guards on a base
  revision.** Two overlapping saves from one browser carry the same base
  and the second looks like another person's write. A promise chain
  (`saveNow` behind the save in flight) keeps the base the one the last
  save made (D7).
- **`{@const}` sits only directly under a block or component tag.** Not
  inside a plain `<div>`; hoist it to the `{#each}` it belongs to
  (StudioTimeline, D4).
- **A derived declared before `const engine = studio` cannot use
  `engine`.** Order in `<script>` matters for `$derived` initializers;
  read the imported singleton instead.
- **Valibot's `nanoid` action accepts any `[\w-]+` string.** A test with
  `"short"` as a bad id passed; use a value with a space or punctuation.
  A forward reference in a schema (a track holding clips declared later)
  works with `v.optional(v.lazy(() => Schema))`.
- **Popover placement from a button at the far left lands at x = 0.**
  `ContextMenu` with `position="bottom left"` extends leftward from the
  button and clamps to the viewport; the timeline's inserts menu and the
  console's do this alike (pre-existing, noted in D2).

## Testing

- **Playwright `count()` counts hidden elements; `getByRole` does not.**
  A closed popover's buttons (display: none) make `count()` non-zero and
  then a `click()` waits forever for visibility. Filter with
  `.filter({ visible: true })` before counting (`deleteStudioSongs`,
  D7). The same helper raced its own deletes behind a fixed wait; wait
  for the row count to drop instead.
- **`getByRole` names match by prefix unless `exact: true`.** "EQ Low"
  also matched "EQ Low freq" and failed strict mode (D2 mixer spec).
- **A status text can match before the thing happened.** "saved" showed
  as soon as a song opened, so a test waiting for it passed before the
  autosave landed and the next step raced it. Wait for "unsaved" and
  then "saved" (D7 spec).
- **Screenshot scripts and the browser suite share the bot's account.**
  A one-off script deleting the bot's songs while the suite runs makes
  a spec fail mid-test. Run them one after the other.
- **A regex in a heredoc gets double-escaped.** `\\d` in a bash heredoc
  writing a `.ts` file becomes a literal backslash in the regex. Check
  the written file (D5 spec).
- **`page.dragAndDrop` drives HTML5 drag-and-drop** with the page's own
  `dataTransfer`, so a library-to-timeline drop is testable without
  synthesized events (D6 spec). In jsdom, dispatch a `dragover` and a
  `drop` with a `dataTransfer` defined on the event instead.
- **Two pages in one Playwright context share the sign-in.** The
  conflict test opens the same song in a second page from
  `context.newPage()` (D7 spec).
- **jsdom lacks `scrollIntoView` and `:popover-open`.** Stub the first
  on `Element.prototype`; scope a popover's content by its `[popover]`
  ancestor rather than the pseudo-class (component tests, D2).
- **Vitest fake timers and promise chains.** Work queued behind
  `.then` does not run until microtasks flush; `await
  vi.advanceTimersByTimeAsync(0)` flushes them (persistence test, D8).
  A mock that captures a resolver inside its implementation has not
  captured it until the mock ran.
- **Oxlint's `unbound-method` flags `expect(obj.method)`.** Hoist the
  spies (`vi.hoisted`) and hand them to the mocks, then assert on the
  spies (`instruments.test.ts`, D6). It also wants `sort` to have a
  comparator and `expect(...).toBeDisabled()` awaited in Playwright.
- **`git add -A -- <path>` fails on a path already removed with
  `git rm`.** Leave removed files out of the list; the removal is
  staged already.

## Database and tooling

- **Turso answers 502 to drizzle-kit's migration batch now and then
  while single statements go through.** `bun run db:migrate:steps`
  applies the statements one at a time with the same journal rows
  (0089/0090, and the fallback for 0091).
- **drizzle-kit `generate` through varlock** needs the environment
  (`bun run db:generate`), and a `v.lazy` schema in valibot has no
  bearing on the Drizzle side.
- **Fallow flags a type re-export and unused stage factories.** Keep
  internal factories unexported; re-export a type only where something
  imports it (D2, D6).
- **cspell wants every technical term listed.** `words:` in
  `cspell.config.yaml` (libebur, sinc, WSOLA); `bun run spell:us`
  catches British spellings in copy, comments included.
- **Phosphor icon names can be checked before use** against
  `node_modules/@iconify-json/ph/icons.json`; an unknown name renders
  nothing without an error. UnoCSS likewise renders nothing for a color
  that is not in the palette (`bg-sage` is not; `bg-green-300` is).

## Packages

- **signalsmith-stretch 1.3.2** (MIT, ESM): worklet from a blob URL
  plus WASM; fine where the CSP allows it, set aside here (see Browser
  platform).
- **fflate** zips in the browser synchronously (`zipSync`) and streams
  on the server (`Zip`, `ZipPassThrough`); audio goes in stored (level
  0), text deflated. A `.dawproject` is a zip with `project.xml`,
  `metadata.xml` and the audio.
- **Valibot** `v.picklist` over a `const` array keeps one source of
  truth for an enum and its type (`STUDIO_FADE_SHAPES`,
  `STUDIO_INSTRUMENTS`).
