# Practice Amp: a plan

Kevin, 2026-10-10: "plug an electric guitar or electric bass directly to
the audio input on their phone or computer and be able to play the
instrument and hear it in headphones or using the built in speaker…
instruments plugged directly (instrument level) or through an audio
interface (digital line or analog line level)… amp simulation. Starting
with a basic default Fender Twin Reverb or similar for guitar and an
Ampeg tube amp for bass. We would genericize the names… input level
controls, volume, tone, reverb, fuzz distortion, compression, whatever
typical options an amp might have + effects we already have ready to go…
a control to indicate what kind of instrument is plugged in (bass /
guitar) and possibly whether it is instrument or line level."

This is the plan before any code: what the app already has to build on,
what the precedents teach, the design, the phases, and the questions
that decide the shape. Nothing here is built yet.

## What the app already has

- **One input module.** `src/lib/audio/inputs.svelte.ts` (`inputSources`)
  opens the microphone or "Line in" with `echoCancellation`,
  `noiseSuppression` and `autoGainControl` off, picks the device and the
  channel (left, right or both: an instrument on channel 1 of a stereo
  interface), has a gain stage (−12…+24 dB), a meter, a monitor path,
  `calibrate()` for the round trip and `outputLatencyMs()`. The looper,
  the Idea Recorder and the Studio all go through it. The amp taps
  `inputSources.output("line")` and gets all of that for free: device
  picker, channel mode, meter, Safari's rotating device ids.
- **The effects.** `src/lib/audio/fxStages.ts` holds the fuzz (tanh
  WaveShaper, 4× oversampling, tone, make-up), the delay (digital or
  analog), the wah (touch or sweep) and the tone stage; `pianoFx.ts` has
  the chorus, phaser, flanger, tremolo, rotary and compressor the piano
  and the chord player use; `trackChain.ts` is the Studio's small
  per-track chain (compressor, tone, reverb send) and the closest template
  for a new chain. `reverbImpulse()` in `drumBus.ts` synthesizes the
  reverb. docs/effects.md explains every node and how it was measured.
- **The device-page recipe.** A tool page is `src/routes/<tool>/` with
  `pageCopy()` (docs/page-copy.md), `PageCopyHeader`/`PageCopySection`,
  the Tools menu (`GlobalNav.svelte` `TOOL_PAGES`, the footer row), a
  smoke row, an e2e spec with the fake microphone and a dev-only
  `window.__<tool>` hook. The tuner page is the smallest example; the
  looper shows the floating/docked panels and `spaceOwner`.
- **Hosting other engines.** `piano.hostContext(ctx)`,
  `metronome.hostContext(ctx)` and friends let one page run several
  engines in one AudioContext (the looper and the Studio do this), so the
  amp page can carry the metronome, a drum beat or the tuner on the same
  output.
- **iOS plumbing.** `audioSession().type = "play-and-record"`,
  `playThroughSilentSwitch()`, `latencyHint: "interactive"`, the warm-up
  poll in the piano engine. The tuner opens its own stream and context;
  the amp should share instead (see "Tuner" below).
- **Nothing amp-shaped yet.** No cabinet, no impulse file, no preamp; the
  words "amp", "DI", "line level" appear nowhere in `src/` or `docs/`.

## Precedents and what they teach

- **Michel Buffa's AmpSim (WASABI, I3S/INRIA)**, MIT, pure Web Audio since
  2017: a JCM800-style preamp as a chain of gain → WaveShaper stages with
  filters between them, a tone stack of biquads, a power-amp
  gain + WaveShaper, then a cabinet as a ConvolverNode over an impulse
  response, then reverb. Their papers report 12–14 ms end to end on a
  MacBook with a USB interface and that listeners could not reliably tell
  it from native plugins for clean-to-crunch tones. The lesson: **the
  browser's own nodes are enough for a clean and a crunchy amp**, exactly
  as docs/effects.md already argues; the cabinet is where an impulse
  response earns its keep. (github.com/micbuffa/WebAudio-Guitar-Amplifier-Simulator-3;
  "Rocking the Web With Browser-Based Simulations of Tube Guitar
  Amplifiers", 2023.)
- **Neural Amp Modeler on the web** (tone3000's `neural-amp-modeler-wasm`,
  MIT): the NAM inference engine compiled to WebAssembly inside an
  AudioWorklet, single-threaded on purpose because multi-threaded WASM
  "crossed the iOS Jetsam memory limit"; a 64 MB heap; models are `.nam`
  JSON files loaded by URL, each with its own licence on tone3000. The
  lesson: **captured-amp realism is reachable later** without native
  code, at the price of a heavy module and per-model licensing. Not for
  the first version.
- **Latency numbers** (Jeff Kaufman's measurements; the Buffa papers):
  default settings give 55–67 ms round trip on a MacBook; `latencyHint:
  "interactive"` (or 0) with the three processors off gives 14–19 ms, and
  a USB interface 10–14 ms. Bluetooth output adds 150 ms or more and
  under-reports it. The app's inputs already use the right constraints;
  the amp context needs `latencyHint: "interactive"` and the page must
  tell the player what it measured.
- **iOS Safari** (WebKit bugs 218012/230902; the Audio Session API shipped
  in iOS 17): opening the microphone puts Safari in play-and-record, which
  attenuates the speaker and can move output to the earpiece or away from
  a headset; a wired headset with a microphone makes _its_ microphone the
  input. The app already sets `audioSession().type` explicitly. For a
  guitar the sane setups are an interface with its own headphone jack
  (iRig-class: the phone's input _and_ output are the interface) or the
  interface in and the phone's speaker out, which will be quiet.

## The design

### A page, not a panel

`/practice-amp` in the Tools menu beside the tuner and the metronome,
usable signed out like the looper (nothing to store but preferences),
copy-doc'd like every tool page. The device is the amp's face: a head
with knobs, a pedal row under it, the input strip above, the tuner and
the metronome as pop-overs sharing its AudioContext. Container queries
for the phone layout (no JS window width), as the other devices.

### The input strip

- **Source.** The inputs module's "Line in" source with its device picker
  and channel mode; the microphone source is allowed too (an acoustic
  through the laptop mic) but the page warns about feedback when the
  output is a speaker. Monitoring in the inputs module stays off: the amp
  is the monitor, with its own path from `inputSources.output("line")`.
- **Instrument / Line.** A browser cannot change the jack's impedance, so
  this switch is honest about what it can do: it sets the starting trim
  (+12 dB for an instrument straight into a mic jack, 0 dB for an
  interface's line) and what the meter calls a good level. A **Set
  level** button listens for three seconds of playing and sets the trim
  for peaks around −12 dBFS; a clip light on the meter.
- **Guitar / Bass.** Picks the amp model and the pedal defaults; the
  tuner's tuning follows it.
- **Latency readout.** The measured round trip from `calibrate()` (the
  three clicks through the speaker and back; it needs the mic, so for an
  interface it reports the context's `baseLatency + outputLatency`
  instead) with a plain verdict: "under 15 ms: feels direct", "15–30 ms:
  playable", "over 30 ms: check the output" and a line naming Bluetooth
  when the output device says so.

### The guitar amp (the Twin-like clean, generic name to pick)

Input → noise gate (off by default; a threshold knob) → pedals
(compressor, fuzz, wah) → **preamp**: gain stage into an asymmetric soft
clipper (a tanh with a small DC offset for even harmonics, 4×
oversampling, the fuzz stage's shape with a gentler curve), a bright
switch (a +6 dB shelf above 2 kHz that fades as Volume rises, as the
real bright cap does) → **tone stack**: Bass, Mid, Treble as a low shelf
at 100 Hz, a scooped peaking band at 500 Hz and a high shelf at 2.5 kHz,
tuned by rendering sweeps so the knobs' middle matches the passive
stack's natural scoop → **power amp**: Volume into a second, softer
clipper with a touch of sag (an envelope follower nudging the gain) →
**cabinet**: in the first version a filter model of a 2×12 open-back
(high-pass 80 Hz, a resonance around 110 Hz, the 4–5 kHz roll-off with a
small 3 kHz bump); later a real impulse response in a ConvolverNode →
**spring reverb** (a short, bright synthesized impulse, from
`reverbImpulse`'s recipe with a chirp) and **tremolo** (the Twin's own:
the existing tremolo stage) → post-pedals (delay, chorus/phaser/flanger,
rotary) → master → limiter → output. Knobs: Gain, Volume, Bass, Mid,
Treble, Bright, Reverb, Tremolo speed/depth, Master.

### The bass amp (the Ampeg-like tube head, generic name to pick)

Input → compressor (on by default, gentle) → **preamp**: a warmer, softer
clipper that keeps the low end (the clipper sees the signal above 80 Hz;
the fundamentals pass beside it, so drive adds grit without mud) →
**tone stack**: Bass, Mid, Treble with the SVT's mid-frequency selector
(220 / 450 / 800 / 1.6 k / 3 kHz) and the Ultra Lo (+ low shelf, − mids)
and Ultra Hi (+ high shelf) switches → **power amp** with more sag →
**cabinet**: an 8×10 as filters (high-pass 40 Hz, a 100 Hz bump, a steep
roll-off above 4 kHz) → pedals (fuzz for a fuzz bass, chorus, delay) →
master → limiter. Knobs: Gain, Bass, Mid, Mid frequency, Treble, Ultra
Lo, Ultra Hi, Drive (power-amp), Master.

### What is shared

Both amps are one `createAmpChain(ctx, model, settings)` in
`src/lib/audio/ampChain.ts` built from the stages in `fxStages.ts` plus
new `createPreampStage`, `createToneStackStage` (three bands with a
movable mid), `createCabinetStage` (filters now, an impulse later) and
`createSpringStage`; the pedals are the existing fuzz, wah, delay,
chorus, phaser/flanger, tremolo, rotary and compressor, reached through
a `PedalBoard` menu in the style of `PianoEffectsMenu` (drawers, meters,
"Reset all"). Every stage takes a `BaseAudioContext`, so the amp can be
rendered offline for tests and for re-amping. Settings live in
localStorage per instrument (`stemshovel.amp.guitar`, `stemshovel.amp.bass`)
as the piano's do, with a valibot schema so a shared preset is the same
shape later.

### Latency and feedback, the honest version

- The amp context uses `latencyHint: "interactive"`; the processors are
  off already. There is no compensation possible for monitoring: what the
  hardware gives is what the player feels, and the page says so with the
  readout above instead of hiding it.
- Bluetooth output is named when `enumerateDevices` labels it or the
  measured round trip is over 100 ms; the page suggests wired
  headphones or the interface's own headphone jack.
- Feedback: when the input is the built-in microphone and the output is
  not headphones, the amp starts with the master down and a notice; the
  line source has no such problem.
- iOS: `audioSession().type = "play-and-record"` as the looper does; the
  page tells a phone user that the speaker will be quiet while the input
  is open and that a wired headset's microphone will replace the guitar.
  Kevin tests on his phone with an interface before this is called done.

### The tuner and the metronome on the amp page

The tuner opens its own stream and context today. On the amp page it
should read the amp's input node (a `source` prop on `Tuner.svelte`
taking an AudioNode in place of opening a stream) so two streams never
fight over one device, and mute the amp while tuning if the player
wants. The metronome is hosted in the amp's context (`hostContext`) so
the click and the guitar share one output and one latency. A drum beat
from the drum machine the same way, later.

## Phases

1. **The amp.** The page, the input strip, both amp models with
   filter cabinets, the pedals that exist, the tuner and the metronome
   pop-overs, preferences in the browser, latency readout and the
   warnings, page copy, user doc, e2e with the fake microphone (the chain
   is exercised with a rendered test tone, as docs/effects.md measures
   the effects), the dev hook `window.__amp`. Nothing on the server
   beyond the copy doc.
2. **The sound.** Cabinet impulse responses in a ConvolverNode (made
   in-house by rendering, or licensed; see the questions), a spring
   impulse, a second guitar model (a tweed-style crunch) and a
   solid-state bass model, amp presets in the site library beside the
   piano's (`pianoPreset` with a kind, as the chord player's presets are).
3. **The band.** The amp as a source in the Idea Recorder, the looper and
   the Studio through `captureStream()` (recorded **dry**, with the amp
   settings saved beside the take, so a take can be re-amped: the chain
   runs offline on the DI), and the amp on a song page to play along with
   the stems or the latest mix. This is where a practice amp becomes part
   of Stem Shovel rather than a tool beside it.
4. **Captured amps** (optional): Neural Amp Modeler models in a worklet,
   gated on how phase 2 sounds and on a licence for the models.

## Open questions

1. **Names.** Generic names for the two models. Proposals: guitar
   "Blackface Clean" or "Silver Clean" (blackface/silverface are the
   era names, not trademarks), bass "Fridge" (the 8×10's nickname) or
   "Classic Tube". The page can say "in the style of a 1960s American
   clean combo / a classic all-tube bass head" without naming brands.
2. **Instrument / Line.** Given that the switch can only set the trim
   and the meter's target, keep it as a switch (clear to a player) or
   fold it into the Set level button and an input gain knob?
3. **Standalone first, or the band from the start?** Phase 1 is a tool
   page; phase 3 ties it to recording and songs. Build 1 and ship, or
   plan 1 and 3 together so the DI-plus-settings take shape is right from
   the start?
4. **Hardware to test on.** Which interfaces and phones do you have (an
   iRig-class phone interface, a USB interface on the Mac, a guitar into
   a laptop mic jack)? The latency verdicts and the iOS notes should come
   from measurements on those, not from the papers.
5. **Cabinet.** Ship the filter model in phase 1 and add impulse
   responses in phase 2? For the impulses: render our own (free of
   licence, less real) or license a pack (several are sold or given under
   terms that allow use in software; needs a read of the terms).
6. **Speaker output.** Allow the phone's or laptop's speaker as the
   output with the warnings above, or headphones and interfaces only? (A
   guitar through a line input into a laptop speaker is fine; a
   microphone input into a speaker feeds back.)
7. **Which pedals in phase 1.** Compressor, fuzz, wah, delay, chorus,
   phaser, flanger, tremolo and rotary exist; a noise gate and an
   overdrive pedal (softer than the fuzz, separate from the amp's gain)
   would be new. All of them, or a short row?
8. **Preferences.** Browser-only in phase 1 (as the piano), or on the
   account from the start so settings follow a signed-in player between
   the phone and the laptop?
9. **The tuner change.** Giving `Tuner.svelte` a `source` node prop
   touches the tuner on its own page and the home demo (they would keep
   opening their own stream). Fine to do in phase 1?
