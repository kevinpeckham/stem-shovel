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

- **iOS starts an `AudioContext` suspended, resumes it slowly, and the
  promise from `resume()` may never settle.** A note scheduled at
  `currentTime` before the resume sat at time zero, so every key pressed
  meanwhile sounded together a second or two later. Warm the context on
  the first touch (`piano.warm`), defer a note until `ctx.state` is
  `running`, and watch the wake by polling `ctx.state` plus
  `onstatechange`, not by awaiting `resume()` (Kevin's phone sat on
  "Starting…" for minutes); play a silent one-sample buffer as the old
  unlock, give up after three seconds and drop that context so the next
  touch gets a fresh one (`piano.svelte.ts`, 58232b7, 37067c1, a410a8d;
  docs/piano.md "iOS and the first note").
- **iOS mutes Web Audio under the ring/silent switch but not media
  elements.** Before playing, set `navigator.audioSession.type =
  "playback"` (Safari 17+) or, where the API is missing, start a silent
  looping `<audio>` on the same gesture; a no-op elsewhere. Nothing
  detects the switch itself (`audio/playThroughSilentSwitch.ts`, 08e11b7;
  docs/audio-engine.md "iOS and the ring/silent switch").
- **WebKit refuses `getUserMedia` under the "playback" audio session**
  ("AudioSession category is not compatible with audio capture", seen
  after playing a song and opening the recorder in the same tab). Capture
  sets `"play-and-record"` first, the player sets `"playback"` again on
  every play, and capture ends with the session back on `"auto"`; the
  opposite trap is that "auto" does not play through the silent switch
  (`utils/audioSession.ts`, d85f9e8, 9cbddbe, `Tuner.svelte`). On iOS
  play-and-record also attenuates the speaker, may move output to the
  earpiece, and makes a wired headset's microphone the input
  (docs/practice-amp.md "iOS Safari").
- **Safari does not render a worklet that nothing pulls.** A capture
  `AudioWorkletNode` whose output goes nowhere never runs its `process`;
  connect it through a zero-gain `GainNode` to `ctx.destination`
  (`inputs.svelte.ts` `#tapSource`, `looper.svelte.ts`).
- **The three voice processors ruin an instrument, and asking is not
  getting.** Request `echoCancellation`, `noiseSuppression` and
  `autoGainControl` off, then read `track.getSettings()`: Chrome on macOS
  has an open bug leaving them on, Safari ignores `channelCount` with
  cancellation off and may omit the rate and channels from the settings,
  so the recorder's format line reports what the track really gave
  (docs/demo-recording.md "Capture", `DemoRecorder.svelte` format line,
  docs/multitrack-recorder.md research).
- **`MediaRecorder` lossless is browser-specific and Chrome's is nearly
  unreadable.** Safari 18.4+ records ALAC in MP4, Chrome and Edge 135+
  raw PCM in WebM, which almost nothing opens, so the jobs function turns
  it into FLAC and a download before that decodes it in the browser and
  writes a 16-bit WAV (`utils/encodeWav.ts`). Pick the first candidate
  `isTypeSupported` accepts from a ladder (`utils/recordingMimeType.ts`,
  89a22db, 495ba61). A fresh WebM take reports no `duration`, so the
  clock uses the timed length (33d1973).
- **`decodeAudioData` does not take every format everywhere.** AIFF,
  Ogg/Opus and WebM fail in Firefox or Safari, so stem uploads are
  limited to WAV, FLAC, MP3 and AAC, and playback renditions are AAC-LC
  because every browser decodes it (Opus unverified on Safari and iPads)
  (999ad03, `server/transcode.ts` header comment).
- **FLAC decoding is decided by a probe, not a version table.** A
  twentieth of a second of FLAC silence through `decodeAudioData` once at
  load; where it fails the hi-res piano tier comes as mp3 instead
  (`pianoSamples.ts` `flacSupported`, 4f4bde9).
- **A hot MP3 decodes past full scale.** Peaks above 1.0 were refused by
  the ready route ("peaks (0..1) are required"); clamp each bin at 1
  where peaks are computed (`computePeaks`, 79039a0).
- **When a tab runs out of memory there is no event.** iOS kills the tab
  and reloads it, Chrome shows its error page. `load()` leaves a
  sessionStorage marker and clears it when the load ends; a fresh marker
  for the same stems at the next load means the last never finished.
  `navigator.deviceMemory` exists only in Chrome and Edge, and WebKit's
  `decodeAudioData` never returns for very large files
  (`engine.svelte.ts` `LOAD_MARKER`, 6be87bd; docs/audio-engine.md "When
  the browser runs out of memory").
- **WebCodecs `AudioDecoder` for AAC has four traps.** Pass the
  AudioSpecificConfig as `description` (iOS refuses ADTS); feed one access
  unit before a seek target and drop its 1024 samples (frames overlap);
  `copyTo(…, { format: "f32-planar" })` because WebKit hands interleaved
  samples; and `isConfigSupported` is not to be trusted, the first failed
  decode is the real test and drops the song to buffered mode
  (docs/stem-streaming.md step 3, `streamWorker.ts` `planar`).
- **`SharedArrayBuffer` is not an option on this site.** It needs
  cross-origin isolation; Safari lacks `credentialless`, so `require-corp`
  would have to cover every font, script and Blob fetch and would sever
  the OAuth and passkey popups that use `window.opener`. Transferred
  `Float32Array` chunks with a few hundred milliseconds of lead carry
  streamed playback instead (docs/stem-streaming.md step 4).
- **`outputLatency` is unreliable until audio has rendered, and input
  latency is not reported at all.** Chrome reports 0 before the first
  render, Safari reports it from 18.4; a loopback calibration is the only
  way to the round trip, and headless Chromium has no speaker-to-mic path
  to test it. Bluetooth output adds 150 ms or more and under-reports it
  (docs/multitrack-recorder.md "Latency", docs/practice-amp.md "Latency
  numbers", 264d3a5).
- **Chrome's `DynamicsCompressorNode` still takes a few dB off at
  threshold 0 and ratio 1:1.** The only true off is a dry path round the
  node with a short crossfade (docs/piano.md "Compressor").
- **A background tab throttles `requestAnimationFrame` but keeps timers.**
  The recorder's silence watch samples the level in its 100 ms timer as
  well as the meter's frame, so a take still stops in a background tab
  (docs/demo-recording.md "Ceilings", `takeStopReason`).
- **Safari rotates `deviceId`s between sessions.** A remembered
  microphone or line-in id made `getUserMedia` fail with "not found" even
  with the built-in microphone present; retry with the default input and
  forget the stale choice (`inputs.svelte.ts`, 6e6b63e).
- **`getDisplayMedia` audio is Chrome and Edge only.** They share a tab's
  audio anywhere and the system's on Windows; a Mac needs a loopback
  device chosen as the line in; Safari shares no audio; drop the video
  track at once, and say "No audio was shared" when the picker's box was
  left unticked. Its latency cannot be measured (the audio never went
  through our output), so it gets a slider (docs/looper.md, the "Looper:
  line in and computer sources" commit).

## Browser platform

- **An anchor-positioned popover's `max-height` should be a percentage, not
  a viewport length.** With `position-area`, the popover's containing block
  is the grid area beside its anchor, so `max-height: 100%` clamps it to the
  space below the button and `overflow-y: auto` scrolls it; a
  `calc(100vh - 2rem)` cap lets a menu opened low on the page run off the
  bottom, where Playwright cannot scroll it into view (the popover is
  `position: fixed`) and a user cannot reach the last items. Dawn's Song
  actions menu, 2026-10-20.

- **A canvas wider than the GPU composites shows nothing, though it draws.**
  Dawn's clip canvases span the whole clip: a 2:27 stem on a Retina screen
  is 11,500 backing pixels at the default zoom and 39,000 zoomed in. Drawing
  into such a canvas succeeds (`getImageData` reads the bars back), so
  headless probes at scale factor 1 saw nothing wrong, while on Kevin's Mac
  the clips came up blank: the compositor drops textures past its limit
  (8,192 px on many GPUs; 32,767 is the hard cap). A capped backing
  store shows the bars but blurs them on a Retina screen; draw only the
  window in view, at full resolution, and follow the scroll (`clipWave`,
  StudioTimeline, 2026-10-20).
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

- **Our own `Permissions-Policy` header switched off four features we
  shipped.** `microphone=()` blocked `getUserMedia`, `midi=()` blocked
  Web MIDI on the deployed site while the dev server worked (a user
  report), `publickey-credentials-get=()` blocked every passkey sign-in,
  and `display-capture=()` kept the looper's Computer source from opening
  the share picker; each is `(self)` now. `autoplay` is deliberately not
  listed because disabling it blocks `play()` too. The constant in
  `securityHeaders.ts` and `vercel.json`'s copy drift apart; keep them in
  step (0.60.0, 0.29.0, 0.79.0, docs/environment.md "Response headers").
- **The CSP's `connect-src` refuses `fetch` of a `blob:` URL.** Fetching
  the page's own object URL before saving it failed with "Failed to
  fetch"; a blob made in the page goes to a download through an `<a
  download>` on an object URL (`utils/downloadBlob.ts`, 0.115.0,
  495ba61). CSS written through `el.style` is fine under a CSP without
  `unsafe-inline` for styles (`anchorFallback.ts`).
- **`showPopover()` called directly gives CSS anchor positioning no
  anchor.** A ContextMenu opened through `bind:openState` landed in the
  viewport's corner; open it through its own trigger button. Firefox and
  older Safari have no anchor positioning at all, so `placePopover`
  positions from `getBoundingClientRect` where `CSS.supports("anchor-name:
  --a")` is false (0.62.0, `utils/anchorFallback.ts`).
- **Native popovers and the UnoCSS reset.** The reset zeroes every
  element's margin, which overrides the browser's `margin: auto` on
  `[popover]`, so a centered popover needs `m-auto` (8e1ca96). A display
  utility on a popover (`flex`) shows it while closed; use
  `[&:popover-open]:flex` (5b35c51). A phone-width popover sized with
  `dvh` keeps its top on screen on iOS (2bfb2a3).
- **A deploy retires the previous build's hashed assets.** An open tab's
  next client-side navigation fetched a missing stylesheet and came up as
  a dark, empty-looking page. `kit.version` named after the commit with
  `pollInterval: 60_000` and a `beforeNavigate` that turns the first
  navigation after a new version into a full load (0.27.0,
  docs/environment.md "Deploys and open tabs").
- **The browser's declared MIME type is unreliable.** Firefox says
  `audio/x-wav`, macOS labels a Voice Memo `audio/x-m4a`, some files have
  none; the upload token allowed only the extension's type, so `.m4a`
  uploads were refused. Derive the content type from the extension on
  both sides (999ad03, e659e94).
- **Password managers and iOS keyboards read a lone text field as a
  login.** A single text input made iOS offer the password manager
  instead of a keyboard; free-text fields carry `data-1p-ignore`,
  `data-lpignore` and `data-bwignore`, and a placeholder or aria-label
  that says "label" rather than "name" gives AutoFill heuristics no
  username cue (f26909d, `ReportForm.svelte`).
- **Focus leaving the window releases held keys.** A tab switch dropped
  the chord player's sustain latch with the keys; a latch is a setting,
  not a held key (0.117.1). The other way round, a focused toolbar button
  swallows the space bar, so transport buttons blur themselves after a
  click (docs/demo-recording.md `spaceOwner`).
- **Safari purges script-writable storage after seven days without a
  visit.** IndexedDB and localStorage copies are caches, never the only
  copy; upload promptly (docs/multitrack-recorder.md "Local
  persistence"). iOS also records only with Safari in front and the
  screen on, and an incoming call ends the track, so segments go to
  IndexedDB as they arrive and the take is recoverable
  (docs/demo-recording.md "Phone realities").

## Svelte and the page

- **A page that shows the jobs function's results must refresh itself.**
  The Sessions page loaded once after an upload and never again, so the
  MP3 and the waveform the jobs function made seconds later stayed
  "rendering…" until a reload; the earlier browser spec only passed
  because the second upload outlasted the first file's render. A timer
  calls `invalidateAll` every few seconds while a row is pending, capped
  (sessions review, 2026-10-19). The song page already did this for
  stems' renditions.
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

- **Links preload on hover.** The nav's Sign out link pointed at a page
  whose `load` ended the session, so hovering it signed you out. Anything
  with a side effect is a POST (a remote form), never a page load
  (0.2.0).
- **Reloading page data before navigating can swap the target out.** The
  two-factor verify page refreshed its data, the refresh redirected (the
  user was now signed in) and the navigation target read as
  `/undefined`; capture the target first, then navigate with a single
  reload (0.16.0).
- **SvelteKit hides an unexpected error's message in production.** A
  failed AI call surfaced as "Internal Error"; throw `error(502, message)`
  so the reason reaches the client, and show it through `errorMessage`
  (0.10.0).
- **SvelteKit 3 refuses `redirect()` to an external URL.** The file
  permanent link `/f/<code>` answered 500; a plain 302 `Response` to the
  store does it. Behind a proxy a redirect built from the request's
  origin came out `http://`, so redirects on a stage are relative
  (0.123.0).
- **SvelteKit 3 renamed what a script posts to a remote form.** Fields
  are namespaced `field/<form id>`, which broke the blob smoke script;
  `$lib` became `#lib` with extensions, `invalidateAll` became
  `refreshAll`, `$app/environment` became `$app/env`, and `handleError`
  now receives validation errors too, sorted by `kind` (f0d994b,
  0.113.1).

## Testing

- **A textarea's text joins its label's accessible name.** `getByLabel("Comment",
  { exact: true })` found the empty box in the create form and nothing in the
  edit form, where the same label wraps a textarea with text: the name was
  "Comment Drags after the bridge". Match a filled control by the start of
  its name (`getByRole("textbox", { name: /^Comment/ })`) or put the label
  text in `aria-label` (sessions review spec).
- **A `{@const}` inside an `{#if}` block is read again as the block closes.**
  A menu's handler set `menuAt = null` and then used `r`, declared as
  `{@const r = menuAt.recording}` in the `{#if menuAt}` block: the const
  re-evaluated on null and the page crashed out of its template. Read what
  a handler needs into a local before clearing the state that shows the
  block (sessions page menu).
- **The fakes' `background()` never runs its callback.** A remote test
  asserting that a notification helper was called sees nothing: the
  notice runs inside `background(() => notify…)`, and the fake
  `background` is a bare `vi.fn()`. Assert on `background` being called,
  or call the captured function (sessions review remote tests).
- **`form()` refuses a valibot schema wrapped in `v.pipe(…, v.check())`.**
  The check's input type is the object alone, which the remote `form`
  overloads do not accept. Keep the form schema a plain `v.object` and do
  the cross-field check in the function with `error(400)` (`ChatSchema`'s
  one-of-two scope).
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

- **Chromium fakes a microphone.** `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`
  plays a WAV as the input, which is how the recorder, looper and Studio
  specs record; iOS Safari needs a real phone (docs/demo-recording.md
  "Testing", `playwright.config.ts`).
- **The CSP forbids string evaluation in `page.evaluate`.** The browser
  specs pass the window as a handle and reach the engines through the dev
  build's `window.__studio`, `__looper` and friends instead of evaluating
  strings (fc86144, docs/testing.md "Browser tests").
- **The varlock Vite integration bakes real ids into a module under
  test.** The Blob test "passed" only because its hard-coded store ids
  happened to be production's; derive expectations from the `ENV` the
  test actually sees, and have the env mocks export `initVarlockEnv`
  (2ac4fb4, ce180b0).
- **`@vitest/coverage-v8` must be pinned to the Vitest that Vite+
  bundles**, and instrumentation slows the FFT-heavy analysis tests
  enough to need a longer timeout; lines in `.svelte` files count only
  for the component project, so engines behind Web Audio read low
  (90a4534, docs/testing.md "Coverage").
- **A secrets-scan action must be on the repository's allowed-actions
  list** (`gitleaks/gitleaks-action@*`) or the workflow never starts, with
  no error in the run list (1003030).

## Database and tooling

- **A schema floor hides a missing value.** A stem with no stored length
  became a Dawn clip of 0.001 s, the clip schema's minimum, which passed
  validation and drew nothing: the import had turned "unknown" into
  "tiny". Treat nullable metadata as unknown all the way down (measure it,
  or fill it in when the real value appears) rather than clamping it into
  a valid-looking number (stems into Dawn, 2026-10-20).
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

- **Bundling does not rescue a CommonJS server dependency on Vercel.**
  `ssr.noExternal` leaves the inner `require()` in place (sanitize-html
  still required htmlparser2 10, ESM-only, and the nested copy was not in
  the function), and pinning to the last CommonJS htmlparser2 did not
  load either; the sanitizer was rewritten on parse5. After a build,
  `.vercel/output/functions/*/node_modules` shows what was packed
  (1167412, efd728f, e47a516, 8dc44cc; docs/environment.md "Server
  dependencies must be ESM").
- **Vercel's file tracer sees only literal imports.** tfjs and Basic
  Pitch were never packed because `notes.ts` imported them by a variable
  name, so notes transcription silently failed on every song page until a
  literal `import()` named them (`traceTranscriptionDeps`); the tracer
  resolves `better-auth` to its package.json alone and never copies
  `dist/` ("Cannot find module 'better-auth'"), hence `ssr.noExternal` for
  that one, which is pure ESM; it special-cases `ffmpeg-static`, whose
  postinstall download also needs `trustedDependencies` under Bun
  (`server/notes.ts`, `vite.config.ts`, 0.17.0,
  docs/uploads-and-blob.md).
- **A function's fetch of its own site is challenged by the firewall.**
  tfjs's node-fetch client got a 429 on the model file; Node's own
  `fetch` under a named user agent passed for a while, and the model now
  travels bundled as JSON written to the job's temp dir (17b26ad,
  8577cf6). The dev VM's address bypasses the bot challenge, which is why
  `smoke:urls` can run there (docs/testing.md).
- **The dev server cannot call itself through the exe.dev proxy.** The
  jobs self-call used the proxy's origin and was refused, so Chrome takes
  on dev stayed raw PCM with no MP3 and nobody noticed; in dev it targets
  localhost (495ba61).
- **`vercel.json` host redirects stopped applying once the dashboard's
  domain redirect was removed** (every host served the site), so vanity
  domains redirect from the server hook with a 308 (58fed89,
  `utils/vanityHostTarget.ts`). An edge rule `/:account/ideas` also
  caught `/docs/ideas`, so account-scoped redirects stay in SvelteKit
  (cfb4fc0). The `X-Robots-Tag` rule for static files in `vercel.json`
  must be widened for each new public page; `/tuner` carried `noindex` in
  production from the day it shipped (0.28.0).
- **Vercel's bundled Bun cannot read the v2 lock file Bun 1.4 writes**,
  so it ignored `bun.lock` and resolved fresh on every build; `vercel.json`
  installs with `npx bun@<pinned> install --frozen-lockfile`. Dependabot's
  bun updater rejects the same lock file, so it watches Actions only
  (40eb569, 8b72009).
- **Vite evaluates its config before a plugin can inject env.** The
  Sentry plugin saw no token until `@varlock/vite-integration` was
  imported first (it runs `varlock load` and fills `process.env` at
  import); `varlock run -- vp build` is not an option on Vercel, where
  there is no `OP_TOKEN` and the CLI cannot read the encrypted integration
  variables (e72e8f9, 33c527b, 86b464e). Under `SKIP_VARLOCK` the plugin
  module must not even be imported, since it reads `.env.schema` on import
  and complains (f2e2fc2).
- **UnoCSS `presetWebFonts` fetches the provider's CSS when the config
  loads.** That timed out in CI's test job; splicing the preset out under
  tests broke CSS hot reload in dev, so it stays with the no-fetch
  provider under Vitest and CI while builds still inline the fonts
  (a9e255a, 0.35.0).
- **`@libsql/client` 0.18 rejects the `turso://` URLs Turso's newer
  dashboard hands out**, though the database speaks the same protocol;
  `utils/libsqlUrl.ts` swaps the scheme wherever a client opens, so either
  form may sit in 1Password (2ac4fb4).

## Packages

- **`@vercel/blob`'s `put` retries, and a stream cannot be read twice.** A
  Blob-to-Blob copy that handed `fetch`'s body stream to `put` worked until
  a part failed and the SDK retried: "Response body object should not be
  disturbed or locked", and a five-stem import stopped at the third. Use
  the SDK's `copy` within a store (the service copies, nothing passes
  through the function) and a buffered `Buffer` across stores (`copyBlob`,
  2026-10-20).
- **`@mediabunny/mp3-encoder` 1.62.0** (MPL-2.0, ESM, peer `mediabunny
  ^1.0.0`): `registerMp3Encoder()` adds LAME as a mediabunny custom
  encoder, and a custom encoder wins over a native one, so register it
  only on the first encode (`encodeMp3.ts` imports it dynamically; it is
  312 kB with the worker and WASM inlined, spawned from a blob URL, so a
  CSP would need `worker-src blob:`). Three things the types do not say:
  an explicit `Quality({ bitrate })` reaches LAME unsnapped (mediabunny
  snaps only the bitrates it derives from a quality level), so snap to
  the Layer III set yourself; the encoder's `supports` takes only the
  MPEG rates (48, 44.1, 32 kHz and their halves and quarters), so a 96 kHz
  buffer needs `transform.sampleRate`; and a planar `AudioSample` is one
  `Float32Array` with the channels laid end to end, five seconds at a time
  the way `AudioSample.fromAudioBuffer` does it (Dawn MP3 export,
  2026-10-20).
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

- **Better Auth turns a 403 from `user.create.before` into a fake
  success.** The sign-up route uses that as its duplicate-email cover, so
  a gate that refuses must throw a 400 with a reason (57b7536,
  docs/auth.md "Invite-only sign-up").
- **Better Auth's handler ignores a request whose origin differs from
  `baseURL`.** With the URL pinned to production for every non-dev build,
  every `/api/auth/*` call on a preview answered the app's 404 page and
  nobody could sign in on staging; previews infer it from the request
  (7b9ad2a).
- **Better Auth encrypts TOTP secrets with `BETTER_AUTH_SECRET`.** A
  `two_factor` row copied to a stage with its own secret can never verify
  and the retries trip the plugin's 3-per-10-seconds limit; a restore
  leaves the table out and users re-enrol per stage (5bfa611).
- **`@vercel/blob` prefers OIDC whenever `VERCEL_OIDC_TOKEN` is set**
  (it is, in `.env.local` after `vercel env pull`) and that fails in
  development, so every call passes `token` explicitly;
  `onUploadCompleted` cannot reach localhost, so the browser's own ready
  report is the primary path and the webhook a production backstop
  (docs/environment.md, docs/uploads-and-blob.md).
- **`@vercel/analytics` and `@vercel/speed-insights` `/sveltekit` entries
  still import `$app/stores`**, removed in SvelteKit 3; inject from their
  generic entries and report the route after each navigation yourself
  (`src/lib/observability.ts`, 0.113.1).
- **`@sentry/sveltekit`'s server entry re-exports the Vite plugin**,
  dragging Vite, esbuild and Babel into every cold start, and its ESM
  loader hook slows every import after it; `autoInstrument: false`
  because the load wrappers import that entry into every route
  (docs/environment.md "Sentry", b59e9dc).
- **DOMPurify's server build pulls in jsdom**, whose
  `html-encoding-sniffer` now depends on an ESM-only package; it took
  production down on every route at cold start (1167412;
  `server/sanitize.ts` header).
- **The in-app markdown editor (woof-editor) saves headings with
  brackets escaped** (`## \[0.31.0\]`), so a changelog parser that knows
  only `## [x.y.z]` emptied the Releases page after every in-app edit;
  accept both spellings (0.31.1, `parseChangelog`).
