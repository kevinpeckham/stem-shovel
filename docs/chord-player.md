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

- **Strum mode and Stop** (2026-10-04, Kevin): the separate auto-strum is
  gone; the strum itself is the mode. With `strum !== "off"` a press goes
  through `#autoHold`, whose first slot is the press's strum, so a tap
  strums once and a hold runs `strumPattern` (`constants/autoStrum.ts`,
  now with "once", the plain strum, whose scheduler stops after slot 0);
  `strumDirection` turns the pattern's strokes over (up) or alternates
  each time through; `strumLatch` (the Strum button's double click, a
  padlock icon) keeps a pattern after release, as the arpeggiator's latch
  does; `setStrum("off")` ends a running pattern, held chords ringing on.
  Presets keep the `autoStrum` key (pattern, speed, latch, swing; an old
  `on` is ignored) and demo setups say `strumPattern`/`strumSpeed`. Stop:
  `chordPlayer.autoPlaying` (a latched chord) or the pad playing lights a
  round Stop button in the box's free left corner (bottom on the arch,
  top on the bowl; on a phone beside the 7 pad while needed), disabled
  otherwise; it and Escape run `stopAll` (sustain lock and pedal off, every
  chord and pattern off, the pad stopped).
- **Share links** (2026-10-04, Kevin: as the drum machine's): the Share
  button beside UI (a Share section in the phone's wrench menu) copies
  `/chord-player#<payload>` and puts it in the address bar; the payload is
  `ChordShareSchema` (val/ChordShareSchema.ts: the piano preset data, the
  chord preset settings, the circle's look and key as `chordPlayer.uiSettings`,
  the session tempo) as JSON with every default dropped, base64url
  (`utils/encodeChordShare.ts`, `decodeChordShare.ts`, tested); decoding
  parses it through the schema, which puts the defaults back and refuses
  anything else. The page's `onMount` reads the hash and applies it over
  what the browser remembered (`chordPiano.applyPreset`,
  `chordPlayer.applyPresetSettings`, `applyUiSettings`, `metronome.setBpm`),
  with a notification; a hash that is not a link says so. Progressions and
  presets are not in a link.
- **Its own engine** (2026-10-04, Kevin: the home page's piano demo changed
  the chord demo's sound): `chordPiano`, a second `PianoEngine` with its own
  preferences key (`stemshovel.chord-piano`), is what the chord player, the
  pad, the device and its Effects menu (`<PianoEffectsMenu engine>`) drive;
  the looper hosts and taps it separately (a piano layer and a chords layer
  are separate sounds), the recorder captures it under `chords` and no
  longer makes piano and chords exclusive in a take. Samples are cached per
  module, so the second instance decodes nothing twice. An idea's `chords`
  still hold the chord settings only; the chord player's sound is not yet
  saved with a take.
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

## What shipped: phase 1 (2026-10-03)

The instrument and its page, as scoped: `src/lib/constants/circleOfFifths.ts`
(the twelve positions with pitch classes, the key centers, the keyboard
map, voicings, seventh types, strums), `src/lib/utils/circleGeometry.ts`
and `chordNotes.ts` (tested), `src/lib/audio/chordPlayer.svelte.ts` (the
state and the play through `piano`; settings under
`stemshovel.chord-player.*`), `CircleOfFifths.svelte` (the SVG: pointer
capture per finger, `data-index`/`data-quality` on the wedges, the centre
readout, the key mark) and `ChordPlayer.svelte` (the device: screen, Power,
Sound, Chords/Notes, Key, the 7 pad, the five preset buttons with a link to
the piano page to manage them, the Chords, Circle and Effects menus,
Volume). The piano's effects sliders moved into `PianoEffectsMenu.svelte`,
rendered by both devices. The page `/chord-player` loads what the piano
page loads; in the nav and footer, the sitemap, `isIndexablePath`, the
robots route, vercel.json's noindex exception, the smoke rows, the seeds
(`chord-player` user doc, `chord-player-page` copy) and the built-with
credits. Decisions taken from the open list: the number row and the row
below for the keyboard, no diminished ring, a progression's own table
when phase 2 comes. Verified on dev with Playwright: C major held is
60 64 67 on the piano, Shift adds the seventh, the key center turns the
keyboard's mapping with the circle, notes mode plays a single note, the
menus open, and the nav lists the instrument.

Kevin's first pass, the same day: a note the pedal holds **restrikes** on a
new press (`HeldNotes.on` returns true for a pedal-held note and the
engine's `#start` releases the old voice; the piano's keys too); a
**keyboard labels** toggle draws each wedge's key under its chord name
(`CHORD_KEY_LABELS`, `showKeys`); the device **badge** in dark text; a
**limiter** at the end of the piano's chain (`DynamicsCompressorNode`,
threshold −6 dB, ratio 20, 2 ms attack, in `pianoFx.ts` before the master,
so the looper's and recorder's taps carry it) and a chord's velocity
scaled by √(3 / notes) so a five-note voicing sums near a triad's level;
and the **phone layout**: one row of Power, Sound, a Key dropdown and a
wrench menu (the mode, keys, presets, volume and the three settings menus
as collapsible sections), captions gone, the 7 pad a round thumb button at
the device's lower left.

## What shipped: phase 2 (2026-10-03)

The Timing menu and the progression pad. `src/lib/audio/progression.svelte.ts`
is the pad: it listens to the chord engine's presses and releases
(`chordPlayer.listener`) and writes an entry per chord. Its beats are
onset to onset (`utils/chordRhythm.ts`, `jotLengths`): first the held
length when it lets go (under a beat and a half is one, under three two,
else four, at the metronome's tempo), revised when the next chord starts
to the time until then, so the time a mouse takes to reach the next wedge
is never a rest (Kevin's first pass found rests between quick chords). A
silence of two beats or more after the chord keeps the held length and
writes a rest of two or four beats; over eight beats is thinking time. A
chord pressed before the last lets go ends the last there. Jot is off by
default: it is a mode, not a loss. The entries are grouped by measure for the
screen (`measuresOf`; a straddling entry starts the next bar), kept under
`stemshovel.chord-player.progression`, and edited by picking one (beats 1,
2, 4; a rest in its place; remove), undo (fifty steps) and clear. Playback
runs on the piano's AudioContext with the lookahead scheduler: the chords
go through `chordPlayer.sound()` at their times (released a sixteenth
before the next, as in the MIDI) and a click of the pad's own is scheduled
sample-accurately on the same clock, so the two cannot drift; the pad
claims playback like every transport. The free-running metronome is the
click to jot against (the Timing menu's Click button), and its tempo, tap
and beats to the bar are the pad's. MIDI export is `utils/encodeChordMidi.ts`
on `utils/midiFile.ts`, the format-0 writer the drum machine's export now
shares. Saved progressions are the `progression` table (migration 0069;
`remote/progressions.remote.ts` mirrors the beats: an account's library,
every member reads, editors keep), loaded by the page with the piano
presets and handled in `ProgressionPad.svelte`'s Saved menu. The Circle
menu gained a dim on the chords outside the key, and the device a numerals
toggle (IV, beside the keyboard button) that writes every wedge's Roman
numeral relative to the key (`CircleOfFifths.svelte`: a table of twelve by
distance clockwise from the key's drawn index, per ring; the diatonic six
in accent). With the key labels up, a strip under the circle names the
other shortcuts (and the key labels are the piano's blue). The arch
layout (`chordPlayer.layout`, a View button): `circleGeometry.ts` now
describes a wedge as a slot (centre, angles, scale), `CIRCLE_SLOTS` the
circle and `ARCH_SLOTS` the arch, a 480 × 320 box with wedges 9 to 3 on
a 230-radius half circle, the two end wedges cut at the horizontal (15°
each, labels at 0.8), and 8 and 7 (4 and 5) as leg slots: rectangles whose
first edge is the end wedge's level face, stacked 32 units each straight
down, the rings' depths kept and the labels at 0.6; no slot for 6. Kevin
got there in steps: fans in the top corners, then under the arch, then
rectangles aligned with the end faces, half as tall, then the ends cut
flat. `CircleOfFifths.svelte` draws whichever set it is given, fonts
scaled per slot (label offsets floored at three quarters, since the small
fonts stop at 7), signatures only on full-size wedges. `ARCH_DOWN_SLOTS`
is the arch mirrored top to bottom, drawn when the key is not at the top
(`chordPlayer.drawnLayout`; the arch never rotates the positions by six,
it turns itself over): a bowl with I at the bottom for a thumb on a phone
(Kevin). Defaults after Kevin's pass: the dim on, the signatures off, the
key at the bottom (the arch a bowl). The keyboard map is relative to the
key's drawn index (`keyIndex`), so 1 and Q are the key wherever it sits;
the signatures run along the rim, rotated with their wedge. **Presets** (Kevin, the same day): the chord player's five buttons are
its own on the shared library: `piano_preset.chord_slot` (migration
0072), the data layer's slot helpers and the save/set-slot/site remote
functions take an `instrument` ("piano" by default, so the piano's calls
are unchanged), `resolvePianoSlots` and the browser overrides too.
`ChordPresets.svelte` is the rack: the buttons, and a manage menu that
saves the sound playing onto a button, puts any library preset on one (a
select per button), renames, clears, with the site's defaults for a
system admin; the link to the piano page is gone. A sustain pad joins the
7 pad; from @xl both are round pads in the box's free corners (the arch's
top corners, the bowl's bottom ones), a hand each. The arch is the default
layout, and the wedges' names come from `chordPlayer.wedgeLabels` (the
style's chord per degree with the 7 pad folded in), long names shrinking
to fit. **The arpeggiator** (Kevin): in the engine (`arp*` state persisted under
`stemshovel.chord-player.arp-*`). With `arp` on, `press()` and the pad's
`sound()` put the chord's notes into `#arpHeld` instead of sounding them;
a lookahead loop on the piano's context (`startLookahead`) schedules one
note per step (the metronome's beat over `ARP_RATES.perBeat`), on at the
step and off after `arpGate` of it, through `#arpSequence()` (held chords'
notes ascending through `arpOctaves`, ordered by `arpPattern`). A new
chord re-anchors the grid (`#arpRestart`), so chord changes land on the
press; `release()` drops the chord and, with `arpLatch`, keeps the last one
running; `allOff` stops it. The home demo passes `pad={false}`. The Electric Bass is sampled
(`audio/bassSamples.ts`: FreePats' twelve notes E1 to D#2 as mp3 in
static/kits/bass from `scripts/bass-samples.ts`, the pitch class's sample
shifted by octaves, an octave under the key; the `synthVoice` bass patch
stands in until they decode). The arpeggiator is a split button at
desktop (Arp, and its settings on the caret) and a wrench section on a
phone; `ChordPresetSettings.arp` saves it with a preset. **The readout** (Kevin): the chord name at the hole's centre on every
layout, and under it the sounding notes from `chordPlayer.soundingSpelled`
(`utils/noteSpelling.ts`: letter, accidental, octave and the treble-staff
step, flats for positions 0 and 6 to 11, sharps for 1 to 5), written as
names or drawn as a small staff in `CircleOfFifths.svelte` (five lines,
ledger lines, noteheads with accidentals), per `noteReadout`. A second
keyboard map, by degree (`DEGREE_KEY_CODES`, `chordPlayer.keyMap`,
the Circle menu): the number row is I to VII then the five chromatic roots
rising (♭II ♭III ♯IV ♭VI ♭VII), the row below the minors on the same
roots, so 1 4 5 is I–IV–V; Kevin asked for 1 to 7 and left the rest open,
and the chromatic five on 8 to = in rising order keeps every root on one
column with its minor beneath it.

**Styles** (Kevin, the same day): `constants/chordStyles.ts` lists the
styles and the recipes (intervals above the root and a name suffix);
`utils/styledChord.ts` picks a recipe by style, degree (fifths from the
key; a minor's degree is its own root's, three fifths on from the wedge)
and quality, and the 7 pad's raised recipe, tested. `chordNotes.ts` gained
`voiceChord` (any intervals through the voicings: the triad moves as
before, the extensions stay above), with `chordMidi` on top of it. The
engine's `style` is persisted and saved in `ProgressionData.style`
(optional, no migration), applied when a progression opens; the Chords
menu's Style select sits above Voicing and the screen line names a style
other than plain. Custom styles (Kevin, the same day): `chord_style`
rows (migration 0071; `ChordStyleSchema.ts`: twelve degrees per ring,
each a plain and a held recipe id; `chordStyles.remote.ts` after the
progressions), loaded with the page into `chordPlayer.customStyles`; the
engine's `style` is a built-in id or `custom:<id>`, `recipe()` reads the
custom rings or falls back to `styledChord`, and `ProgressionData.style`
is a free string now. `ChordStyleEditor.svelte` is the editor in the
Chords menu (`builtinStyleData` writes a built-in out as a starting
point); a progression naming a style the account no longer has keeps
playing its notes and leaves the style alone. **Notes and panels** (Kevin, the same day): the page holds the device in
a `FloatingPanel` with a pop-out from lg, as the looper's page does, and
for a member a second panel with `ProgressionNotesPanel.svelte`, the
recorder's editor over the pad's `notes` (kept per browser with the pad,
saved with the row: `progression.notes`, migration 0070). The panel
autosaves through `saveProgressionNotes` when the pad is a saved row, and
a first note on an unsaved pad creates the row (`saveProgression` with the
pad's data, named from the pad or "Untitled progression"), so notes stand
alone; emptying the notes of a row without chords removes it
(`deleteProgressionIfEmpty`), as an idea goes. The page's `saved` list is
bound through `ChordPlayer` to the pad so both panels see one list. The
pad and the Timing menu show from the `@xl` container
breakpoint: a phone keeps to the circle (Kevin). The home page's demo,
when it comes, passes `pad={false}`.

## What shipped: phase 3 (2026-10-04)

"Chords" is a `LoopSource` and a `RecorderSource` beside the piano. The
looper taps `piano.output()` a second time under its own gain
(`#tapSource("chords", …)`), so arming either captures the one engine;
layer labels start "Chords", `hasSource` and the latency shift treat it as
the piano. The recorder's `instrumentStreams` returns the piano's capture
stream under `chords` too, and the page keeps the two mutually exclusive
in the take. Each page has a `ChordPlayer` in a `FloatingPanel` (`pad`
off, the site's chord presets, the account's presets and custom styles)
with a toolbar button, `spaceOwner` "chords" for the keyboard, and saves
`ChordPresetSettings` as `IdeaInstrumentsData.chords` (a take with chords
in it, a loop with a chords layer), applied when an idea loads.

## What shipped: learn mode, demos, inversions, strum (2026-10-04)

`constants/demoProgressions.ts` writes the demos by degree (fifths from
the key and a ring, beats, a seventh flag); `progressionPad.loadDemo`
turns one into entries in the current key through `chordPlayer.drawnIndexOf`
and `chordAt` (the chord-mode half of `press`, now a method the pad can
call), opens it on the pad and switches learn mode on. Learn mode lives
in the pad: `learnIndex` and `learnTarget` (rests skipped), the listener's
`down` advancing the cursor on the right wedge and jotting nothing while
learning; `CircleOfFifths` outlines the `target` wedge and the readout
says "Next: …" while nothing sounds. Inversions: `voiceChord` takes an
`inversion` (the lowest triad notes up an octave before the voicing lays
them out), `CircleOfFifths` turns a short vertical drag within the pressed
wedge (18 px a step, two steps) into `oninvert`, and `chordPlayer.invert`
re-presses the wedge at that inversion without a strum, the name gaining
the bass note after a slash. The strum has a direction (down, up,
alternate) and an accent (top or bottom note louder) in `#strike`.

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

Shipped 2026-10-03 (see "What shipped: phase 2" above); phase 3 shipped 2026-10-04.

- Timing menu (the metronome engine, tap tempo, time signature, click).
- The progression pad with hold-quantized beats and rests, measures,
  playback with click, undo/clear, MIDI export on a shared format-0
  writer. Per-browser persistence; saved progressions for signed-in users
  (`progression` table, migration 0069).
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
