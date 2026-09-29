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
  Samples group; the phone menu) fetches the hires tier once, through the
  Cache API, so the next visit costs no download; the choice is
  remembered (`hires` in the preferences) and the tier comes back from
  the cache. The hires download starts the moment the button is pressed,
  beside whatever the standard tier still has to fetch (`loadingTiers`
  holds each tier's progress), and the button shows a spinner and the
  percentage until the last file is decoded, then lights. A note plays the two loaded layers on either side of its
  velocity, crossfaded with equal power (`pianoLayers.ts`, tested), so a
  hires layer replaces a standard one of the same number as it lands;
  letting go damps the string and, once the releases are in, plays the
  key's release sample. The filter only closes for a light touch now.
  Chromium decodes FLAC natively (33 ms a note); Safari has had FLAC
  since iOS 11. Not built: an mp3 fallback should a browser refuse FLAC
  (the button would then be hidden), pedal noises, sympathetic resonance.
- **Home page demo** (built 2026-09-30): a full-width section under the
  drum machine; the keyboard goes to it when it is the demo in view
  (the home page's `spaceTarget` now weighs the player, the drums and
  the piano).
- **The nav** (2026-09-30): an Instruments menu between Projects and
  Tools holds the drum machine and the piano; the footer has an
  Instruments row above the Tools row. On a phone the nav's three menus
  are icons alone, close together (the account button loses its name
  there), so they fit beside the brand.
- **Scale and chord help** as WebKeys: light the keys of a chosen key
  and mode; name the chord being held.
- **Record**: into the Idea Recorder as a take, or straight to a WAV
  through the offline path the drum machine uses.
- **The recorder's toolbar**: the piano beside the drums and the
  metronome, so a part can be sketched over a take.

## Phase 3 (later)

- 88 keys with a scrolling view; a transpose control; MIDI out; a
  keyboard-split of two sounds; an arpeggiator; latency work for
  Bluetooth MIDI and mobile.
