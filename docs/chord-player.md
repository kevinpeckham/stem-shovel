# Chord Player: the piano's sounds on a circle of fifths

Scoped 2026-10-03 at Kevin's request: a new instrument that plays every
sound the piano plays, with the piano's effects, through the Circle of
Fifths interface of his earlier project
(https://github.com/kevinpeckham/chord-player, live at fifths.app). Rolled
out in phases; by the end it is an input source for the looper and the
Idea Recorder, in the nav and footer, with its own user doc and page copy,
a demo on the home page, in the sitemap and indexable, usable signed out.

## What the chord player is

A circle of twelve positions, each a wedge for the **major** chord (outer
ring) and its relative **minor** (inner ring), with the key signature
beside it; a **diminished** chord per position exists in the data. Press
and hold a wedge and the chord sounds for as long as it is held; a second
finger on a sounding wedge, Shift, or a **7** pad adds the seventh
(dominant or major seventh for a major chord, a setting; minor seventh for
a minor chord). **Notes mode** turns the wedges into single chromatic
notes. The **key center** rotates the circle so any key sits at twelve
o'clock (or six). **Voicings**: standard, spread, rich, bass and root bass
(the enhancer in `chordEnhancer.ts` derives them from the triad). A
**progression pad** jots every chord played with its held length
quantized to beats at the current tempo (and rests from the gaps), wraps
by measures per the time signature, plays the progression back on a
lookahead scheduler with an optional click, and exports it as MIDI. The
original synthesizes its sound with oscillators (sine, triangle, square,
sawtooth) and a reverb; everything here is what Stem Shovel replaces with
the piano's engine.

## What already exists here

- **The piano engine** (`src/lib/audio/piano.svelte.ts`, docs/piano.md):
  `noteOn(midi, velocity)` / `noteOff(midi)`, six sounds (Grand Piano in
  three sample tiers, Electric Piano, Organ, Synth Lead, Pad, Pluck), the
  effects (reverb, delay, chorus, tremolo, fuzz, wah, phaser, tone,
  rotary), presets (`currentPreset`, `applyPreset`, the site's five and an
  account's library), `hostContext(ctx)`, `output()`, `captureStream()`,
  MIDI in, `warm()`, `allOff()`, the power switch. The chord player plays
  **through this engine**: a chord is a set of MIDI notes it holds down
  and lets go. One instance, as the piano's own, so a chord on the circle
  and a note on the keys share the sound, the effects and the preset; the
  piano's `Piano.svelte` menus (Sound, Effects, Presets, Volume) are the
  chord player's menus too, lifted into a shared `PianoSoundMenus` piece
  where the markup is the same.
- **The device idiom**: `device-chrome`, `device-screen`, button groups,
  `ContextMenu` menus, `SourceButton`, container queries (docs/looper.md).
- **Page copy** (docs/page-copy.md), **user docs** (`scripts/user-docs`),
  the **Instruments** nav menu and the footer row, `isIndexablePath`,
  the sitemap, the home page demos (`PianoDemo`, `SongPlayerDemo`), the
  looper's and recorder's source rows (`LoopSource`, `RecorderSource`).
- **The metronome engine** and **tap tempo** (shared with the looper and
  the drum machine); the looper's and recorder's transports.

## The design

### Sound

Chords are MIDI note sets, built from the circle's data by a pure util
(`src/lib/utils/chordNotes.ts`, tested): root pitch class + quality →
intervals (major 0 4 7, minor 0 3 7, diminished 0 3 6; sevenths +10 or
+11) → the voicing's octave placement (standard: root position around C4;
spread: the fifth up an octave; rich: a doubled root above; bass: the root
an octave below; root bass: a lone bass root plus the triad). Played with
`piano.noteOn` at a velocity from the setting (and later from how fast the
wedge was pressed, if pointer pressure is ever worth it) and released with
`piano.noteOff` on pointer up, so the piano's envelopes and sustain apply.
A **strum** setting (off, slow, medium, fast) staggers the note-ons by a
few milliseconds each, low to high, which the oscillator original could
not do and which makes the sampled Grand Piano sound played rather than
pasted. **Notes mode** plays one note.

### The circle

`CircleOfFifths.svelte`: an SVG with two rings of twelve wedges (major
outside, minor inside) and the key signatures, built from
`circleGeometry.ts` (ported: `wedgePath`, `textCoords`) and
`circle-of-fifths-data.json` (ported, with MIDI pitch classes added), the
key center rotating the whole thing. Pointer events on the wedges
(`pointerdown`/`up`/`cancel` with capture, several pointers at once), the
second-finger seventh, keyboard play (the number row and letters mapped to
the twelve positions, Shift for the seventh, as the piano maps keys) and
MIDI in through the piano's existing connection. The device's screen shows
the chord names sounding (the center display of the original), the key
and the preset, with "edited" as the piano's does.

### Settings (the menus on the device)

- **Sound**, **Effects**, **Presets**, **Volume**: the piano's, shared.
- **Chords** menu: voicing, seventh type (dominant / major 7), strum,
  velocity, octave for notes mode, chords/notes mode.
- **Circle** menu: key center, key at the top or the bottom, show key
  signatures, show Roman numerals for the key (I ii iii IV V vi vii°),
  highlight the key's diatonic chords (the six wedges that belong to the
  key center, the original's affordance for beginners).
- **Timing** menu (phase 2): tempo + tap, time signature, click, accent.

### The progression pad (phase 2)

The original's best idea for songwriters: a strip under the circle that
jots every chord as it is played, with its length in beats from how long it
was held (quantized at the tempo; gaps become rests), wrapped by measures.
Edit (delete last, clear, undo), play back on a lookahead scheduler with
the metronome's click, loop, and export as `.mid`. Kept per browser; a
signed-in user can save it with a name (a `progression` row, account-
scoped like a beat) and load it. The looper and the recorder get it for
free because the pad plays through the same engine.

### As an input source (phase 3)

The chord player is a sixth `LoopSource` and `RecorderSource`, "Chords",
beside the piano: it shares the piano engine, so capture is the piano's
`output()` / `captureStream()` and nothing new is tapped; what changes is
that the pages open the circle's panel for that source (a `FloatingPanel`
of its own, as the piano's) and settings saved with an idea or a loop
include the chord player's (`IdeaInstrumentsDataSchema.chords`). Toolbar
buttons on the looper and the recorder open the panel.

## Phases

### Phase 1: the instrument and its page (first release)

- `src/lib/utils/chordNotes.ts` (+ tests), `circleGeometry.ts` (+ tests),
  `src/lib/constants/circleOfFifths.ts` (the data), `ChordPlayer.svelte`
  (device: screen, circle, the 7 pad, mode toggle, key center buttons,
  the piano's Sound / Effects / Presets / Volume menus shared, a Chords
  menu and a Circle menu), `src/lib/audio/chordPlayer.svelte.ts` (the
  small state: mode, voicing, seventh, strum, key center; sounding chords;
  plays through `piano`; remembered per browser).
- `/chord-player` page: page copy doc `chord-player-page`, the device in a
  docked panel, the keyboard and pointer play, works signed out.
- Nav Instruments menu and footer row, `isIndexablePath`, sitemap,
  robots and vercel.json rules, smoke rows, the user doc `chord-player`
  (seeded), `PAGE_COPY` and `COPY_PAGES`.
- The `/built-with` credit: the circle geometry after Eric Coleman and
  Håken Lid, the idea after Quinn Raymond's Q-RAY, as the original credits.

### Phase 2: tempo and the progression pad

- Timing menu (the metronome engine, tap tempo, time signature, click).
- The progression pad with hold-quantized beats and rests, measures,
  playback with click, undo/clear, MIDI export (`encodeDrumMidi.ts` has a
  format-0 writer to generalize). Per-browser persistence; saved
  progressions for signed-in users (`progression` table, migration).
- Diatonic highlighting and Roman numerals.

### Phase 3: everywhere the piano is

- "Chords" as a source on the looper and the Idea Recorder with its own
  panel and toolbar button; settings saved with ideas and loops; the
  recorder's and looper's docs and user docs updated.
- The home page demo (`ChordPlayerDemo`, the circle alone with the site's
  preset, no pad), beside the piano demo.
- Phone layout: the circle fills the width, the menus in the wrench menu
  as the piano's.

### Later, if wanted

- Voicings the original planned: sus2/sus4, sixths, add9, power chords.
- "Wait for me" learn mode and auto-play demos of public-domain
  progressions (the original's Phase C).
- A strum direction and per-note velocity curve; chord inversions by
  dragging within a wedge.

## Decisions taken

- **One engine, not a copy.** The chord player does not get its own
  samples, effects or presets; it drives the piano's. A preset saved from
  either is a preset of both.
- **The circle and the piano on one page?** No: each has its page; on the
  looper and the recorder they are two panels sharing one sound. Playing
  the circle while the piano's panel is open is fine (same engine).
- **The original's oscillator voices are not ported.** The piano's Synth
  Lead and Pad cover the ground; sine/square/sawtooth as separate voices
  would be a step down from what the piano already has.

## Decisions to confirm

- The wedge-to-key mapping for computer-keyboard play (twelve positions:
  the number row 1–0 then - = for majors, Q–] for minors?).
- Whether the diminished ring is drawn in phase 1 (the original has the
  data but its UI shows two rings; a third thin ring is easy).
- Whether a saved progression should be an idea kind, like a loop, so it
  shows in the Idea Recorder's list, or its own table (the doc assumes its
  own table).
