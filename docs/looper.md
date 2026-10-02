# Looper

Planned and built (phase 1) 2026-10-01 at Kevin's request: "a standalone
tool much like the idea recorder, where you can input microphone, as well
as piano and drums. I think it would be analog in the first phase and we
can look at midi as an upgrade later, or even combination analog / midi.
A lot of the foundation of what we would need is already built especially
after the multitrack ability." Phase 1 lives on the `looper` branch until
Kevin merges it; phase 2 (MIDI layers) is not built.

## What it is

A loop station at `/looper`, the user's own page like the Idea Recorder:
a loop of a fixed length (bars at a tempo) plays round and round while
layers are recorded onto it one pass at a time, from the microphone, the
piano or the drum machine. Phase 1 layers are audio; a layer can be
muted, soloed, levelled or thrown away; the loop can be saved as an
idea's take (the mix) with the layers as its sources, so it reaches a song
as stems through what multitrack takes already built. Phase 2 adds MIDI
layers for the piano and the drums.

## What exists already (docs/demo-recording.md)

- **Sources as streams.** `piano.captureStream()` and
  `drumMachine.captureStream()` give each instrument's output as a
  MediaStream; the recorder's `instruments()` gathers them at a gesture;
  the microphone comes from `getUserMedia` with the voice processors off.
- **Per-source recording and saving.** Multitrack takes record a file per
  source, the queue uploads them with the take, `recording_stem` rows hold
  them, `copyRecordingStemsToSong` makes them a song's stems.
- **Clocks.** The metronome and the drum machine schedule on a Web Audio
  clock through `startLookahead` (`src/lib/audio/lookahead.ts`); the drum
  machine keeps `#nextTime`/`#nextStep` and swing/humanize per step.
- **Panels, meters, the space bar.** `FloatingPanel` hosts the drums, the
  piano and the metronome on the recorder page; `spaceOwner` settles the
  space bar; `RecorderWave` draws a take; the per-instrument meters and
  the microphone mute exist.
- **Formats.** WAV is an accepted take and stem format
  (`DEMO_FORMATS` spreads `STEM_FORMATS`), so a layer encoded as PCM WAV in
  the browser needs no codec.

## Architecture

### One audio context

Each engine opens its own `AudioContext` today (`piano.#graph`,
`drumMachine.#ensureGraph`, `metronome`), and the recorder mixes their
MediaStreams in a context of its own. A looper must overdub against
playback with sample accuracy, and a MediaStream hop between contexts
adds a buffer of latency that differs by browser. So the looper **hosts**
the instruments: a `hostContext(ctx)` option on the piano and the drum
machine (and the metronome) that builds their graph in a given context
instead of making one (`createDrumBus(ctx, …)` already takes a context;
the piano's `createPianoFx(ctx, …)` too). The looper's engine owns the
context; the instruments' masters connect to the looper's record tap and
to the destination as now. The microphone is the one source that comes
from outside (a `MediaStreamSource` of the `getUserMedia` stream), and
the one that needs latency compensation.

### The engine: `src/lib/audio/looper.svelte.ts`

State (runes, as the other engines): `bpm`, `beatsPerBar` (4 or 3),
`bars` (1, 2, 4, 8), `countIn` (0 or 1 bar), `click` (count-in only, or
always), `phase` (`idle | counting | playing | recording`), `position`
(the loop's bar and beat for the display), `layers`, `armed` source,
`inputLatencyMs`, `volume`. The loop's length in samples is
`round(bars × beatsPerBar × 60 / bpm × sampleRate)`; the tempo and bars
lock once the first layer exists (a change clears the loop, with a
confirm; a later phase can time-stretch).

**Playback.** Each layer is an `AudioBuffer` of exactly the loop length;
each has an `AudioBufferSourceNode` with `loop = true` through a
`GainNode` (level, mute, solo) into a master. All sources start at one
`loopStart` context time; the loop's phase at any moment is
`(ctx.currentTime − loopStart) mod loopSeconds`. Adding a layer starts its
source at `loopStart + k × loopSeconds` for the next cycle boundary, or
at once with an `offset` of the current phase, so it joins without
waiting. Stopping stops every source; play starts them together again.

**Recording a layer: a worklet.** `static/worklets/loop-capture.js`, an
`AudioWorkletProcessor` loaded with `ctx.audioWorklet.addModule` (a plain
JS file served statically, which the adapter packs as an asset). It takes
the armed source's signal (stereo), and on a `start` message with the
context frame of the loop's next bar 1 it copies samples into a
`Float32Array` of the loop length from that frame, wrapping while
recording continues (overdub adds to what is there; the processor keeps
one buffer per pass and posts it back on `stop` as a transferable), so the
seam is sample-accurate and the layer is the loop length by construction.
Recording stops at the end of the pass in which Stop was pressed (or
Record again), never mid-bar, unless the user chooses "cut now".
`currentFrame` in the processor and `ctx.currentTime × sampleRate` on the
main thread are the same clock, so the start frame needs no estimate.

**Output latency and the piano.** The software path from a key press to
the note in the graph measured 0.6 ms (event to `noteOn`) plus 0.4 ms
(`noteOn` to sound in the capture), so what a player feels between the
key and the sound is the audio device's output latency, which the browser
reports (`baseLatency` + `outputLatency`: 10–30 ms on a built-in output,
150 ms and more over Bluetooth; Kevin noticed it on the electric piano
and "from the beginning on all voices"). The settings show the reported
figure. A piano layer played by hand is timed against the loop as heard,
that much late, so piano layers are shifted earlier by it ("Shift piano
layers by the output latency", on by default; `compensatePiano`); the
drum machine's beat runs on the clock and needs none; the microphone's
shift is the measured round trip, which includes it.

**Microphone latency.** A sung layer arrives late by the input and output
latency of the device (`ctx.baseLatency + ctx.outputLatency` is a guide,
10–60 ms in practice, more with Bluetooth). The engine shifts a microphone
layer left by `inputLatencyMs` (the samples before bar 1 that the worklet
captured anyway, so the shift costs nothing). The setting starts from the
context's reported latency and can be measured once: **Calibrate** plays
three clicks through the speakers and records the microphone, finds the
clicks by cross-correlation (`src/lib/utils/findLatency.ts`, pure, tested
with a synthetic impulse) and stores the result per browser
(`stemshovel.looper.latency-ms`), with a nudge slider for headphones vs
speakers. Instrument layers need none: they are rendered in the same
context.

**Monitoring.** The microphone is heard through the master only when
"Monitor mic" is on (off by default; a laptop's speakers would feed back).
The instruments are heard as always.

**Count-in and click.** The metronome engine, hosted in the same context,
clicks the count-in bar before the first pass and, if the click is on,
through the loop; once a drum layer exists most users switch it off.

**Transport claims.** `claimPlayback(looper)` so the song player, the drum
machine on another page and the looper never play together; inside the
looper the drum machine is a source, started by the looper (below).

**The drum machine as a source.** Phase 1: the drum machine plays its
pattern on its own clock, hosted in the looper's context, and the looper
records its audio like any source; to keep bar 1 aligned the looper starts
it with `drumMachine.startAt(time)` (a small addition: `start()` with a
given `#nextTime` instead of `currentTime + 0.05`) at the loop's next bar
1, and sets its tempo to the loop's. The drum machine's own swing and
humanize apply; the recorded layer is what was heard. Phase 2 can replace
this with a MIDI layer.

**Rendering and saving.** "Save as take" renders the loop offline
(`OfflineAudioContext`, the layers mixed with their levels, one pass or N
repeats, the user's choice), encodes it as 24-bit PCM WAV
(`src/lib/utils/encodeWav.ts`, pure, tested), and each layer the same way
as the take's sources with their labels ("Microphone", "Piano", "Drums",
numbered when a source repeats), then enqueues through `TakeQueue` with
`stems`, exactly as a multitrack take: an idea is made (or the current
one used), the take uploads, the sources follow, **Add N stems to song…**
works unchanged. The loop's settings (tempo, bars, layer levels and
sources) go on the idea's `instruments` JSON as `looper`
(`IdeaInstrumentsDataSchema` gains an optional `looper` object; no
migration, the column is JSON), so the recorder shows them and a later
phase can reopen a loop from its sources.

### The page: `src/routes/looper/+page.svelte` and `+page.server.ts`

User-owned like the recorder (`requireSignedIn`, current account for the
idea and the beats, `redirect("/accounts")` without one); the layout by
container queries (Kevin's rule), root `@container`:

- **Transport strip** (top): Play/Stop, Record (arms the chosen source;
  pressing it while recording ends the layer at the pass's end), the
  source picker (Microphone · Piano · Drums, with the mute and a level
  meter each as the recorder has), tempo (slider and tap), bars, count-in,
  click, Undo last layer, Clear loop, Save as take, and the loop position
  (bar.beat and a ring that fills each pass).
- **Layers panel**: a row per layer with its label, its waveform
  (`RecorderWave`'s take strip at the loop length, with the playhead), a
  level slider, mute, solo, delete; drag order later.
- **Instruments**: the drum machine and the piano in `FloatingPanel`s from
  lg, docked under the transport below, the piano with its presets, the
  space bar by `spaceOwner`; the metronome's panel for the click settings.
- **Phone**: the transport full width, the layers under it, the
  instruments docked, as the recorder does.
- A **Learn more** doc-link button and a user doc `scripts/user-docs/looper.md`;
  a home page demo later, not in phase 1.

### Not in phase 1

Time-stretching after a tempo change, punch-in on a bar range, per-layer
effects (the instruments' own effects are in their sound), reopening a
saved loop for more layers (phase 1.5 from the take's sources), sharing
loops, MIDI layers (phase 2).

## Signed out, and kept in the browser (2026-10-02)

Kevin: "non-logged in users should be able to use it, though their loops
would only be saved to localStorage and not permanently." The page no
longer requires sign-in: `+page.server.ts` returns `account: null` for a
visitor (or a member of no editing account), the panels take a null
account as the drum machine page's do, and the Save menu shows a sign-in
prompt in place of the form (saving a take needs an account and its
storage). The loop itself is kept in the browser for everyone, signed in
or not, in IndexedDB rather than localStorage (a layer is a few megabytes
of samples; localStorage holds about five): `src/lib/audio/loopStore.ts`,
its own database beside the recorder's pending takes, one record with the
tempo, bars, beats and the layers' channels as Float32Arrays. The engine
writes it 400 ms after any change to the layers or the settings and reads
it back in `open()` (the first gesture), so a reload, a sign-in or a visit
days later shows the loop with "back from last time" on the screen. The
Tools menu and the footer list the looper for everyone.

## Indexable (2026-10-02)

The looper is on the sitemap, in `isIndexablePath`, in robots.txt and in
vercel.json's X-Robots-Tag rule, with a title and a meta description like
the drum machine page's. The piano was in the sitemap but in none of the
other three, which would have had search engines fetch a page whose
response said noindex; it is in all four now.

## Phase 2: MIDI layers

A piano or drum layer kept as events (note on/off with velocity at loop
frame; drum hits by voice) instead of audio, replayed through the hosted
engines each pass: quantisable to the grid, editable, re-voiced with
another sound or kit, and a few kilobytes. The piano's `noteOn/noteOff`
and the drum machine's `hitNote`/`#record` already produce the events;
the looper intercepts them while recording a MIDI layer and schedules
them with the look-ahead loop on playback. A layer can be both at once
(audio of what was heard, MIDI of what was played), which Kevin called a
combination; saving renders MIDI layers to audio for the take and keeps
the events on the idea.

## What shipped (phase 1, on the `looper` branch)

- `src/lib/audio/looper.svelte.ts`, the engine as designed: `open()` hosts
  the piano, the drum machine and the metronome in its context
  (`hostContext` on each; `output()` builds and hands back the master to
  tap; `startAt` on the drum machine and the metronome; hosted, they do
  not claim playback, and the piano's power switch only mutes), loads the
  worklet, taps each source through a gain (only the armed one open) with
  an analyser for its meter; `requestMic` with the voice processors off
  and a monitor gain; `play`/`stop`/`record`/`finishRecording`/
  `cancelRecording`; layers as looped `AudioBufferSourceNode`s started on
  one clock; undo, remove, clear, level, mute, solo; `calibrate`;
  `renderMix`; `wavOf`; `settings()`; `clock()`, `probeClock()`,
  `probeCapture()` and the drum machine's `startedAt` as diagnostics.
- `static/worklets/loop-capture.js`: `arm` {length, lead, startFrame,
  passes}; one buffer per pass covering a lead-in before its bar 1, the
  pass and a tail of `lead` frames past its end (consecutive passes
  overlap, so up to two buffers fill at once), posted once the tail is in;
  `finish` lets the pass under way complete (pressed before bar 1 the
  first pass is still taken), `cut` posts it as it stands, `ping` answers
  the frame. A lead-in that began before the arm arrived stays silent, so
  index `lead` is still bar 1. The tail is what a latency shift needs: a
  late source is moved earlier by reading the layer from index `lead` +
  shift, into the tail (the first version read from `lead` − shift, into
  the lead-in, which moved the layer later; the measurement caught it).
- `src/lib/utils/encodeWav24.ts` (the existing `encodeWav` is the
  recorder's 16-bit download) and `findLatency.ts`, with tests.
- `src/routes/looper/+page.svelte` and `+page.server.ts`: user-owned like
  the recorder; skinned as a device like the drum machine and the piano
  (2026-10-02, Kevin: `device-chrome` chassis, `device-screen` with the
  position, status and progress, labelled `device-button-*` groups,
  container-query rows with the root a `@container`), the settings in
  three menus on the device (`ContextMenu` with snippet blocks, the
  piano's effects-menu idiom): **Timing** (a metronome icon; tempo and
  Tap, bars, beats, count-in, click), **Mic** (monitor, microphone latency and Calibrate,
  the reported output latency and the piano shift) and **Save** (title,
  passes, Save as take, upload status); transport, source picker with
  meters, layers as device rows with waveforms, levels, mute, solo,
  delete, undo, clear; the "SS Loop 001" badge; the page's title, intro
  and the tips under the device from its copy doc (docs/page-copy.md);
  choosing Piano or Drums as the source opens that instrument's panel;
  the Save menu's Stereo or Multitrack choice (multitrack by default); the loop's settings with a Tap tempo button (Kevin: "a tap tempo control right in
  the looper"; `looper.tap()` is the metronome's `tapTempo` over the last
  eight taps, fixed while the loop has layers); the tempo synced both
  ways with the drum machine and the metronome (Kevin): `looper.setBpm`
  pushes through `syncTempo()`, and a page effect pulls the drum machine's
  tempo (slider, tap, preset, generated beat) into an unlocked loop and
  holds the drum machine to a locked loop's tempo; recording the drums
  (re)starts the beat on bar 1 whatever it was doing, so a beat auditioned
  from the panel joins in step (Kevin: "we need a sync to start the drum
  machine on record or at the end of the count in"); microphone monitor, latency slider and Calibrate; Save as take
  through `TakeQueue` with the layers as sources and the loop's settings on
  the idea (`IdeaInstrumentsDataSchema.looper`, `LooperSettingsSchema`, no
  migration); the instrument panels as on the recorder page; a dev-only
  `window.__looper` for measurements. Tools menu, footer, smoke row and
  the user doc `scripts/user-docs/looper.md` (seeded on dev and staging;
  production needs `bun run db:seed-docs`).

**Verified** on dev with headless Chromium (`.screenshots/looper*.mjs`):
a drums layer is exactly the loop length (88,200 frames for 1 bar at 120
bpm, 44.1 kHz); the drum machine's first step is scheduled on bar 1 to
the sample; an impulse scheduled 0.5 s into a capture lands at 0.0 ms,
so scheduling and capture share the clock; a synth note played at a
known clock time lands at its expected position to the millisecond; the
drum hits sit on the sixteenth grid within the humanize scatter (±2 ms,
with a few larger readings from the onset detector on soft hits). The
first measurements were off by a constant that changed with the start
lead (+46, +24, −50, 0 ms for 0.1, 0.2, 0.25, 0.5 s): the capture's
0.3 s lead-in started before bar 1, and with the loop starting only 0.1 s
ahead that start was already in the past, so the worklet began late and
every index was off by the elapsed time. The fix is the padding above,
plus a cold start without a count-in waiting `LEAD_SECONDS` + 0.05 before
bar 1. Also found and fixed on the way: hosting reset the drum kit's
ready flag, so the first drums layer would decode the kit after bar 1
(`readyKit()` runs before the bar is chosen); and a start whose moment
has passed now joins on the next step of the grid instead of starting
late. The end-to-end flow (drums passes and a microphone pass as layers,
saved as a take with the sources listed in the recorder) also passed.
With the pass buffers carrying a tail, a piano layer recorded with the
reported 40 ms output latency lands 41.6 ms earlier than the raw note
(the compensation, in the right direction), and the drums stay on the
grid at the exact loop length. Not yet verified on a real device: the microphone
calibration (headless Chromium has no speaker-to-microphone path) and
Safari's worklet.

## Steps

1. **Hosted contexts** (half a day): `hostContext` on the piano, the drum
   machine and the metronome; `drumMachine.startAt(time)`; the engines
   unchanged on their own pages. Unit test: the graph builds in an
   `OfflineAudioContext` and renders.
2. **Engine and worklet** (a day): `looper.svelte.ts`, the capture
   worklet, layers playback, overdub, undo, levels; `findLatency` and
   `encodeWav` with tests. Offline verification: record a known tone as a
   layer and measure the seam (no click at the wrap) and the alignment
   between two layers (cross-correlation under one sample).
3. **Page** (a day): transport, layers panel, source picker with meters,
   calibration dialog, the instrument panels, container-query layout,
   phone pass; Playwright with the fake microphone at desktop and phone
   widths.
4. **Saving** (half a day): offline render, WAV encode, enqueue with
   sources, the `looper` settings on the idea; verify a saved loop lists in
   the recorder with its sources and goes to a song as stems.
5. **Docs, nav, release** (half a day): Tools menu and footer entries,
   `docs/looper.md` updated to what shipped, user doc, smoke rows, the
   home page tools tab later.

About three and a half days for phase 1; MIDI layers two more.

## Risks

- **Worklet on iOS Safari**: supported since 14.5; the module must load
  from a gesture and the context warmed as the piano does. A fallback
  (ScriptProcessor) is not worth building; the page says what it needs.
- **Latency calibration** is the make-or-break for sung layers; the
  measured value plus a nudge is how pedals do it, and the instruments
  avoid the problem entirely by being hosted.
- **Hosting changes the engines.** The option must leave the piano and
  drum machine pages and the recorder's multitrack path exactly as they
  are; the recorder keeps mixing MediaStreams (its latency does not
  matter there).
- **Memory**: a stereo layer at 48 kHz is 384 KB per second; eight bars
  at 120 bpm is 16 s, 6 MB per layer, a dozen layers under 100 MB; a
  phone is fine up to that, and the layer count can be capped at 16.
