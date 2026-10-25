# Findings

Gotchas and insights from working on this code: what a package, a
browser API or a tool did that was not obvious, and what to do about it.
Add an entry whenever one surfaces (CLAUDE.md, "Working agreement").
Newest at the top of each section; say where the lesson came from so
the code can be found. Things the repo already documents as conventions
belong in CLAUDE.md or docs/, not here.

## AI features

- **Correction to the chart-read finding, and the composed-pipeline
  result** (stem-bench Study 5 + Study 3 Correction, 2026-10-24; full
  tables in the repo's REPORT.md). Study 5 composed the real path
  (engraved page, chart-read, chart-anchored song-check) and its
  anatomy caught a fixture bug that corrects Study 3: the bench's PDF
  generator silently dropped every chord accidental (a WinAnsi font
  cannot encode music glyphs), so the models in the PDF arm were
  correctly reading corrupted pages, not failing at PDFs. Corrected
  numbers: fable reads a CLEAN PDF at 99.3% chord recall, equal to
  images. **The earlier "rasterize PDFs app-side" guidance is
  withdrawn** — unnecessary for clean PDFs, useless for corrupt ones
  (the corruption is in the drawn page). The replacement guidance: add
  a key-vs-chords consistency check on chart-read output — a score
  whose key signature says flats while every chord prints natural is
  the signature of accidental-dropping PDF generation in the wild, and
  fable already flags exactly this unprompted in its Note line; treat
  that Note as a first-class signal (surface it to the user) rather
  than prose. The composed-pipeline result itself: with a competent
  reader the chain equals the truth-fed ceiling (zero added errors,
  both formats), the song-check inherits chart-read's accuracy 1:1,
  and the one reader omission was rescued by the listener reading the
  chart's chord content. Surfacing the chart summary for user
  correction before it anchors the song-check protects everything
  downstream.
  Acted on 2026-10-24 (docs/audio-engine.md "The chart read is
  checked"): `utils/chartReadWarnings.ts` runs the key-vs-chords check
  on every read score and carries the reader's Note lines; the
  song-check answer brings them as `warnings`, the song page shows them
  in amber on the card and no longer applies a doubtful answer unasked.

- **The song-check reads; it does not hear** (stem-bench Study 4,
  2026-10-23; full tables in the repo's REPORT.md). `askAiAboutMix`
  measured against synthesized mixes whose tempo, meter and key are
  true by construction, with the pulse mechanically verified in the
  audio (committed onset-autocorrelation instrument) and the detector
  candidates ablated. Blind, the production model (and gemini
  3.5-flash alike) pins tempo to a genre prior at confidence 1.0
  (1-2/12 correct on drummed 60-140 bpm mixes), names wrong keys
  (1-2/12) and finds zero tempo or key changes; handed WRONG detector
  candidates it echoes them (production: 10-12/12 per field); handed
  the song's chart it is perfect on every field and places all six
  changes within four seconds. What this means for the code: (1) the
  second opinion must never override the DSP detector on tempo or
  meter — where the two disagree, the detector is the likelier ear;
  (2) the feature's real value is the chart-anchoring path (score
  summary beside the mix), which turns it into a precise
  change-placement tool; consider gating the no-chart path or
  shrinking its claims; (3) the `confidence` field is uninformative
  (1.0 on fabricated answers) and should not drive UI; (4) the swap
  space is gemini-only (gpt-4o-audio-preview is not on the gateway;
  Anthropic models take no audio), and 3.5-flash is the better
  listener only in that it pushes back on wrong tempo/meter
  candidates where 3-flash echoes everything — both still swallow a
  wrong key. One honesty note: the production model once invented a
  tempo for a pulseless pad unprompted (gate failed by letter) while
  resisting a false "120 bpm" suggestion on the same pads; 3.5-flash
  ran the probe clean.
  Acted on 2026-10-24 (docs/audio-engine.md "The song-check reads the
  chart"): the check needs the score, the key is never handed over,
  tempo and meter come from the answer only where the chart states
  them, the close-call meter listen and the confidence figure are gone.

- **chart-read measured: the model reads sheet music; the PDF path is
  the weak link** (stem-bench Study 3, 2026-10-23; full tables in the
  repo's REPORT.md). A registered round trip — Verovio-engraved scores
  with every fact known, graded against this repo's own
  `musicXmlSummary` of the source XML — across fable, opus, haiku and
  gemini-flash. The shipped model reads engraved notation from a clean
  PNG at 98.8% exact chord recall, 100% precision, zero measure-count
  drift, keys at 91.7% within a measure, about $0.06 a score — the
  "read as text, the keys are plain" anecdote holds under measurement.
  The actionable part: three of four models lose 20+ points of chord
  recall when the SAME page arrives as a PDF instead of a PNG (fable
  98.8 to 76.0; repeat dots collapse hardest), so `readChartWithAi`
  should rasterize PDF uploads app-side and send images rather than
  trusting each provider's internal PDF pipeline. **Withdrawn
  2026-10-24**: the Study 5 correction above traced the PDF loss to the
  bench's own PDF generator dropping accidentals; the app never
  rasterized, and should not. Do not point this
  surface at haiku (1.2% chord recall, 15-measure drift, writes a
  stub) and keep an unreadable-page guard in mind if the model ever
  changes: gemini fabricated a key and meter from an 80 px smear
  instead of saying it could not read it, while every anthropic model
  declined honestly. Calibration note for any future probe of this
  kind: vision models read far below human-legible resolution (7/8
  chords off a 150 px smear), so unreadability must be calibrated by
  model behavior, not eyesight.

- **Text-to-Beat's reasoning-off choice is measured — and the env-var
  model swap is a hazard** (stem-bench Study 2, 2026-10-22; full tables
  in the repo's REPORT.md). The production call shape, ported verbatim
  and run on 25 beat prompts with 49 mechanical checks against four
  other models: the hard-coded claim in textToBeat.ts is upheld beyond
  its wording for the shipped model — kimi-k2.6 with default reasoning
  scored 44% vs 95% with reasoning off, at 20× latency and 30× output
  tokens, because its thinking exhausted even an 8,000-token budget on
  14/25 prompts and the retry cannot replay an empty assistant turn
  (the gateway 400s). The hazard: `TEXT_TO_BEAT_MODEL` exists so models
  can be swapped without a deploy, but **gemini-3.5-flash ignores
  `reasoning: { effort: "none" }`**, thinks ~3,000 tokens regardless,
  and under the 1500-token `MAX_OUTPUT_TOKENS` burned to the cap and
  returned nothing on 25/25 prompts (with an 8k cap: 25/25 valid, 99%
  on checks, and FASTER than its broken off-arm). A swap to a model
  that disobeys the reasoning field silently kills the feature; worth
  either a per-model output budget, a one-request smoke on swap, or
  both. Anthropic models are indifferent to the field (haiku identical
  arms at 92%; fable 100% both arms, adaptive thinking costing only
  1.4× tokens); gpt-oss-120b is the one model reasoning helps (77% →
  92%, not significant, 2.8× cost — mostly rescuing its weak first-try
  format validity).
- **The v0.142.0 matcher re-measured in the shipped configuration**
  (stem-bench Amendment 2, the re-run the matcher brief asked for; full
  tables in the repo's REPORT.md "Production response"). Hint accuracy
  over the bench's stored transcriptions: 90.5% → 96.4% (the one-bar gap
  against the brief's own re-score of 423/397 is the silent bar, truth
  N.C. and matcher N.C., which the bench's registered equivalence counts
  correct). The shipped arm per model, old → new hints: fable 99.8 →
  99.3% (noise; zero wrong hints propagated under either matcher, all
  rescued), gemini-flash 94.3 → 98.2%, gpt-oss 85.9 → 92.0%, haiku
  87.5 → 92.5%, kimi 75.5 → 94.8%. One precision for the question as
  asked: the flip rate is measured in the wrong-hint arm, which does not
  involve the matcher, so it is unchanged by construction — what the new
  matcher changes is hint quality and error propagation (fable: still
  zero). The substitution read sharpens: haiku, kimi and gpt-oss now sit
  BELOW the bare v0.142 matcher's 96.4% in the shipped configuration;
  only fable and gemini add value over the matcher they are given.
- **The chart draft's hint design is measured, and it holds** — a
  pre-registered external study (stem-bench Study 1,
  github.com/kevinpeckham/stem-bench: 440 seeded bars, Basic Pitch on
  synthesized songs, the hint ablated across four arms, five models;
  full REPORT.md there). What matters to this code: DRAFT_MODEL in the
  shipped configuration scores 99.8% bar accuracy, +9 points over the
  matcher alone at about $0.10 a draft, never copies a wrong hint root
  (0/438) and flags a wrong hint in `notes` in 11/16 songs; cheaper
  substitutes (haiku, kimi) score BELOW the bare matcher in the same
  configuration and copy wrong hints at 43–56%, so the hint line is
  safe for fable and poison for small models. Two actionable specifics:
  `chordOf`'s −0.04 bare-fifth penalty names root+fifth bars as major
  or sus when no third sounds (3/28 on a power-chord song — the model
  rescues it, the matcher alone cannot); and one prompt deterministically
  returned an empty completion (0 output tokens, reproduced) — the
  draft has no retry, so a single retry-on-empty-text would be worth it.
  (Both shipped in v0.142.0: the missing-tone penalty in `chordOf` and
  one retry in `draftChartWithAi`; the entry above measures the result.)
  Also reproduced from scratch: kimi with default reasoning spends the
  whole output budget thinking (the Text-to-Beat lesson generalizes to
  every kimi call shape).

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

- **Headless Chromium names a download "download" when the `download`
  attribute holds a non-ASCII character.** `a.download = "Song · Oct 21
  · 02-32 PM.zip"` (Dawn's default song title, with middle dots) came
  through Playwright 1.63's `download.suggestedFilename()` as
  "download"; "Éclair.zip" and an en dash did the same, while the ASCII
  spelling kept its name. Real Chrome keeps the Unicode name. A spec that
  reads a download's name gives the song an ASCII title first
  (studio-export.spec.ts) (2026-10-21).
- **Validating a writer's XML against its schema finds what a lenient
  reader hides.** Dawn's DAWproject writer had written `Volume` before
  `Pan` and `Mute` inside `Channel` since the start; Bitwig's own JAXB
  reader and Dawn's reader took it, and the first `xmllint --schema
  Project.xsd` refused it (the schema's sequence is Mute, Pan, Sends,
  Volume). `libxml2-wasm` (1.3 MB, MIT, `XsdValidator.fromDoc`) runs the
  same check inside Vitest, so every writer test now validates against
  the schemas kept in `tests/dawproject/` (2026-10-21).
- **`import.meta.url` resolves to `/` under the jsdom environment.** A
  test file that needs a fixture from disk resolves it from
  `process.cwd()` instead of `new URL(..., import.meta.url)`, which
  landed on `/tests/...` (2026-10-21).
- **A `// @vitest-environment jsdom` docblock works inside a Vitest
  project that runs on Node.** The unit project (`src/**/*.test.ts`,
  environment node) still honours the per-file docblock, so a parser that
  needs `DOMParser` (utils/dawprojectRead.ts) is tested beside its module
  without moving it into the jsdom project's `*.svelte.test.ts` pattern
  (2026-10-21).

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

- **Reaper runs headless under Xvfb and takes a ReaScript on its command
  line.** `Xvfb :99` then `reaper -cfgfile <ini> -nosplash -new
  script.lua` runs the script at startup with no display, sound card or
  license step (the evaluation build asks nothing); the script saves
  with `Main_SaveProjectEx` and quits with action 40004. Dialogs it
  raises anyway (no audio device, the MIDI import options, "create
  directory?") are answered by `xdotool windowfocus` + `key Return`;
  `windowactivate` fails because the bare display has no window
  manager. `InsertMedia(file, 1 | 4096)` places a Broadcast WAV at its
  `bext` time reference (Dawn's clips landed to the sample), and
  `GetMediaFileMetadata(source, "BWF:TimeReference")` reads the raw
  value. The MIDI import dialog's choices live in reaper.ini as
  `midiimport`, a bit set: 1 expands the file's tracks to Reaper
  tracks, 2 imports the tempo map, 4 imports the markers; a marker
  imported without the tempo map lands at its tick position read at the
  project's tempo (12.5 s became 11.75 s). `-cfgfile` keeps all of that
  in a folder of the run's own (scripts/interop/reaper.mjs,
  2026-10-21).
- **Audacity's scripting pipe (mod-script-pipe) under a virtual display**
  (scripts/interop/audacity.mjs, 2026-10-21): Ubuntu's `audacity`
  package carries the module, the AppImage 3.7.9 crashed on this VM
  (exit 255, no window) and 4.0.1 has no module. A module Audacity has
  not seen before gets status 4 ("new") in `[Module]` and is not loaded,
  whatever status the config asked for: name it in `[ModulePath]` and
  `[ModuleDateTime]` too and status 1 holds. wxWidgets puts the config
  under `XDG_CONFIG_HOME`, so a run can have its own; `[Directories]
  TempDir` keeps the autosave out of `/var/tmp`, where a killed run's
  project brings a crash-recovery dialog next time that blocks the pipe.
  A pipe response stops at 32 KB (`GetInfo: Type=Commands Format=JSON`
  never finishes; `Format=Brief` does). `Import2` of a text file shows a
  modal error that blocks the pipe until dismissed; labels come in
  through the `ImportLabels:` menu command, whose GTK dialog takes a
  path after ctrl+L. A command's answer ends with a line starting
  `BatchCommand finished`; blank lines come before it. Open the `to`
  pipe with `O_NONBLOCK` to learn whether Audacity is reading (ENXIO
  when not). `xdotool windowfocus` works without a window manager where
  `windowactivate` fails; a `pkill -f`/`pgrep -f` pattern that appears
  in the running shell's own command line kills that shell.
- **Sandyne (the free DAW) renders and inspects projects from the
  command line with no display**, on a VM with no sound card:
  `sandyne inspect file.sand` and `sandyne rendertracks file.sand
  --output-dir out --format wav` (JACK and ALSA complaints on stderr,
  harmless). Its project file is plain JSON, its Linux build a tarball
  installed by `install.sh --accept-license` into
  `~/Applications/Sandyne`. The GUI starts under Xvfb with `--no-gpu`.
  Its `--ws-control` socket speaks TLS with a self-signed certificate it
  writes to `~/.config/Sandyne/control-cert.pem`, so a plain `ws://`
  client is dropped at the handshake (2026-10-21). A `.sand` written by
  hand needs only `version`, `global` (bpm, beatsPerBar), `tracks`
  (trackId, index, type 1 sample or 0 synth with `internalInstrumentId`,
  name, volume, pan, mute, solo, contentIds) and `contents` (type 1
  sample with `sampleFilePath` relative to the project file, or type 0
  notes with `notesData` in beats from the clip; `startBeat`,
  `lengthBeats`, `contentStartOffset` in beats); `rendertracks` names
  the files `<title>_NN_<track>.wav`, 24-bit at 44.1 kHz, and starts a
  note's voice at the head of its render block, a few ms early.
- **Ardour's headless `ardour8-lua` cannot import.** Import goes through
  `Editor:do_import`, which only the GUI has; `Session.import_files`,
  `RegionFactory` and `ImportStatus` are not bound in the headless
  interpreter, and no Dummy backend is listed on Ubuntu's 8.4 package
  (`AudioEngine:start` answers −1). An Ardour check needs the GUI under
  Xvfb, driven by its own action scripts, or its session XML written by
  hand (2026-10-21).
- **Bitwig's DAWproject reference library writes a test corpus.** The
  repository ships no example projects, but `./gradlew test` (OpenJDK 21)
  writes twenty into `target/`, covering beats and seconds, offsets,
  fades, warps, controller automation, alias clips, markers and a plugin:
  the best stand-in for a real export when no DAW is at hand (2026-10-21).
- **DawVert converts DAW projects to and from DAWproject from the command
  line** (`python3 dawvert_cmd.py -i in -ot dawproject -o out`, Python
  3.12, its requirements in a `uv` venv). It reads Reaper, Ableton Live 11,
  FL Studio, LMMS and MIDI, among others, and reads DAWproject back into
  those, so it is a second opinion on a DAWproject writer (2026-10-21).

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

## `decodeAudioData` never says what rate a file was (2026-10-21)

`AudioContext.decodeAudioData` and `OfflineAudioContext.decodeAudioData` resample to the context's rate and return a buffer at that rate; nothing in the result says what the file's own rate was. So a stem uploader or an import that wants to compare a file's rate with the song's has to read the header itself: `utils/audioSampleRate.ts` reads WAV and RF64 (`fmt `), AIFF (`COMM`, an 80-bit float), FLAC (STREAMINFO's 20 bits), MP3 (the first frame header after the ID3v2 tag; the version bits halve or quarter the table), MP4 (the `mp4a`/`alac` sample entry's 16.16 rate, so 96 kHz AAC, rarer than rare, reads as 0 and comes back null) and Ogg (the Vorbis identification header; Opus is always 48 kHz). Surfaced building the sample-rate setting (docs/multitrack-recorder.md "Sample rates"). The flip side is useful: `new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes)` is a free, exact resampler to `rate`, and an `OfflineAudioContext` at the song's rate playing buffers decoded at the device's resamples them on the way (`audio/resampleBuffer.ts`, and how the Studio's offline render now comes out at the song's rate on every machine).

## vite-plus: the Vite alias in package.json moves with it (2026-10-22)

`vite-plus` pins its own Vite build through two aliases in package.json: `"vite": "npm:@voidzero-dev/vite-plus-core@<version>"` in devDependencies and again under the overrides. `bun add vite-plus@1.3.0` bumps `vite-plus` and `@voidzero-dev/vite-plus-core` but not those alias strings, and `vp build` then refuses to run ("Expected @voidzero-dev/vite-plus-core@1.3.0, but found 1.1.0 at node_modules/vite/package.json. Run `vp migrate`"). Vitest, lint and svelte-check ran fine on the mismatch, so only the build caught it. Change the two alias lines to the new version (or run `vp migrate`) and `bun install`. Then the dev server, and only the dev server, failed with SvelteKit's `vite_ssr_environment_not_runnable` ("must be a `RunnableDevEnvironment`"): `bun install` had left a second copy of the core at `node_modules/vite-plus/node_modules/vite`, so the `vp` CLI ran one Vite and SvelteKit imported another, and the `instanceof` check behind that error fails across two instances (SvelteKit's runner.js says as much). The build, Vitest, lint and svelte-check were all fine with it. `rm -rf node_modules && bun install` left one copy and the dev server came back; check `ls node_modules/vite-plus/node_modules` after any vite-plus bump. Surfaced updating the packages after Dependabot's Vitest advisory.

## TypeScript 7 is not for this stack yet (2026-10-22)

`typescript@7.0.2` on npm is the Go compiler: a `tsc` binary per platform (`@typescript/typescript-linux-x64` and sixteen siblings) and not the JavaScript API that tooling loads. With it installed, `bun run check` and `bun run lint` both died before doing anything, in Vite's config hook ("Cannot read properties of undefined (reading 'readFile')": something in SvelteKit's or vite-plugin-svelte's config resolution reaches for `ts.sys`, which is not there). The peer ranges say as much: svelte-check 4.7.7 wants `^5 || ^6`, @sveltejs/kit 3.1 `^6`; only vite-plus's core admits `^7`. Reverted to 6.0.3. Try again when svelte-check and kit declare 7 in their peers (`npm view svelte-check peerDependencies`).

## Reaper's tempo is quarter notes a minute in any time signature; the transport shows the "divided" one (2026-10-23)

From a probe (a project with `TEMPO 120 6 8` and a tempo point carrying `(8 << 16) | 6`, opened in Reaper 7.82 under Xvfb and read through the API), for Dawn's time-signature denominators (utils/rpp.ts, utils/rppRead.ts).

- **`TEMPO` and the `PT` points store the quarter-note tempo.** At 120 in 6/8, `TimeMap2_timeToQN(0, 1.5)` is 3: 120 quarter notes a minute, a 6/8 measure three of them (1.5 s; `TimeMap2_beatsToTime(0, 0, 1)` = 1.5).
- **`TimeMap2_GetDividedBpmAtTime` is 240 there**: the tempo in beats of the bottom number, which is what Reaper's transport displays ("240" for that 6/8). `TimeMap_GetTimeSigAtTime` returns 120, the stored tempo, with 6/8.
- So a DAW-style tempo (Live, Bitwig, a MIDI file and Dawn all count quarter notes) goes into an `.rpp` unscaled whatever the signature, and the `(denominator << 16) | numerator` on a point carries the bottom number.

## Drizzle `with` objects, and a chat panel that reopens itself (2026-10-25)

From the chat's mentions and reactions (docs/chat.md).

- **A Drizzle relational `with` object shared `as const` must not carry `orderBy`:** the readonly tuple does not fit drizzle's mutable array type, so the shared relation set leaves ordering to the caller (the reactions are folded in set order anyway).
- **The song page reopens the chat panel on its own after a reload** when the address carried `?open=chat` or the panel was open before, so a Playwright step that clicks "Chat" to open it closes it instead; check the dialog's visibility first.

## Remote forms in Playwright, and Fallow's view of a prop passed straight through (2026-10-25)

From the short links page (/settings/links, docs/security.md "Short links").

- **A remote form field's `as("text", …)` input renders with no `type` attribute**, so a Playwright `input[type=text]` locator misses it; locate by placeholder, label or name. The `name` of a `.for(id)` form's field carries a suffix (`slug/<hash>/setShortLinkSlug`), so match it with `name^=`.
- **Fallow reports a Svelte prop unused when its only use is as an attribute on a child component** (`<Child before={prefix} />`); deriving the value inside the child instead keeps the audit quiet.
- **`pcmCache`-style "never throws" facades hide a failed write from a `write` call's result**; see the engine entry above for the `stat` confirmation.

## A message-fed AudioWorklet voice: transfers, duplicate needs, offline timing (2026-10-25)

From building the Studio's streaming voice (static/worklets/stream-voice.js, audio/streamVoice.ts; docs/multitrack-recorder.md "Scale and structure"), proved in headless Chromium live (a voice scheduled 0.5 s ahead began on time, ended at 2.56 s against 2.552 expected, nothing starved) and offline (first non-zero sample exactly at a mid-block start frame).

- **Planes that are views of one `ArrayBuffer`** (as a cache range read returns them) must list that buffer **once** in `postMessage`'s transfer list; listing it per plane throws `DataCloneError`.
- **A voice's first blocks can run before its pre-read has all landed**, since feed messages arrive between render quanta, so the processor posts a `need` it does not need; the facade keeps one read pump and takes `want = max(want, upto)`, which makes the duplicates harmless.
- **An `OfflineAudioContext` renders far ahead of messages**, so testing a message-fed worklet offline needs `ctx.suspend(t)` checkpoints to let the feeds land before the frames they cover.
- **The cache worker's writes block range reads unless sliced:** a 160 MB write took 844 ms whole; in 8 MB slices with a `MessageChannel` yield between (a chained `setTimeout` gets throttled), reads of another file completed during it at a median of 22 ms, worst 154 ms (the final flush and move), well inside the voice's 1.5 s lead.
- **`pcmCache.write` resolves the same whether the copy was written or not** (a miss is never an error), so the engine confirms a copy with a `stat` afterwards before marking a source `onDisk`; and a buffer read back from disk says nothing about its origin, so a source held as a blob (the browser-kept song) is excluded explicitly or it would be marked on disk with no copy.
- **The singleton engine opens its context once per module**, so a test of the "worklet refused" fallback re-imports it with `vi.resetModules()`.
- **A 16-tap Kaiser-windowed sinc (β 7, cutoff 0.9 of the lower Nyquist, 512 tabulated phases)** resamples 48 to 44.1 kHz at -72 dB error at 1 kHz and -65 dB at 10 kHz, about 3 ms per second of stereo; 44.1 to 48 at 15 kHz is only -39 dB, the short kernel's roll-off.

## OPFS from a Studio page: fast in Chromium, closed in Playwright's Linux WebKit (2026-10-24)

From a spike for the Studio's disk cache of decoded sources (docs/multitrack-recorder.md "Scale and structure"; docs/dawn-daw-plan.md D8), a Playwright page on the dev server's origin writing and reading a four-minute stereo file (46 MB at 16-bit) in the Origin Private File System.

- **Chromium (headless, this VM):** a worker's `FileSystemSyncAccessHandle` wrote at 320 MB/s and read 256 KB ranges at 300 MB/s, the whole file at 785 MB/s; the main thread's `getFile().slice().arrayBuffer()` read it at 1284 MB/s and `createWritable` wrote at 277 MB/s; rebuilding a 4-minute stereo `AudioBuffer` from 16-bit PCM took 66 ms; `navigator.storage.estimate()` offered 10.7 GB. Disk reads are not the bottleneck of a cache or of a streamed voice; the budget is.
- **Playwright's WebKit on Linux cannot open OPFS:** `navigator.storage.getDirectory()` throws `UnknownError: The operation failed for an unknown transient reason`, though `estimate()` answers (1.0 GB). Safari proper has OPFS and sync access handles in dedicated workers but no `createWritable`, so a cache must write from a worker and must treat every OPFS error as a miss. Safari's real throughput and quota are measured on a device, not here.
- **Safari on a MacBook Pro (Kevin, 2026-10-24):** the cache worked (the menu item present, no warning, a reopened song fetched no `.flac`/`.wav`), and `navigator.storage.estimate()` answered a quota of 82.5 GB with five recordings (277 MB) kept, so the cache runs on its own 2 GB ceiling there. **On Kevin's iPhone the cache works in a regular tab and is refused in Private Browsing:** in a private tab the first OPFS call, `navigator.storage.getDirectory()` itself on the main thread as much as in the worker, fails with the same `UnknownError: The operation failed for an unknown transient reason` as Playwright's WebKit, the facade warns once and the song plays from the network as designed, `estimate()` answering zeros. In a regular tab the menu item appears with the five recordings (264 MB) kept and no warning, and `estimate()` answers a quota of 41.2 GB, half the Mac's; both are far past the cache's 2 GB ceiling, so storage is not the constraint on either device. The lesson: that wording is WebKit's ephemeral session refusing storage, not a device limit; a cache must treat it as a miss (it does), and a streamed voice over the disk copies still needs a Blob-range path for private tabs. Safari's tracking prevention also deletes a site's script-written storage, OPFS included, after seven days of Safari use without a visit (Home Screen web apps exempt), harmless for a cache.
- **Playwright's Linux WebKit cannot play audio either:** its `AudioContext` reports `running` but `currentTime` advanced 0.075 s in 2.5 s of the Dawn demo playing (no output device), so a playback spec cannot run there; an `OfflineAudioContext` renders fine (used to prove that `copyToChannel` from a Float32 view with a 20-byte offset, as the cache's files are read, and a `start(at, offset, duration)` into a context at another rate both render in WebKit). Chromium plays a song from the cache after a reload: position advancing, a two-second offline render with signal, no Blob fetch.

## Reaper's take volume envelope runs in take time, from a rendered probe (2026-10-24)

From `bun run interop:rpp` (scripts/interop/rpp.ts and rpp.lua): Reaper 7.82 opening an item at play rate 0.8 whose take carries a `<VOLENV` (after the take's `<SOURCE`, before the next `TAKE`), read through `GetTakeEnvelopeByName(take, "Volume")` and rendered with the envelope on and switched off (`ACT 0` through `SetEnvelopeStateChunk`), the ratio of the two renders being the envelope as Reaper plays it; for Dawn's clip gain envelopes (utils/rpp.ts, utils/rppRead.ts).

- **A point's position is take time from the item's start, not item seconds**: it plays at position ÷ play rate. A step written at 1.2 played at 1.505 s into the item (1.5 = 1.2 ÷ 0.8 wanted), so a content second `t` of a clip at offset `o` goes out as `(t − o) × rate`, as a stretch marker's position does. The start offset does not shift it: 0 is the item's start whatever `SOFFS` is.
- **The value is plain amplitude** (1 is 0 dB): a point of 0.25 rendered at 0.250 of the unenveloped level. `GetEnvelopePoint` returns the positions and values as written, shape 0 linear.
- **The master's envelope silences a solo render too**: to render past the master's own volume envelope, switch it off through its chunk and restore the chunk after.

## Reaper's play rate, start offset and stretch markers, from a probe (2026-10-23)

From `bun run interop:rpp` opening Dawn's project in Reaper 7.82 and reading the items back through the API (`GetMediaItemTakeInfo_Value`, `GetTakeStretchMarker`), for Dawn's clip warps (utils/rpp.ts, utils/rppRead.ts).

- **`PLAYRATE <rate> <preserve pitch> …` on a take is the rate the source plays at**: 0.8 plays a file over 1.25 times its length; the second field 1 keeps the pitch (`B_PPITCH`). The item's `LENGTH` stays in project seconds.
- **`SOFFS` (`D_STARTOFFS`) is in the source's own seconds, whatever the play rate**: a clip starting 1.25 s into content at rate 0.8 starts 1.0 s into the file.
- **`SM <position> <source position>` lines on a take are stretch markers**, read back as written by `GetTakeStretchMarker`: the position in take time (seconds from the item's start at play rate 1; the API documents take time as the item position times the play rate), the source position in the file's seconds. Dawn writes an uneven warp as markers over a plain item at rate 1, and reads markers with their positions divided by the rate.

## Reaper's tempo ramps are linear in seconds, and a time signature on a point starts a measure (2026-10-23)

From a probe project opened in Reaper 7.82 under Xvfb and asked through its API (`TimeMap2_GetDividedBpmAtTime`, `TimeMap2_timeToQN`, `GetTempoTimeSigMarker`), for Dawn's tempo ramps (utils/rpp.ts, utils/rppRead.ts, audio/measures.ts).

- **A `TEMPOENVEX` point with shape 0 ramps the tempo linearly with the seconds to the next point**: 120 at 0 s ramping to 60 at 8 s gave 90 bpm at 4 s and twelve quarter notes at 8 s (the mean tempo times the span), where a ramp linear over the beats (a DAWproject's or Live's lane) would give 84.85 and 11.54. Dawn keeps a Reaper ramp on a "time" curve and a DAWproject's or Live's on a "beats" curve, and a writer lays a ramp of the other curve down bar by bar.
- **A point carrying a time signature starts a new measure, and Reaper pads the partial bar before it**: with 3/4 from 8 s and a point at 20 s (16 beats later, a third of a bar into bar 10) stamped 3/4, Reaper counted 34 quarter notes at 20 s instead of 32 and put the marker at measure 10; the same point with no time signature (`PT 20 60 1 0 0 0`, the marker reading -1/-1) counted 32. Dawn's writer now stamps the signature only on the first point and where the meter changes, as Reaper's own `(denominator << 16) | numerator` with the "0 1" flag after it.
- **`TimeMap2_timeToBeats` returns beats within the measure, the measure, its length, then the full beat count, then the denominator**; `TimeMap2_timeToQN` is the plain quarter-note count and the one to compare across meters.

## Reaper's mute, send and master envelopes, from a rendered probe (2026-10-22)

From a probe project rendered by Reaper 7.82 under Xvfb (a sine item with a `<MUTEENV`, a receive with an `<AUXVOLENV`, a `<MASTERVOLENV`), for the wider automation (utils/rpp.ts, utils/rppRead.ts).

- **A mute envelope's 0 is muted, 1 is on.** The render was silent where the envelope sat at 0 and sounded where it sat at 1, so Dawn's mute lane (1 muted) goes out inverted, with shape 1 (square) on every point and `DEFSHAPE 1`, and comes back the same way.
- **A send's envelopes live on the receiving track, right after the `AUXRECV` line they belong to**: Reaper read an `<AUXVOLENV` placed there (the send was silent until its point), and when asked through the API (`GetTrackSendInfo_Value(track, -1, i, "P_ENV:<PANENV")`) it saved the new `<AUXPANENV` in the same place. The reader walks a track's body in order and gives each `AUXRECV` the `AUXVOLENV` block that follows it.
- **The master's envelopes are project-level blocks after `MASTER_VOLUME`** (`<MASTERVOLENV`, kin to `<MASTERPLAYSPEEDENV` in the corpus): the render came out at a quarter where its point said 0.25, and the interop's mix render went silent where the envelope reached 0. `GetTrackEnvelopeByName(master, "Volume")` found nothing, so the interop probe reads the master's envelopes by chunk name (`GetTrackEnvelope` + `GetEnvelopeStateChunk`). **The master has no mute envelope**: a `<MASTERMUTEENV` block written by hand was dropped when Reaper saved the project (its master carries volume, pan, width and play rate envelopes only), so Dawn's master mute lane is not written to a Reaper project.
- **Reaper renders from a script with `GetSetProjectInfo(0, "RENDER_*")` and `Main_OnCommand(42230, 0)`**: `RENDER_BOUNDSFLAG` 1 (the whole project), `RENDER_FILE` a folder, `RENDER_PATTERN` the name, `RENDER_FORMAT` a base64 config (`ZXZhdyAQAAAA`: WAV, 32-bit float); the render answered its "Error opening devices" and query dialogs through xdotool as the interop runner does.

## Bitwig's DAWproject expression lanes sit where the schema allows one child (2026-10-22)

From writing the clip expression lanes (utils/dawproject.ts, docs/dawproject-plan.md item 3).

- **Bitwig writes a notes clip's controller lanes as `<Points>` beside the `<Notes>` inside the `<Clip>`**, each with a `<Target expression="channelController" channel="0" controller="7"/>` and `RealPoint`s in the clip's content time. The schema's `clip` type holds a single `xs:choice` child (`minOccurs="0"`, no `maxOccurs`), so Bitwig's own export does not validate against Bitwig's own `Project.xsd`; a `<Lanes>` wrapper would, but nothing in the wild writes that. Dawn writes the lanes the way Bitwig does and skips the schema check in that one test (`dawproject.test.ts`), keeping it on the rest of the writer.
- **An audio clip's gain line goes the same way** (2026-10-24, utils/dawproject.ts): `<Points unit="linear">` on `<Target expression="gain"/>` beside the `<Audio>`/`<Warps>`, in the clip's content seconds; `xmllint` rejects it ("Element 'Points': This element is not expected") and accepts the same points wrapped in `<Lanes>`, which the reader also takes. The schema and the round trip are the only proof: no DAW here imports DAWproject.
- **The plan had it wrong that the piano took pitch bend and modulation from a clip.** `PianoEngine.#onMidi` moved the wah with CC 1/11/4 and the pedal with CC 64, but nothing bent a voice: `SynthVoice` and `SampledVoice` had no way to change pitch after the start. The bend went in as `bend?(semitones, at)` on both (detune on the oscillators, `playbackRate` on the sample sources, `setTargetAtTime` for a 5 ms glide), and a voice started while a bend is in force starts bent.
- **Reaper's `E` lines carry any channel message**, so controllers (`b0 cc vv`), the bend (`e0 lsb msb`) and channel pressure (`d0 vv`) go in beside the notes with no other change; the sort order within a tick is Dawn's own (offs, then controls, then ons, then the all-notes-off), so a pedal change at a note's start precedes the note.

## Ableton Live's set format, from public sets and DawVert (2026-10-22)

From reading nine public `.als` files (Live 9.7 to 12.2.1) and DawVert's `plugins/input/r_ableton.py` and `objects/file_proj/_ableton/*` for `utils/alsRead.ts`; nothing checked in Live itself (there is no Linux Live):

- **A set is gzipped XML** (`1f 8b`), every value a `<Tag Value="…"/>` child; a few repos keep sets uncompressed, and Live reads those too. Live 12 renamed `MasterTrack` to `MainTrack` and Live 10 `ColorIndex` to `Color`; the rest of what the reader needs is stable from Live 9 to 12.
- **Times are beats.** A clip's `CurrentStart`/`CurrentEnd` are song beats (the `Time` attribute repeats the start); `Loop/LoopStart`, `LoopEnd` and `StartRelative` are the clip's content beats for a warped audio clip or a MIDI clip, and **seconds into the file for an unwarped audio clip** (DawVert multiplies them out through the tempo; the sets confirm it: an unwarped clip of 64 beats had `LoopEnd` 31.3 with a 31.3-second file). `HiddenLoopStart`/`HiddenLoopEnd` are the loop brace as last shown, not what plays. A locator's `Time` is beats. Automation events' `Time` is beats, and the event at `-63072000` (two years before the song) is the parameter's value before any point.
- **The time signature is an enum**: numerator = value mod 99 + 1, denominator = 2 to the power of (value div 99), so 201 is 4/4, 200 is 3/4, 302 is 7/8. It sits in the master's `TimeSignature` and its changes in the master's `AutomationEnvelopes` as `EnumEvent`s whose `PointeeId` is the `TimeSignature/AutomationTarget` id (10 in every set seen; the tempo's is 8). Tempo automation is `FloatEvent`s on the `Tempo` target, and Live ramps between points.
- **Warp markers** are `SecTime` (seconds into the file) by `BeatTime` (content beats); Live writes a last marker a thirty-second note past the real last one so the slope carries on. A set's loops from a 120 bpm pack in a 124 bpm set show it: `LoopEnd` 16 beats, markers 0→0 and 8.000023 s→16 beats, so the file plays 3 % fast in Live.
- **Levels**: `Mixer/Volume/Manual` is linear gain with 1 at 0 dB and 1.99526 (+6 dB) the top; a send at 0.000316 (−70 dB) is off; `Speaker/Manual` false is the mute (there is no mute tag). `Pan/Manual` is −1 to 1. `SampleVolume` on a clip is its gain, `Fades/FadeInLength` and `FadeOutLength` beats; `PitchCoarse` semitones and `PitchFine` cents transpose a clip.
- **Routing**: `TrackGroupId` names the `GroupTrack` a track sits in (−1 for none); `AudioOutputRouting/UpperDisplayString` says "Group", "Master" or "Main". `Mixer/Sends/TrackSendHolder` are in the order of the `ReturnTrack`s. A `MidiNoteEvent` has `Time` and `Duration` in content beats, `Velocity` 0 to 127 as a float, `IsEnabled`; the notes sit under `Notes/KeyTracks/KeyTrack`, each with its `MidiKey`. The arrangement's clips are `MainSequencer/Sample/ArrangerAutomation/Events/AudioClip` on an audio track and `MainSequencer/ClipTimeable/ArrangerAutomation/Events/MidiClip` on a MIDI track; the session view's are under `ClipSlotList`.
- **Colors** are an index into Live's palette of 70 (constants/liveColors.ts, DawVert's `ableton.dset`), five rows of fourteen from bright to dark, with white, grays and black among them.
- **Sample paths**: `SampleRef/FileRef/RelativePath` is relative to the project folder (and starts with `../` when the file lives outside it, as a `Downloads/` file does) with `Path` the absolute one; Live 9 writes the relative path as `RelativePathElement` parts plus `Name`. The set carries no audio.

## Reaper's project format, as Reaper 7.82 reads it (2026-10-22)

From writing `.rpp` files and having Reaper open them under Xvfb (`bun run interop:rpp`, scripts/interop/rpp.ts and rpp.lua), with its API as the witness:

- **The time signature on a tempo point counts only with the flag after it.** A `<TEMPOENVEX` point is `PT <seconds> <bpm> <shape> <sig> <sel> <flag>`, `sig` being `(denominator << 16) | numerator`; written as `PT 8 100 1 262147` alone, Reaper kept the line as it was but reported the point's time signature as −1/−1, and wrote 4/4 bars on. With ` 0 1` after the sig (as Reaper's own files carry) it took 3/4. `utils/rpp.ts` writes the flag; `utils/rppRead.ts` honors the sig only with it, as Reaper does.
- **The pan envelope is stored the other way up from the pan knob.** A `<PANENV2` point of −0.6 pans the track to the right (+0.6 in `D_PAN` terms): the harness renders the track with the envelope driving it in read mode and the right channel comes out louder. `GetTrackUIVolPan` does not tell: it returns the knob even in read mode. The writer negates the lane's values, the reader negates them back; the volume envelope (`<VOLENV2`) is plain linear gain.
- **A MIDI take's ticks go through the project's tempo map** (`HASDATA 1 <ppq> QN`; each `E`/`e` line and each `<X` block advances the clock) unless `IGNTEMPO 1 <bpm>` holds it to its own tempo; the item's `POSITION` is seconds. Notes written as ticks from the item's start through Dawn's grid land where Dawn had them across a tempo change.
- **An item's `VOLPAN` first field is the item's volume** (`D_VOL`), not the take's; the take's own volume is a separate value Reaper reports as 1 when the file carries only the item's.
- **Folders:** `ISBUS 1 1` on the folder track, `ISBUS 2 -1` on its last child (−n closes n levels); `MAINSEND 1 0` on every track still; a receive is `AUXRECV <source track index> <mode> <volume> …` on the receiving track, mode 0 post-fader and 3 pre-fader (post-FX), which Reaper reports as `I_SENDMODE` 0 and 3.
- **Colors** are `PEAKCOL 0x1000000 | (b << 16) | (g << 8) | r` on Linux (and Windows); Reaper's `ColorFromNative` gave the RGB back as written. (macOS keeps RGB the other way round; a file moved between platforms shows its colors swapped, a known Reaper quirk not handled here.)
- **GUIDs are optional:** a `<TRACK` or `<ITEM` without `TRACKID`, `IGUID` or `GUID` lines opens fine; Reaper assigns them and writes them on save.
- **`Main_openProject("noprompt:" .. path)`** opens without the save-changes prompt; **`Main_OnCommand(42230, 0)`** renders with the current settings and closes the dialog, the settings set through `GetSetProjectInfo` (`RENDER_BOUNDSFLAG` 0 with `RENDER_STARTPOS`/`RENDER_ENDPOS`, `RENDER_FILE` and `RENDER_PATTERN` through the `_String` form, `RENDER_FORMAT` `ZXZhdxgAAQ==` for 24-bit WAV); **`GetSetProjectNotes(0, false, "")`** returns the notes as its one value; **`GetTrackUIVolPan`** returns (ok, volume, pan).
