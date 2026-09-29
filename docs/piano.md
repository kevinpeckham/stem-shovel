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
  percentage. Pointer events on the board: each finger holds a note,
  sliding across keys moves it, pressing lower on a key plays louder.
  The computer keyboard by physical key code (`PIANO_KEY_CODES`): the row
  from Z is the first octave with its sharps on the row above, the row from
  Q the octave above, arrows for the octave, space for the pedal, escape
  for silence; the keys print the QWERTY letters. Web MIDI on request
  (`Connect MIDI`, Chrome and Edge): every input plays, note on/off with
  velocity, CC 64 as the pedal, all-notes-off.
- `/piano` page with a how-to; the Tools menu, the footer and the smoke
  list know it.

## Phase 2 (next)

- **A sampled piano**, the sound Kevin likes best. A CC-BY set such as
  Salamander Grand Piano (a subset: one sample every few semitones,
  two or three velocity layers, pitched in between with `playbackRate`;
  credit it like the drum kits) under `static/kits/piano/`, decoded on
  first play like a drum kit; `synthVoice` grows a sampled voice.
- **Home page demo** in the tools section, a third tab.
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
