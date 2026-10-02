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

**Record as a toggle (2026-10-02).** The first version swapped the Record
button for "Finish layer" and "Cancel" while recording, which Kevin read
as a button that did nothing (its effect only arrives at the pass's end).
Record is now one lit button (`aria-pressed`, a red ring) that starts a
layer, and pressed again lets the pass under way be the last
(`toggleRecord`, `finishing` on the screen as "· the last"); Stop halts the
loop and drops a pass still recording, as its title says.

## Export and Load (2026-10-02)

Kevin: "besides saving loops as multitrack recordings to the idea
recorder (perhaps better labelled as 'export'), we should be able to save
and load loops in the looper itself." The Save menu is **Export** (an
export icon; "Export as take"), and a **Load** menu lists the loops the
user exported, newest first, with their layer count, length and tempo:
`listUserLoops(userId)` finds the user's ideas whose `instruments` JSON
holds a `looper` block (a LIKE on the column; each export makes an idea
of its own, so a loop is its first take) with the take's ready sources.
Loading calls the `loopSources` query (`src/lib/remote/looper.remote.ts`,
the caller's own take) for the sources' presented URLs and the loop's
settings, and `looper.loadFrom()` stops the loop, clears the layers (the
page asks first when there are any), sets the tempo, bars and beats,
fetches and decodes each source in the looper's context and makes it a
layer with its label and, by position, its level and mute from the
settings; the result goes to the browser's store too. So a member's
permanent loop library is the Idea Recorder itself (the takes with
sources, which also go to songs as stems), with no new table; a visitor
has the one loop the browser keeps. Verified on dev: a one-bar drums loop
at 132 bpm exported, the loop cleared and retuned to 80 bpm, then loaded
back with its layer, tempo and bars (80,182 frames, one bar at 132 bpm).

## Save and Export, notes, panels (2026-10-02)

Kevin: exporting a loop to save it would not make sense to users; a Save
button should just save, loops must be told apart from ideas recorded in
the recorder, and Export should be the explicit step that puts a loop in
the ideas list. One datapoint does both: **`idea.kind`** ("idea" |
"loop", migration 0065, default "idea"; `IDEA_KINDS` in IdeaSchema).
**Save** stores the loop as a take with its layers as sources under an
idea of kind "loop", made by the page's queue (`createIdea` takes `kind`),
with no dialog: the Loop name field or "Loop · date · tempo" names it.
After the first save the loop has an identity (`savedId`,
`savedRecordingId`, `title`, `inRecorder`, `dirty` on the engine, kept in
the browser's store with the layers), and a later Save updates it in
place: the idea is renamed if the name changed, the new take uploads
under the same idea, and the previous take is deleted once the new one is
in (`replacing`; the order matters, an idea without takes and notes is
swept). **Save as new loop** detaches first. **Export to the Idea
Recorder** sets the idea's kind to "idea" (`setIdeaKind`), saving first
when the loop is unsaved or changed; the looper's Load menu lists loops of
either kind, since it looks for the looper settings on the idea, and the
Idea Recorder lists kind "idea" by default with a **Show loops** switch
(remembered per browser) that reveals loops with a loop icon. The Stereo
or Multitrack choice of the first version is gone: a saved loop needs its
layers to load again, so the layers always go with it.

**Notes.** A saved loop is an idea, so its notes are the idea's notes: the
recorder's `IdeaNotesPanel` sits under the device unchanged ("Notes for
…"), with `ensureIdea` making the loop's idea (kind "loop", no take yet)
on the first note when the loop was never saved; Load brings the notes
back with the sources. **Panels.** The looper device and the notes panel
each sit in a `FloatingPanel` with the recorder's pop-out button, floating
from lg, docked below, remembered per browser. **Input Source** is the
source group's label. The loop's name is a field above the screen as the
recorder's idea title (Kevin: a placeholder name shown on the device and
editable there), the placeholder being "Loop · date · tempo", which Save
adopts when nothing was typed; the screen says "saved", "changed since the
save" or "unsaved". Verified on dev: Save with no dialog made a "loop"
idea hidden from the recorder until Show loops (with the icon), the
identity survived a reload, Export put it in the list, Load lists it, and
the notes panel appeared on the loop.

## Inputs: line in and the computer (2026-10-02)

Kevin: record "content played elsewhere on the computer e.g. another
program" and "an instrument plugged into the computer, an additional bus
besides microphone or at least selecting a different bus". Five sources
now: `mic`, `line`, `computer`, `piano`, `drums`. The microphone and the
**line in** are both `getUserMedia` inputs (`requestInput(source,
deviceId)`), each with its own device chosen in the **Inputs** menu from
`enumerateDevices` (labels once a microphone was allowed, listed again on
focus), remembered per browser, and a **channel mode**: stereo, or one
channel on both sides through a splitter and merger (`#withChannels`), for
an instrument on channel 1 of a stereo interface; opening a source again
replaces its tap and monitor (`#tapSource` disconnects the earlier nodes).
The **computer** source is `getDisplayMedia({ video, audio })` with the
video track dropped at once: Chrome and Edge share a tab's audio anywhere
and the system's on Windows; on a Mac the system's audio needs a loopback
device chosen as the line in; Safari shares no audio; the menu says so,
and "No audio was shared" when the picker's box was left unticked. Its
latency cannot be measured here (the audio never went through our output),
so a slider (`computerLatencyMs`) shifts those layers; the microphone and
the line in use the measured round trip, the piano the reported output
latency, the drums nothing. The monitor switch covers both inputs. Found
on the way: `open()` could be entered twice (the page opens the audio on
any pointer-down, and a button's click a moment later), and the second
caller returned before the capture node existed; `open()` now shares one
in-flight promise. Also: the device menus open to the right, since the
Settings group sits at the device's left edge and a menu spanning left had
no room (it pinned to the viewport's edge), with a `max-w-lg` cap.

**Gain and normalize** (Kevin: "the input level seems low, is there an
auto adjustment we can make or add a control?"). The browser's own
automatic gain is off with the other voice processors (they ruin an
instrument), so each outside source has a GainNode after its channel
wiring (`#withGain`, `inputGainsDb` −12 to +24 dB, remembered per
browser, moved live by `setInputGainDb`), so the meter and the layer carry
it; and `normalize` (off by default) scales a captured pass from an
outside source so its peak sits at −1 dBFS, never a near-silent one and
never down. Verified on dev: a layer recorded at −12 dB peaks at 0.251 of
one at 0 dB, and a normalized quiet layer peaks at 0.891.

## Importing a take (2026-10-02)

Kevin: "Can idea recording takes be imported as layers into the looper?"
The Load menu's **Import a take** section lists the user's latest forty
takes (`recentTakes` in the page load, from `listUserIdeas`), each with
its length and source count; `loopSources` now also hands back the take's
own file (`mix`: the lossless source, which the browser decodes itself)
beside its sources. `looper.importTake(mix, sources, { lengthFrom,
startSeconds })` fetches and decodes a multitrack take's sources as one
layer each, or the take itself as one layer; with **Loop length: from the
take** (an empty loop) the bars become the take's length at the tempo
rounded to the nearest allowed (1, 2, 4, 8), with **fit to the loop** (or
whenever the loop has layers) the current length holds; each file is cut
to the loop length from the chosen start offset in, padded with silence
when shorter. A layer's source is read from its label (Piano, Drums, else
the microphone). A take recorded freely will not sit on the beat unless
it was played to the tempo; the start offset is for a take that begins
before its downbeat. Verified on dev: a two-bar drums loop at 120 bpm
exported as a take, then imported into an empty loop at 60 bpm became one
bar of 4 s; imported again into that loop it fitted as a second 4 s
layer.

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
