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

The plan came first (what the app had to build on, what the precedents
teach, the design, the phases, the questions); "As built" at the end
says what was made from it on 2026-10-10 and where it differs.

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

## Kevin's answers (2026-10-10)

The names as proposed; Instrument / Line as a switch with a tooltip on
impedance and the benefit of an interface; phases 1 to 3 together; he
tests with a bass straight into the computer, straight into the phone,
and through a USB interface (an iRig-class adapter and a guitar to be
borrowed); cabinets at my discretion; the speakers allowed with the
feedback warning; all nine existing pedals plus a noise gate and an
overdrive; preferences in the browser first; the tuner's source prop in
phase 1.

## As built

**The chain** (`src/lib/audio/ampChain.ts`): gate → compressor →
overdrive → fuzz → wah → preamp → tone stack → power stage → cabinet →
chorus → phaser or flanger → delay (a send) → rotary → tremolo → spring
→ master (a squared law) → limiter. The pedals are the shared stages of
`fxStages.ts`: the chorus, phaser, tremolo, rotary and compressor moved
there out of `pianoFx.ts` (the piano and the Studio's track chain now
use them too), the fuzz became one shape of a `createClipStage` and the
overdrive another (a cubic, the lows under 250 Hz left out of the
clipper). The amp's own stages are in `ampStages.ts`:

- the **preamp**: a high-pass, the signal split so a bass head's
  fundamentals (under 80 Hz on the Fridge, 60 on the Solid State) pass
  beside the clipper, a gain of 1 + gain·drive into the model's curve
  (a biased tanh for the clean, an asymmetric tanh for the tweed, a
  cubic that goes flat for the solid-state), a low-pass, and a make-up
  that holds three quarters of the level;
- the **tone stack**: three biquads ±12 dB with the model's scoop, Bright
  (fading with the gain), Ultra Lo and Ultra Hi, and the five-position
  mid selector on the bass heads;
- the **power stage**: an envelope follower that sags the gain, a soft
  clip, Presence;
- the **cabinet**: a ConvolverNode over an impulse synthesized in-house
  (`utils/cabinetImpulse.ts`: a delta through the box's filters, a
  reflection off the baffle, a few damped cone modes; measured in its
  tests), so phase 2's "real impulse" is already the shape of it, with
  no licence to read. A licensed pack can drop in later as a file;
- the **spring** (`utils/springImpulse.ts`): a train of chirps that die
  over a second and a half, two channels with their own jitter, at unit
  energy (peak-scaled it added twelve times the dry's level and the knob
  was wet and clipping by halfway, Kevin, 2026-10-11); the wet follows
  the knob to the power of 1.5, up to 0.8;
- the **gate**: an AudioWorklet (`static/worklets/amp-gate.js`, since the
  punch list of 2026-10-10): the louder channel's envelope against the
  threshold with 3 dB of hysteresis, the gate opening over Attack,
  waiting Hold under the threshold, then closing over Release; the
  module is loaded by `loadAmpWorklet` (the engine on its own page, a
  host before `hostContext`, `render()` offline), and until it is, a
  native stand-in (an envelope through a step curve into a gain) passes
  the signal.

**The engine** (`amp.svelte.ts`, the one `amp`): its own context with
the interactive latency hint on its page, hosting the metronome and the
drum machine; `hostContext(ctx)` builds the chain in the looper's or the
Studio's context instead, as the piano does, and the inputs module
gained `listen()` so a hosted amp gets its source's node without
attaching the inputs itself. On its own page Off closes the input;
hosted, Off only disconnects (the host's other tracks may want the same
line in). `render()` runs the rig offline over a sawtooth for the
browser test. Settings are `AmpPreferencesSchema` in localStorage.

**The band** (phase 3): the amp is a source on the looper (`"amp"` in
`LoopSource`, tapped from `amp.output()` in the looper's context, the
amp switched on as a layer arms), on the Idea Recorder (a
`RecorderInstrument` captured through `captureStream()`, wet), and an
input in the Studio (`"amp"` in `STUDIO_INPUT_SOURCES`, hosted; a take
is shifted by the input latency like a line in), each page with an amp
panel beside the instrument panels; and a panel on the song page to
play along with the stems or a mix. What lands on a take is what was
heard, pedals and all; the re-amp (a dry take with the settings beside
it) is not built, and would need a column for the settings on a take.

**Not built yet**: presets in the site library (a table of their own; the
browser remembers one rig per instrument for now), the phone layout has
had no pass of its own beyond the container queries, and the latency
verdicts are from the papers until Kevin's measurements (the fake
device under test reads 84 ms, which says nothing about hardware).

## Presets (built 2026-10-10)

Kevin: "Tell me more about what you would build for the presets" and
"proceed". The piano's shape (docs/piano.md, "Presets"), per instrument:

- **What a preset is**: `AmpPresetDataSchema` is the rig (`AmpRigSchema`:
  the model, the head and the pedals), every field optional with its
  default so an older preset still parses. The master is the room's
  level, not the sound's: `amp.applyPreset()` keeps it where it is, and
  `ampPresetKey` leaves it out when it decides which slot the rig sits
  on. The input, the trim and Instrument / Line are not in a preset.
- **Three layers** (`utils/resolveAmpSlots.ts`), six slots per
  instrument: the site's defaults (an app setting per instrument,
  `ampPresets:guitar` and `ampPresets:bass`, set from the amp by a system
  admin through `setSiteAmpPreset` / `clearSiteAmpPreset` in
  admin.remote.ts); a signed-out browser's own slot saves
  (`utils/ampSlotOverrides.ts`, `stemshovel.amp.presets.<instrument>`);
  and a signed-in member's account library, the `amp_preset` table
  (migration 0085: account, creator, name, instrument, slot, data JSON;
  at most one of an account's presets per instrument and slot, kept by
  `freeAmpSlot` in data.ts; up to `MAX_AMP_PRESETS` = 100). Editors save,
  rename, re-slot and delete (`ampPresets.remote.ts`); viewers load.
- **On the face** (`AmpPresets.svelte`, under the knobs when a page gives
  `PracticeAmp` its `sitePresets`): the six slot buttons of the instrument
  in force, lit on the one the rig matches, dimmed when empty (a click on
  an empty one opens the save form); ⌘-click or a hold saves to a slot;
  the bookmarks button is the manage menu with the save form (name, slot,
  Save / Save in this browser / Save as site default / Copy link), the
  slots as they stand, the site defaults in full for an admin (save here,
  rename, move, clear), and the account's library with a search box from
  six presets up. The line after the buttons names the preset the rig
  sits on, "edited" once a knob moves off it.
- **Share links**: `/practice-amp#preset=<base64url {name, data}>`
  (`encodeAmpPreset` / `decodeAmpPreset`, checked by the schema on the way
  in), shortened as the piano's are (`shortenShareLink`, kind
  "practice-amp"); the amp's own page reads it on mount (`readLink`),
  names it and keeps nothing until saved.
- **Where it reaches**: the amp page (the current account, as the piano
  page picks it), and the amp's panel on the looper, the Idea Recorder,
  the Studio (their account) and the song page (the song's account, for an
  editor; viewers get the site's and the browser's). Tested:
  `data.amp.test.ts`, `ampPreset.test.ts`, and the amp's browser spec
  saves, loads and deletes one.

## On at the first touch, and Mute (2026-10-11)

Kevin: "it's easy to miss that it isn't on… To what degree could it be
automatically turned on on load or when an input is selected?" A browser
starts audio and opens an input only from a gesture, so on-at-load is
out; the amp comes on at the **first touch** of anything on its face
(`onpointerdowncapture` on the device, the piano's pattern), which
covers choosing an input too; the switch stays for Off, which closes the
input. Off is made unmistakable: the readout dims and says "Off · touch
the amp to turn it on", the knobs dim, the switch is ringed. A **Mute**
button beside the switch (`amp.setMuted`, a gain after the chain, so the
meters still move) turns the output off with the input open; the amp
engages it itself for the microphone input into the speakers
(`mutedForFeedback`, the readout explains and asks for headphones), in
place of the earlier quiet master, which was the hidden state Kevin was
describing.

## Captured cabinets (2026-10-10)

Kevin asked about open-source cabinet packs; the usable ones are the
two from Jester Dyne Productions (Bastian Karschewski), whose handbooks
license them CC0 ("completely free to use in your private and
commercial Projects"): the Emerald Pack (a Marshall 1960AX with
Greenbacks, SM57 and e606, dry room) and the Brutal Pack (a modified
4×12 with Vintage 30, Rockdriver Jr and DV-77 speakers, several
microphones, a semi-live room with a slight tail). Eight of the
twenty-one are in `static/cabs/` (its README lists which), trimmed to
120 ms with a fade (the Brutal captures carry a room tail beyond that),
48 kHz 16-bit mono, 11 KB each. `AMP_CABINET_CAPTURES` names them;
`head.cabinet` is "model" (the synthesized cabinet) or a capture's id,
so a preset carries the choice; a Cabinet menu beside the head shows
where the instrument has captures (guitar only so far). The cabinet
stage fetches a capture as it is chosen (`loadCabinetCapture`, once per
context and file), scales it to unity over 250 to 800 Hz as the
synthesized ones are, and plays the model's own until it arrives;
`amp.cabinetLoaded()` says which is in the convolver (the browser test
waits on it). Credited on the Built With page. Soundwoofer, which calls
itself public domain, is the candidate for the bass heads once its terms
can be read; the other free packs are free to download, not to ship.

## The first hardware report (2026-10-12)

Kevin, with an iRig HD X and a Rickenbacker bass: the Solid State head
sounded right; the Fridge distorted at its default Gain with no pedal on
and neither meter clipping, and Set level had put the trim at +13 dB;
trim at 0 was clean but quiet. Measured (`amp.render()` now takes a
sine at a level and reports the harmonics' share, 2f to 6f over f): on a
110 Hz sine at −12 dBFS, the level Set level aims for, the Fridge gave
4.4% harmonics at Gain 3, 7% at 5 and 9.6% at 10; the Tweed 23% at 5
and 24% at 10. The linear law `1 + gain·drive` drove every head into its
clipper by the knob's first third and had nothing left after. The law is
exponential now, `drive ** gain` (1 at 0, `drive` at 10), in the preamp
and the power stage both, so the lower half of each knob is clean and the
crunch lives in the top half; the figures after it are in the table in
the section's commit. A bass's plucked peaks sit well above its sine
equivalent, which is why Kevin heard it before the meters did.

## The punch list (2026-10-10, after the presets)

Kevin picked six items from the list of what was left:

- **A drum beat on the amp page**: the drum machine in a panel beside the
  tuner and the metronome, hosted in the amp's context already, with the
  page's kits and the account's beats as the looper has them.
- **A play-along transport on the song page**: the amp panel's header
  holds Play / Pause, From the top, and a Count in switch: a bar of the
  metronome (which the amp hosts, so click and guitar share one output)
  and then the stems play. It drives the stem engine; the Mixes view
  lists mixes rather than playing them, so the transport is for the stems.
- **The gate**: attack, hold and release in a worklet (above).
- **Tremolo shape**: sine or square on the clean head (`head.tremolo.shape`,
  a "Trem: square" switch beside Bright).
- **Preset links on a panel**: the hash key is `#amp=` (the piano's panel
  reads `#preset=` on the same pages), every amp reads it on mount, a link
  is copied for the page it was made on, and the looper, the recorder,
  the Studio and the song page open their amp panel when they arrive
  with one.
- **The tuner through the amp on the looper and the recorder**: the
  looper gained a tuner panel; both pages' tuners take the amp's input
  while the amp is on and open the microphone otherwise (`Tuner`'s
  `source` may return null), and the amp's face shows the Tuner button
  on both.

## Demo through the chord player (2026-10-11)

Kevin, with no electric guitar to hand: "wire up a test or demo mode
where we can play samples of a dry electric guitar signal through the
practice amp… put them in the chord-player and wire in the practice
amp", and "we already have electric bass in the chord-player, perhaps
we can wire that to the practice amp", and "but that signal is not dry".

- **A third source**: `source: "chords"` beside the line in and the
  microphone input. The amp hosts the chord player's engine in its
  context (`chordPiano.hostContext`, a no-op where a host already did)
  and takes its voices **before the piano chain's effects**:
  `PianoEngine.tapDry(node)` connects the chain's `input` (the voices'
  sum) to the amp's chain and takes the piano's master off the speakers,
  so what reaches the amp is the samples as recorded, with no reverb or
  pedal of the piano's own, and only the amp is heard; `tapDry(null)`
  puts the master back. No jack is opened; Set level, Calibrate and the
  device menu hide. The amp's instrument follows the chord player's
  sound as it switches on (Electric Bass → the bass heads, anything else
  → guitar). Kevin heard clipping with the chord player's Volume and the
  amp's Gain both down: the Volume slider sits on the piano's master,
  after the tap, and a loud sampled chord sums past full scale into a
  chain that expects peaks near half. So the tap carries a gain that
  follows the Volume slider, and the chords source has a trim of its own
  (`trimDb.chords`, −24 to +24 dB, −12 to start) through a gain the amp
  owns, so Set level works for it as for a jack.
- **A dry electric guitar**: FreePats' Electric Guitar FSBS (direct), a
  Fender's raw bridge-pickup signal recorded through an instrument
  input, CC0; nineteen loud takes C2 to C#6 as `static/kits/eguitar`
  (`bun run samples:eguitar`, 580 KB), a third sampled instrument in
  `sampledInstruments.ts` ("Electric Guitar (direct)" in the Sound menu,
  with a synthesized stand-in in `synthVoice.ts` while the samples load).
  The Electric Bass (FreePats' Yamaha RBX, also a direct recording) was
  there already, so both heads can be tried without an instrument.
- **On the amp page**: a Chords button beside Tuner, Metronome and
  Drums opens the chord player in a panel (the looper's props: the
  piano samples base, the chord presets, the account's piano presets
  and chord styles); switching the amp on with Chord player as the source
  opens the panel. On the looper, the recorder, the Studio and the song
  page the chord player is already a panel, so the source works there too
  (the engine hosts the chord player into the amp's context where the
  page had not).
- Tested: `tests/e2e/amp.spec.ts` sets the source, switches on, plays a
  note on `__chordPiano`, and sees the amp's output meter move.

## The knobs in groups (2026-10-11)

Kevin's order, lined up as the piano's buttons are (the
`device-button-group-label` style; an unlabelled group keeps an invisible
label so its knobs sit level with the rest): Gain alone; **EQ** (Bass,
Mids, Mid Hz on the bass heads, Treble); **Reverb** (Level) and
**Tremolo** (Depth, Speed) where the head has them; then Presence,
**Master** and **Output**. Two knobs were renamed to fit his list: the
power stage's push, formerly Power, is Master (a Fender's master drives
the power amp), and the final level, formerly Master, is Output; the
schema's fields (`power`, `master`) and presets are unchanged.
