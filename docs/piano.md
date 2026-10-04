# A piano and synth (plan)

Status: **Phase 1 built** (2026-09-29, unreleased): `/piano`, in the Tools
menu and the footer. Kevin's ask: a keyboard-playable piano / synth
instrument, with a MIDI controller for a connected instrument, simple to
start and growing over time. Precedents he pointed at: joeheyming's
piano (25 to 88 keys, samples plus oscillator tones, the standard
computer-key mapping, sustain on space, arrows for the octave, MIDI),
sophiaedu's virtual piano (the key design he likes), onlinepianist (the
sound he likes: sampled instruments, 88 keys, sustain on by default, a
metronome, a four-track recorder) and WebKeys (scale highlighting,
chords, transpose, a reverb; sounds he does not like).

## Phase 1 (built)

- `src/lib/audio/synthVoice.ts`: five sounds as Web Audio patches, a
  few oscillators through a low-pass and an ADSR: an electric piano (a
  bell of sines with a tine that fades first), an organ (five drawbars
  with a light vibrato), a synth lead (two detuned saws and a sub square
  with a velocity-opened filter sweep), a pad (slow swell, long release)
  and a pluck. Velocity sets the level and how far the filter opens. No
  samples yet, so nothing to load and nothing to credit.
- `src/lib/audio/piano.svelte.ts`: the page's one piano. Notes in as MIDI
  numbers from anywhere; a master gain with the drum machine's synthesized
  reverb (small room) behind it; `HeldNotes` (`src/lib/utils/heldNotes.ts`,
  tested) keeps the pedal's bookkeeping: a note let go under the pedal
  rings until the pedal comes up. Twenty-four voices, the oldest stolen.
  The AudioContext opens on the first note. Instrument, octave, volume and
  reverb are remembered per browser (`pianoPreferences`).
- `src/lib/components/Piano.svelte`: the device (the drum machine's chrome,
  "SS KEYS 001"). Three octaves of keys where there is room, two on a
  phone (a ResizeObserver attachment), black keys laid over the whites by
  percentage. Under 640 px the keyboard stands on end (Kevin's ask): the
  keys run down the screen, low notes at the bottom, black keys along the
  left, the board 78 vh tall; a white key is at least 52 px tall, and the
  board shows as many keys as that allows (a partial octave: ten whites,
  C3 to E4, on an iPhone; twelve on a taller Pixel), so every key is a
  finger's target and the octave buttons move the window. Velocity then
  comes from how far right the finger lands. Pointer events on the board: each finger holds a note,
  sliding across keys moves it, pressing lower on a key plays louder.
  The computer keyboard by physical key code (`PIANO_KEY_CODES`): the row
  from Z is the first octave with its sharps on the row above, the row from
  Q the octave above, arrows for the octave, space for the pedal, escape
  for silence; the keys print the QWERTY letters. Web MIDI on request
  (`Connect MIDI`, Chrome and Edge): every input plays, note on/off with
  velocity, CC 64 as the pedal, all-notes-off.
- **iOS and the first note** (found 2026-09-30): iOS starts an
  AudioContext suspended and resumes it slowly; a note scheduled at
  `currentTime` before the resume sat at time zero and every note pressed
  meanwhile sounded together a second or two later. The engine now warms
  the context on the first touch or key (`warm`) and defers a note until
  the context runs; and a power switch (On / Off, as the tuner's) lets a
  phone user open the audio before the first note, since even the
  deferred first note feels like a glitch. The switch's state is
  `piano.on` / `piano.starting`. The wake is watched by polling
  `ctx.state` (plus `onstatechange`), not by the promise from `resume()`:
  Kevin's phone sat on "Starting…" for minutes because that promise never
  settled; a silent one-sample buffer is played too (the old iOS unlock),
  and after three seconds the switch gives up rather than spin. The screen
  dims while the piano is off, as the tuner's does, and on a phone the keys
  carry no computer-key letters.
- `/piano` page with a how-to; the Tools menu, the footer and the smoke
  list know it.

## Phase 2 (in progress)

- **A sampled piano** (built 2026-09-30): the Grand Piano, first in the
  list and the default. Thirty notes of the Salamander Grand Piano
  (Alexander Holm, CC BY 3.0, a Yamaha C5) in the mp3 subset Tone.js
  publishes at tonejs.github.io/audio/salamander, one every three
  semitones from A0 to C8, two megabytes in `static/kits/piano/`;
  credited on /built-with and in the user doc. `src/lib/audio/pianoSamples.ts`
  fetches on `warm` (the piano page at mount, through `Piano`'s `warm`
  prop; the home page's demo on its first touch) and decodes once there is
  a context, like a drum kit; a note plays the nearest sample at the
  playbackRate that pitches it, through a low-pass that closes for a soft
  touch and a gain from the velocity, damped over a quarter second on
  release. One velocity layer: the recordings are firm strokes, so soft
  playing is the filter's doing. The screen says "loading the piano…"
  until the samples are decoded, and a note before that plays the Electric
  Piano instead, so the first touch is never silent.
- **Sample tiers** (built 2026-09-30, Kevin's ask: as close to stunning as
  the load time allows, quick in the demo, an opt-in for hi-res). The
  first subset (Tone.js's mp3s) averaged 39 kbps and measured 6 dB short
  above 8 kHz against the lossless source, and the velocity filter closed
  too early; that was "thin". `scripts/piano-samples.ts` now makes three
  tiers from the Salamander's FLACs (`--download` fetches them into the
  gitignored `.samples/`, 400 MB): **demo**, one layer (v10) as mp3 VBR q2
  cut to 10 s with a fade (the tail is 40 dB down by 8 s), 3.4 MB in
  `static/kits/piano`, committed, what the home page plays and the piano
  page's first sound; **standard**, four layers (v4 v8 v12 v16) and the 88
  release samples as the same mp3, 14.5 MB; **hires**, six layers (v2 v5
  v8 v11 v14 v16) and the releases as 16-bit 44.1 kHz FLAC at full length,
  72 MB (24-bit would be four times the size for nothing audible through
  a graph that resamples every note). `--upload` puts the standard and
  hires tiers in the stage's public Blob store under `piano/v1/<tier>/`
  with a year-long cache header (a re-encode gets `v2`); each stage has
  its own store, so production is uploaded from Kevin's machine like a
  migration. The client (`pianoSamples.ts`) plays the demo tier at once;
  on the piano page (`Piano`'s `warm` and `samplesBase` props, the latter
  from the page's load through `publicBlobUrl`) the standard tier follows
  in the background, middle octaves first, and a **Hi-res** button (the
  Samples group; the phone menu; shown whatever the sound, and choosing
  it with another sound brings the grand back, since Kevin lost the button
  behind a remembered Organ) fetches the hires tier once, through the
  Cache API, so the next visit costs no download; the choice is
  remembered (`hires` in the preferences) and the tier comes back from
  the cache. Decoding uses an OfflineAudioContext until the piano is on
  (no gesture needed; an AudioBuffer plays in any context), so the tiers
  load while the piano is off rather than a remembered Hi-res choice
  sitting at 0% until the switch (Kevin's find). The hires download starts the moment the button is pressed,
  beside whatever the standard tier still has to fetch (`loadingTiers`
  holds each tier's progress), and the button shows a spinner and the
  percentage until the last file is decoded, then lights. A note plays the two loaded layers on either side of its
  velocity, crossfaded with equal power (`pianoLayers.ts`, tested), so a
  hires layer replaces a standard one of the same number as it lands;
  letting go damps the string and, once the releases are in, plays the
  key's release sample about 40 dB under the note at most, high-passed at
  400 Hz so the mechanism's thump is gone, growing with the hold over the
  first half second (a tap gets a whisper) and 6 dB quieter for every
  second the note rang (Kevin heard "foot pedal clunking" at the first
  level, 0.25 to 0.6 of a recording that peaks as loud as a note; 0.05 and
  0.03 were still too much on short and middling notes).
  The filter only closes for a light touch now.
  Chromium decodes FLAC natively (33 ms a note); Safari has had FLAC
  since iOS 11. Where a browser cannot (built 2026-09-30): `flacSupported`
  decodes a twentieth of a second of FLAC silence
  (`static/kits/piano/probe.flac`) once at load, and where that fails
  the hi-res tier comes from `piano/v1/hires-mp3/`, the same six layers
  and releases as mp3 VBR q0 (55 MB, the fourth output of the encode
  script, uploaded per stage with `--tier hires-mp3`); the button says
  the mp3 size and its title says why. Not built: pedal noises,
  sympathetic resonance.
- **Home page demo** (built 2026-09-30): a full-width section under the
  drum machine; nothing of the piano downloads at load, the demo tier is
  fetched as the section scrolls into view (`piano.prefetch`, no audio
  context yet) so the first touch finds it in, and the drum kit does the
  same (`drumMachine.warmKit`); the keyboard goes to it when it is the demo in view
  (the home page's `spaceTarget` now weighs the player, the drums and
  the piano).
- **The nav** (2026-09-30): an Instruments menu between Projects and
  Tools holds the drum machine and the piano; the footer has an
  Instruments row above the Tools row. On a phone the nav's three menus
  are icons alone, close together (the account button loses its name
  there), so they fit beside the brand.
- **Scale and chord help** (built 2026-09-30, "Key and chords"): a Key
  group (root and scale ComboBoxes, a 1–7 toggle) in the controls row and
  the phone menu; `src/lib/constants/scales.ts` holds nine scales as
  intervals, `scaleDegrees.ts` the scale's pitch classes and degrees, and
  `chordName.ts` names what is held (a note, an interval, or a chord from
  a table of interval sets tried against every held note as the root, the
  bass first, with a slash for an inversion, plus the Roman numeral in the
  key), all tested. The keys in the scale carry a dot (the root's in the
  accent), the keys outside it go a shade darker, and the degree can
  replace the letter; the screen's readout became the chord name. The key
  and the numbering are remembered. Precedents: WebKeys' scale filter and
  pianochord.org's reversed chord finder. Also (Kevin's note): the key
  labels sit on two fixed rows now, the octave name above and the letter
  below, so the letters line up across the keys.
- **Record**: into the Idea Recorder as a take, or straight to a WAV
  through the offline path the drum machine uses.
- **The recorder's toolbar** (built 2026-09-30): a piano button beside
  the drums (the wrench menu on a phone) opens the full `Piano` under the
  recorder, and its sound goes into the take: `piano.captureStream()` is
  a MediaStreamAudioDestinationNode on the piano's master, and
  `DemoRecorder` takes it as `instrument`, mixing it with the microphone
  in its metering context into a MediaStreamDestination that the
  MediaRecorder records (`micInMix` false leaves the microphone out, for
  a clean piano take); the meter reads the mix. The mix is decided as a
  take starts. Unlike the drums and the click, which only reach the take
  through the room, the piano is recorded directly.

## Effects (built 2026-09-30)

An Effects menu as the drum machine's (Kevin's ask), with the chain in
`src/lib/audio/pianoFx.ts` (`createPianoFx(ctx, settings)`, plain Web
Audio so an OfflineAudioContext renders it the same, which is how it is
measured): voices → fuzz → wah → chorus → phaser or flanger → tremolo → rotary → dry bus,
with reverb and delay sends off the dry bus, all summed through the tone
stage into the master.
`piano.set*` calls `fx.update`, which merges a nested patch over what
stands and ramps every level over 20 ms so a slider never clicks; the
settings are remembered in the preferences (`delay`, `chorus`, `tremolo`,
`fuzz`, `wah`, `phaser`, `rotary`), every effect off by default. The fuzz and
the delay come from `src/lib/audio/fxStages.ts`, shared with the drum bus. The button
lights while any of them is up; the menu lays out in two columns from sm
and three from lg, and scrolls when the window is short; on a phone the
same controls sit in the levels menu under an Effects heading.

- **Reverb**: level and room size (the drum machine's synthesized room,
  the impulse rebuilt as the size slider moves).
- **Delay**: level (0 = off), time (50 ms to 1 s), feedback (to 90 %), and
  a Digital/Analog choice. Digital is the drum bus's shape (delay →
  lowpass 3.2 kHz → feedback). Analog puts a soft clip (`tanh`, unity at
  small signals so the feedback stays what the slider says, the peaks
  folding down as tape saturates) and a darker lowpass (2 kHz) in the
  loop, and a 0.4 Hz wobble of ±1.5 ms on the time; measured on a 500 Hz
  - 3 kHz burst the second repeat's 3 kHz sits 20 dB under the digital
    one's and the tail dies sooner, so a longer analog tail wants more
    feedback.
- **Fuzz**: drive (0 = off) and tone. A gain of 1 + 30·drive into a
  `tanh` WaveShaper (4× oversampled), a lowpass from 700 Hz (tone 0) to
  7 kHz (tone 1) after it, and a make-up of 0.27 / tanh(0.3 · gain) so a
  voice peaking near 0.3 comes out where it went in (measured within 1 dB
  of clean at every drive). The wet crossfades in over the first quarter
  of the drive's travel; at a tenth the third harmonic sits 26 dB under
  the fundamental, at a third it is 10 dB under and the wave is nearly
  square.
- **Wah** (Kevin's ask, 2026-10-01): mix (0 = off), Touch or Sweep, and
  range and resonance. A resonant low-pass (a band-pass threw away 19 dB;
  this keeps the body and moves a peak, the vowel of a wah pedal) with its
  cutoff at a 350 Hz floor plus up to 1.8 kHz × range, moved by whichever
  of three summed sources the mode opens: Touch is an envelope follower
  (the signal rectified by a WaveShaper, smoothed by a 6 Hz low-pass, into
  a gain set by sensitivity), so the filter opens with how hard you play
  and closes as the note decays; Sweep is the LFO wrapper at `rate`,
  sitting mid-travel; and a MIDI mod wheel, expression pedal or foot
  controller (CC 1, 11, 4) takes over either while it sends
  (`fx.wahPedal`, a ConstantSourceNode; disconnecting MIDI hands it
  back). Resonance is the low-pass BiquadFilter's Q, which for a low-pass
  is in decibels, 0 to 15, the wet trimmed to 0.7 to leave the peak room.
  Measured on a 110 Hz sawtooth by spectral centroid: a loud note opens
  the filter to about 530 Hz against 330 for a soft one and the follower
  settles within 50 ms; Sweep at 1 Hz runs 290 to 820; the pedal 290 to
  830; full resonance lifts the harmonic at the cutoff 15 dB over the dry
  saw; fully wet sits within 1 dB of dry; mix 0 is the dry signal to the
  sample. Sits between the fuzz and the chorus, as on a pedalboard.
- **Chorus**: mix (0 = off), rate (0.1 to 5 Hz) and depth. Two delay
  lines at 22 and 28 ms swept up to ±4 ms by one sine LFO in opposite
  directions, panned left and right, added to the dry at `mix` (the wet
  is not subtracted from the dry, so full mix is louder by about 3.5 dB).
- **Phaser or Flanger** (one at a time, Kevin's call to save menu space;
  `phaser.mode`): mix (0 = off), rate (0.1 to 5 Hz) and depth, shared.
  The flanger is a delay centred on 3 ms swept ±2.5 ms at full depth by
  the same LFO, with 0.5 feedback, in a second wet the mode opens instead
  of the phaser's (measured: a 1 kHz tone swings 14 dB as the comb
  passes). The phaser: four all-pass
  filters (`BiquadFilterNode`) in series centred at 500, 800, 1300 and 2100 Hz, each moved by
  the same LFO up to ±400 Hz; `mix` crossfades the dry towards half and
  half with the all-passed signal, where the notches are deepest
  (measured: a 1 kHz tone swings 11 dB as they pass).
- **Tremolo**: depth (0 = off, 1 = down to silence), rate (0.5 to 12 Hz)
  and shape, Smooth (sine) or Chop (square): a gain sitting at
  1 − depth/2 with the LFO swinging it ±depth/2. The LFO passes an 80 Hz
  lowpass so a square's edges take about 5 ms: an instant step in the
  level clicked on a sustained Electric Piano note (Kevin heard a crunch).
- **Rotary**: Off, Slow or Fast. The sound splits at 800 Hz (Q 0.5) into a
  horn and a drum, each spun by its own LFO the opposite way through a
  Doppler delay (±0.4 ms horn, ±0.15 ms drum around 2 ms), a level swing
  (30 % and 20 %) and the pan (±0.8 and ±0.6). Slow is 0.8 / 0.7 Hz, Fast
  6.7 / 5.7 Hz, and the LFO frequencies glide between them (the horn in
  about a second, the drum in two, a Leslie's inertia); Off lets them
  coast to a stop and crossfades the dry back. The wet is trimmed to 0.8
  because the bands overlap at the crossover (measured within 1 dB of the
  dry at 300 Hz and 1.5 kHz; fast reaches 7 Hz within three seconds).

- **Tone** (2026-10-01, Kevin): tilt (-1 dark to 1 bright), air (an
  exciter) and bottom (a low-end enhancer after Aphex's Big Bottom), one
  shared stage (`createToneStage`, docs/effects.md "Tone") on the master
  after the reverb and delay returns, so it shapes everything. `tone` in
  the preferences and the preset schema.

- **Compressor** (2026-10-04, Kevin: the bass wanted it): first in the
  chain, before the fuzz, a `DynamicsCompressorNode` with a 6 dB knee and
  a make-up gain after it. Amount (0 = off) takes the threshold from 0 to
  -40 dB; at 0 the sound goes round the node on a dry path (a 20 ms
  crossfade), because Chrome's compressor still took a few dB off with the
  threshold at 0 and the ratio at 1:1, so a bypass is the only true off
  (the meter reads zero then); ratio 1 to 20,
  attack 1 to 100 ms, release 20 ms to 1 s, make-up 0 to +12 dB (only
  applied while the amount is up). The menu shows the gain reduction
  (`fx.meters().reduction`) as a bar, read each frame by an attachment
  while the menu is open. Measured on a three-note synth chord at full
  velocity, ratio 8: 0 dB at amount 0, 13 dB at half, 30 dB at full.
- **Bounce** (the same day): a `StereoPannerNode` after the rotary and
  before the sends, so the room hears the sound move, its pan written
  ahead on the context's clock in steps of the session tempo
  (`metronome.bpm`, the piano listening for changes; `PIANO_BOUNCE_DIVISIONS`
  in constants/piano.ts: an eighth, a beat, two beats, a bar or two bars at
  the metronome's meter). Depth (0 = off) is how far it swings; the path is
  left and right, or via the centre (left, centre, right, centre); glide is
  how much of each step is spent on the way (0 a jump, with a 5 ms ramp
  against clicks; 1 always moving, so via-the-centre at full glide is a
  triangle through the middle rather than a stop). Each step glides from
  the last target written, and a change of settings from wherever the
  sound is, keeping the pattern's phase. Live, a 250 ms timer keeps a
  second scheduled; offline, the whole render is written at once. The
  menu shows where the sound is as a dot (`fx.meters().pan`). Not synced
  to the metronome's own click phase (a different context): the rate is
  the tempo's, the phase starts when the bounce is turned on or its step
  changes. Both in the preferences and the preset schema (`compressor`,
  `bounce`), `resetEffects` clears both.

Not built: a delay timed to a tempo (the bounce shows the way: the
session tempo through `metronome.listen`).

## Presets (built 2026-10-01)

Named presets of the sound and every effect (Kevin's ask), nothing about
the room or the song: volume, octave, the key helper, the letters and
hi-res stay as they are when one loads. `PianoPresetDataSchema`
(`src/lib/val/PianoPresetSchema.ts`) has every field optional with the
engine's default, so a preset from before an effect existed still
parses; `piano.currentPreset()` and `piano.applyPreset()` are the two
ends, the latter through the setters so the chain ramps and the
preferences follow.

Three layers, resolved per slot by `resolvePianoSlots`:

1. **The site's defaults**: five presets a system admin saves from the
   piano itself ("Save as site default" in the save popover, or the
   **Site defaults** list in the manage popover since 2026-10-03: all five
   slots whatever the admin's own buttons show, each with save-here,
   rename, move up or down and clear, every one a `setSitePianoPreset` or
   `clearSitePianoPreset`), one app setting (`pianoPresets`, the commands in
   admin.remote.ts). The home page demo and every signed-out visitor see
   them.
2. **The browser's own**: a signed-out player's slot saves go to
   localStorage (`stemshovel.piano.presets`, `pianoSlotOverrides.ts`),
   per slot over the site's; the save popover says so.
3. **The account's**: a signed-in member's presets in the `piano_preset`
   table (migration 0062), unlimited to `MAX_PIANO_PRESETS` (100), each
   with an optional slot; the data layer keeps at most one of an
   account's presets per slot (`freePianoSlot`). The slotted ones fill
   the buttons (the site's default still shows in a slot the account has
   not taken), the rest live in the manage popover with a search box
   from six presets up. Account-scoped like beats, with the creator
   recorded; editors save, rename, re-slot and delete, viewers load.
   `pianoPresets.remote.ts`; the page's load is `/piano/+page.server.ts`
   with the drum machine's "current account" rule.

The buttons: five under a Presets label from lg, each lit while the
sound matches its preset (`pianoPresetKey`: the schema's field order,
numbers to three places); an empty slot is dimmed and a click on it
opens the save popover. ⌘-click (Ctrl on Windows) or a 550 ms hold opens
the save popover for that slot (a `pointerdown` timer; the click after a
hold is swallowed, and the context menu on a touch hold is prevented);
the sixth button is the manage menu (`bind:openState` opens it from the
slots). Below lg the slots and the manage button sit in the levels menu.
The screen names the preset the sound sits on, or the last one loaded
with "· edited" once a slider moves off it.

**Share links**: `/piano#preset=<base64url JSON of {name, data}>`
(`encodePianoPreset` / `decodePianoPreset`, a few hundred characters,
checked by the schema on the way in); the piano applies it at mount,
names it on the screen and says so in a notification, keeping nothing
until the visitor saves. The drum machine's hash links carry no `preset=`
prefix, so the two do not collide. "Copy link" in the popover shares the
sound as it stands, or any slot or saved preset by its link icon.

Not built: presets in the Idea Recorder's piano (the component shows the
buttons only when a page gives it `sitePresets`); import of a link
straight into the library (save after loading does it).

## Metronome (built 2026-10-01)

Kevin's "modest step towards a looper": the page's metronome
(`src/lib/audio/metronome.svelte.ts`, the one engine per page, remembered
tempo, the lookahead scheduler shared with the drum machine) behind a
metronome-icon button in the More strip (lit while it runs) that opens a
small menu: a start/stop button whose icon swells on the downbeat, a
tempo field, Tap, and the beat while it runs (`metronomeControls` and
`metronomeMenuBlock` snippets); in the compact layout the same controls
are a Metronome section of the device menu. While it runs the screen says
the tempo and the beat. The piano page passes `metronome`; the recorder
page keeps its toolbar metronome and the home page has none. Starting it
stops the stem player or the drum machine, as any transport
(onlyOnePlays). What a looper would take from here: the bar length and
the downbeat.

## Layout by container, not viewport (2026-10-01)

Kevin's call, so the piano can sit in a popover or a narrow panel and lay
itself out by the room it has: the component's breakpoint classes are
container queries (UnoCSS wind4's `@<size>-` variants, Tailwind's
container sizes; the root `div` is the `@container`). The mapping from
the old viewport breakpoints, chosen so the piano page looks as it did:
`sm-` → `@xl-` (36 rem, 576 px), `md-` → `@2xl-` (42 rem, 672 px), `lg-` →
`@4xl-` (56 rem, 896 px). So the wide layout (group labels, the icon strip,
the preset buttons, the Effects button) appears once the device itself is
896 px wide: the piano page from a 1024 px window, the home page's section
likewise, and a popover or a side panel only when it is that wide. The
save popover asks which manage button the container shows
(`getComputedStyle(wideControls).display`) rather than `matchMedia`. Two
things stay in JavaScript because they decide geometry, not style: the
number of octaves on the keyboard and the vertical keys below 640 px of
measured width (`measure`, a ResizeObserver on the keys). Shortcuts the
drum machine shares (`device-button-group-label`'s text sizes) still use
viewport breakpoints. Two of Kevin's classes that were never valid
(`lg-32px`, `!lg-slate-400`) became `@4xl-w-32px` and
`!@4xl-text-slate-400`.

The compact device menu (below `@4xl`) is an exclusive accordion of
`<details name="piano-compact-menu">` sections, Metronome, Presets,
Volume (open by default), Effects and More, so one panel shows at a time
and the menu stays short; native, no state.

## Phase 3 (later)

- 88 keys with a scrolling view; a transpose control; MIDI out; a
  keyboard-split of two sounds; latency work for Bluetooth MIDI and
  mobile.

## The staff (built 2026-10-04)

Kevin's ask, after the chord player's readout: the screen shows what is
sounding on a small treble staff beside the chord name, from the medium
width. `StaffReadout.svelte` is the chord player's drawing lifted into a
component (five lines from E4, a step half a line, ledger lines, the
accidental before the head, the view G2 to B6 with a note past either
end at the edge, an arpeggiator's note lit white with a halo), fed by
`spellChord(piano.sounding, flats)` where a flat key (F, B♭, E♭, A♭, D♭,
G♭) spells in flats and anything else in sharps. The chord player's
circle keeps its own embedded drawing (its geometry is the hole's).

## Arpeggiator (built 2026-10-04)

Kevin's ask: the chord player's arpeggiator on the piano. The arpeggiator
is now a class of its own, `src/lib/audio/arpeggiator.svelte.ts`
(`Arpeggiator<T>`), the chord player's code lifted out whole: a fixed grid
of the session tempo (metronome.bpm × tempoRatio, the session swing on
the odd steps) scheduled on the voice's context with a lookahead, patterns
lined up with bars, changes on the beat with the pending-chord and
rejoin rules, latch, and the settings persisted through a `read`/`write`
pair the owner supplies. Two modes: "replace" (the chord player: a hold is
a chord that replaces the last) and "add" (the piano: a key held while
others are down joins them at once, the sequence re-read every step, so a
chord built up a key at a time grows under the pattern; with nothing
down a key is a new chord, as the chord player's; under Latch the keys let
go in turn latch as the whole chord they made). `PianoEngine` owns one
(`piano.arpeggiator`, `ownArpeggiator` true for the piano only, never the
chord player's engine): `noteOn` goes into it while it is on, `noteOff`
out of it when it holds the key, so the on-screen keys, the computer
keyboard and MIDI all arpeggiate; the sounding path is `#soundOn` /
`#soundOff`, which the arpeggiator plays through, and the lit keys
follow the pattern. `setArpeggiator(on)` hands held keys back as a chord
(off) or takes the keys down into the pattern (on). Settings live under
the engine's preferences key (`stemshovel.piano.arp-…`) and in presets as
a top-level `arp` (`ArpSettingsSchema`, the same object the chord player
keeps under `chords.arp`; the chord player's engine ignores it). The
device: an Arpeggio group from the medium width, a split button (Arp,
double-click to latch, a padlock while latched; the caret opens the
shared `ArpeggiatorMenu.svelte`), a section in the phone's menu, "arp"
on the screen. **A single key plays as a chord** (Kevin's trick the
chord player has no need of): the piano gives its arpeggiator an
`expand` (`utils/chordFromKey.ts`, tested: the triad on that degree of the
lit key, thirds stacked up the scale, a major triad outside it or with no
key), and `guess` (on by default, `arp-guess` in the preferences, in
presets) makes one note held alone play as that chord in `#sequence`;
two or more keys play as held.

## The bass and the guitar (2026-10-03, 2026-10-04)

Two small sampled instruments beside the Grand Piano's tiers, from
FreePats' CC0 recordings: the Electric Bass (Finger Bass YR, twelve notes
E1 to D#2, an octave under the key, for the chord player's notes mode)
and the Acoustic Guitar (the Spanish classical guitar, forty-eight notes
G1 to C6). `src/lib/audio/sampledInstruments.ts` is the one module for
both: a spec per instrument (notes, transpose, release, level and cutoff
curves), `warmSamples` fetching the mp3s from static/kits/<id> nearest
middle C first, `loadSamples` decoding each as it lands, and
`startSampledInstrumentVoice` playing the nearest sample by the smallest
shift (an octave of the same pitch class counting as little, so the bass's
one octave covers the keyboard). Nothing is fetched at page load: the
engine asks for the files when the instrument is chosen (or the home demo
scrolls into view with it chosen), and until a note's own sample is
decoded the `synthVoice` stand-in patch for that instrument plays.
`scripts/instrument-samples.ts <id>` builds the files (mp3 VBR q2, mono,
a few seconds with a fade; about half a megabyte for the bass, one for the
guitar), committed so every stage serves them with nothing to upload.
