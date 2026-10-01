# A drum machine (plan)

Status: **delay and reverb built** (2026-09-28, unreleased), as planned
under "Reverb and delay" below: `src/lib/audio/drumBus.ts`, sends per row,
fx per project, share links version 5.
**Beats for a song and the recorder's pattern picker shipped in
v0.48.0** (2026-09-28): `?song=` on the page, `songForBeat` in data.ts,
Save with a `songId`, a demo from the open pattern through the demo
upload path; the compact view's pattern ComboBox. **The timeline and the pattern
generator built 2026-09-28** (see below). Remaining from Phase 3: own
samples, MIDI input. Reverb and delay were built the same
day, see below.
**Room kit and saved beats shipped in v0.43.0** (2026-09-27): a
second sampled kit from Groovie's other variants; the first Phase 3 item,
the `beat` table (migration 0061) with Save and a Beats menu on the page
for a signed-in member (account-wide, editors write). Still to come in
Phase 3: beats attached to songs with the song's tempo seeding them and a
render to a demo, the timeline, the generator, own samples, MIDI input.
**Presets and meters shipped in v0.42.0** (2026-09-27): 22 preset
beats in `src/lib/constants/drumPresets.ts` (a readable row-string form,
`drumPresetProject` builds them, every one tested through the codec),
a Presets menu with Undo and a shift-to-add mode; a meter per pattern
(4/4, 3/4, 6/8 with 12 and 24 steps), share links at version 3.
**Phase 2 shipped in v0.41.0** (2026-09-26): patterns as tabs
with the end-of-cycle switch, velocity per cell, pan per row, humanize,
WAV and MIDI export (`src/lib/audio/drumRender.ts` shares one step player
between the live engine and the offline render), the drums in the Idea
Recorder's toolbar and phone menu with the metronome hand-off, share
links at version 2 (version 1 still read; the model is a `DrumProject`
of `DrumPattern`s in `DrumPatternSchema.ts`). Not built: a third kit and
the kit per row, which wait for a second sampled kit.
**Phase 1 shipped in v0.39.0** (2026-09-26): `/drum-machine`, the
engine in `src/lib/audio/drumMachine.svelte.ts`, the kits in
`src/lib/audio/kits/`, the model and share-link codec in `src/lib/utils/`
(`drumPattern.test.ts` pins every link that has been shared), the
component `DrumMachine.svelte`. Decisions taken: both kits; share links
from the first day; 4/4 only (8, 16, 32 steps; 12 and 24 wait for a
request); the Idea Recorder waits for Phase 2; the level sliders show
from sm up and a phone has mute and solo. The share link is the
base64url string alone (the version is its first byte), so the hash has
no prefix. Phases 2 and 3 below are still the plan.

Kevin's brief: a simple
drum machine on its own standalone page, built so it can grow in complexity
over time. Two precedents he likes: [orDrumbox](https://www.ordrumbox.com)
([source](https://github.com/cadeli/ordrumbox-v2)) and
[Groovie](https://maximecb.github.io/groovie/)
([source](https://github.com/maximecb/groovie)).

## Swing, and how to prove it reaches the audio

Swing is one rule, `src/lib/utils/drumSwingDelay.ts`, with a grid per
project (`swingGrid`, share links from version 4, 1/16 for older links
and stored projects). On the 1/16 grid every second sixteenth (the odd
steps) lands late by up to a third of a sixteenth and the eighths never
move, so a pattern with nothing on the odd sixteenths (hats on the
eighths, kick and snare on the beats, which is most rock) sounds the
same at any swing: that is how an MPC's 1/16 swing behaves, and it is
what Kevin heard as "swing does nothing". On the 1/8 grid the off-beat
eighths (steps 2, 6, 10, 14) land late by up to a third of an eighth and
the sixteenths beside them stay put. The live engine, the WAV render and
the MIDI file all use the rule; the Shuffle preset is on the 1/8 grid.

`bun run check:swing` (`scripts/drum-swing-check.mjs`) is the proof: it
renders a sixteenth-note pattern and an eighth-note pattern through
`renderDrumPatternWav`, the same step player the live engine feeds,
straight and fully swung on both grids, finds the onsets in the WAV and
checks that exactly the right notes moved by exactly the right amount. It
needs the dev server (it imports the source modules by URL). The unit
tests cover the rule itself (`drumSwingDelay.test.ts`, `drumPattern.test.ts`)
and the MIDI ticks.

## The samples and their attribution

The sampled kits are Groovie's CC0 one-shots (https://github.com/maximecb/groovie,
`samples/`), which carry no further provenance; Groovie's README states the
licence and nothing else about their origin. CC0 asks for no attribution,
but the app gives it anyway: on `/built-with` and in the user doc. Each of
our files is one Groovie file renamed, unchanged (44.1 kHz, 16-bit, mono):

| Voice      | Acoustic (`static/kits/acoustic`) | Room (`static/kits/room`) |
| ---------- | --------------------------------- | ------------------------- |
| kick       | kick_01                           | kick_12                   |
| snare      | snare_01                          | snare_09                  |
| hat-closed | hat_closed_01                     | hat_closed_06             |
| hat-open   | hat_open_01                       | hat_open_02               |
| clap       | clap_01                           | clap_02                   |
| rim        | rimshot_01                        | rimshot_02                |
| tom-low    | tom_low_01                        | tom_low_02                |
| tom-mid    | tom_mid_01                        | tom_mid_05                |
| tom-high   | tom_hi_01                         | tom_hi_05                 |
| ride       | ride_01                           | ride_02                   |
| crash      | crash_01                          | crash_02                  |
| cowbell    | cowbell_01                        | cowbell_02                |

A candidate sample from elsewhere is checked against these by audio, not
by name, before it goes in (Groovie's own names say nothing about where a
file came from). The Room kit is about 1.2 MB, the Acoustic 0.6 MB; a kit
is fetched only when chosen.

## What the precedents teach

**Groovie** (MIT code, CC0 samples, no backend, no framework). A 16-step
grid with a row per sample, mix controls per row (pan, level in dB, delay
send), tempo, swing and humanize, up to 64 patterns with a timeline to
arrange them, and the whole project shared as a base64url string in the
URL hash with a version number in front so old links keep opening. Its
`design.md` is worth reading in full: the reasoning behind every control
is written down. Playback is a lookahead scheduler on the Web Audio clock
(0.1 s window), the same shape as our metronome. It also records the iOS
lessons we learned ourselves: create the AudioContext on the first touch,
never on load; declare the audio session as playback so the ring/silent
switch does not mute it. Its samples are public domain and can be reused
with a credit; its code is MIT and can be read for approach, though ours
is Svelte and will not copy it.

**orDrumbox** (GPL-3). Far larger: per-note pitch, volume and pan, per-track
swing and loop points, retrigger and Euclidean fills, a soft synth with
FM, filters and LFOs, track effects, WAV and MIDI export, MIDI controllers,
finger-drumming on the keyboard, kits from dropped folders, a pattern
generator, an MCP server. Its `docs/pattern-json-format.md` is a good
reference for what a mature pattern model carries. **The GPL-3 licence is
incompatible with our Apache-2.0 code: read it for ideas, copy nothing,
not the samples either** (their licence is not stated separately).

The gap between them is the roadmap. Groovie is the shape of v1, with a
model designed from the start so that orDrumbox's features have somewhere
to go.

## What already exists here

- **The metronome engine** (`src/lib/audio/metronome.svelte.ts`): a
  lookahead scheduler (0.1 s window, 25 ms tick) on its own AudioContext,
  tempo and beats to the bar as `$state`, preferences in localStorage,
  tap tempo (`utils/tapTempo.ts`, `BPM_MIN` 30 to `BPM_MAX` 300). The drum
  machine schedules the same way; the scheduler loop should be lifted into
  a shared helper both engines use.
- **Tool pages** (`/tuner`, `/metronome`): public, indexable, a device
  panel in `max-w-article`, an InfoTip on phones. Each needs the same
  registrations: footer link, `isIndexablePath.ts`, the X-Robots rule in
  `vercel.json`, `robots.txt`, `sitemap.xml`, a smoke row.
- **Device chrome** shortcuts in `uno.config.ts` (`device-chrome`,
  `device-window-bevel-md`, `device-screen`, `device-button-*`), the
  `ContextMenu` and `ComboBox` popovers, `InfoTip`.
- **The Idea Recorder's tools menu** on phones (wrench) and toolbar on
  larger screens, where the metronome already sits as a compact view; a
  compact drum machine can join it the same way.
- `utils/encodeWav.ts` (Float32 channels to a WAV Blob) for export;
  `utils/audioSession.ts` for iOS; `audio/midi.ts` reads Standard MIDI
  Files (a writer would be new).
- The CSP allows `media-src 'self' blob:` and `worker-src 'self' blob:`,
  so samples served from `static/` and any future AudioWorklet work as is.
- A song's tempo is its "tempo" change at position 0 (`song.changes`), so
  a beat can later take its tempo from a song.

## Phase 1: one pattern, one page

`/drum-machine`, public and indexable, like the metronome. One pattern, no
account needed, everything in the browser.

| Control          | Does                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grid             | Rows are voices, columns are steps. Tap a cell to toggle it; drag across cells to paint. The playing column lights up. Beats are marked every 4. |
| Play / Stop      | Space bar too. Stop returns to step 1.                                                                                                           |
| Tempo            | 40 to 240 bpm, the metronome's steps, slider and tap tempo.                                                                                      |
| Steps            | 8, 16 or 32 (half a bar, a bar, two bars of sixteenths in 4/4); 12 or 24 for 3/4 and 6/8. Changing it keeps the cells that still fit.            |
| Swing            | 0 to 100 %: the off-sixteenths land late by up to a third of a step, the MPC's range.                                                            |
| Per row          | Level (slider, silent at the bottom), mute, solo, and the voice picker (a ComboBox over the kit).                                                |
| Kit              | Two to start: an acoustic kit (samples) and an electronic kit (synthesized, no files).                                                           |
| Clear, Copy link | Clear empties the grid; Copy link puts the pattern in the URL and copies it.                                                                     |

**Default voices** (8 rows): kick, snare, closed hat, open hat, clap, rim,
low tom, high tom. A row's voice can be swapped for any voice in the kit,
and a ninth or tenth row added (ride, crash, shaker, cowbell), up to 12.
An open hat chokes a closed hat on the same step, as on a real kit.

**Starting state**: a four-to-the-floor pattern at 100 bpm rather than an
empty grid, so the first press of Play makes a sound (the same reasoning
as the tuner's demo on the front page). The pattern, tempo, swing and kit
persist in localStorage (`stemshovel.drum-machine`), and a URL with a hash
overrides them.

### Sound

Two kinds of voice behind one interface: `play(ctx, when, gain, out)`.

- **Sampled**: an `AudioBufferSourceNode` from a decoded file. The acoustic
  kit takes 8 to 12 of Groovie's CC0 one-shots (kick, snare, hats, claps,
  rims, toms, ride, crash: 10 to 50 KB each as WAV, under half a megabyte
  for the kit), credited on `/built-with`. Files live in
  `static/kits/<kit>/<voice>.wav`; the kit is fetched when the page opens
  and decoded on the first touch (iOS refuses a context made before one).
- **Synthesized**: a function of oscillators, noise and envelopes. Kick: a
  sine sweeping 150 to 50 Hz over 40 ms with a 300 ms decay. Snare: a
  200 Hz triangle plus band-passed noise, 150 ms. Hats: high-passed noise,
  50 ms closed, 300 ms open. Clap: three bursts of noise 10 ms apart. Toms:
  sines at 200 and 120 Hz with a short sweep. Rim: a 1 kHz sine, 20 ms. No
  files, no decode, works offline, and it is the 808-flavoured kit people
  expect from an "electronic" setting.

Each hit goes through the row's `GainNode` into a master `GainNode` and
the destination; a `StereoPannerNode` per row is a one-line addition for
Phase 2. Timing is the metronome's scheduler: every 25 ms, queue the
steps whose time falls within the next 100 ms, with swing added to odd
steps. The step highlight comes from a `requestAnimationFrame` loop that
compares the audio clock with the queued step times, rather than one
`setTimeout` per step as the metronome does; a grid has sixteen columns
to light a bar, not one.

### Data

A pure model in `src/lib/utils/drumPattern.ts`, tested:

```ts
interface DrumPattern {
	v: 1;
	bpm: number;
	swing: number; // 0..1
	steps: 8 | 12 | 16 | 24 | 32;
	kit: "acoustic" | "electronic";
	rows: { voice: string; level: number; mute: boolean; cells: number[] }[];
}
```

`cells` holds 0 or 1 now and a velocity (1 to 3: ghost, normal, accent) in
Phase 2 without changing shape. The URL form is `#<version>.<base64url>`:
a version byte, then tempo, swing, steps, kit, and per row the voice index,
level and cells packed as bits. A 16-step pattern of 8 rows fits in about
40 characters. Groovie's bit-level tricks (guessing each row from the last
pattern, run-length cells) are for its 64-pattern songs; one pattern does
not need them, and the version byte means they can come later without
breaking links. `encodePattern` / `decodePattern` round-trip tests and a
list of pinned links, as Groovie keeps, guard the format from the first
day.

### Code

- `src/lib/audio/scheduler.ts`: the lookahead loop as a small class
  (`start(onStep)`, `stop`, the window and tick constants), used by the
  metronome and the drum machine.
- `src/lib/audio/drumMachine.svelte.ts`: the engine singleton (pattern,
  running, step as `$state`; `toggleCell`, `setBpm`, `setSwing`,
  `setSteps`, `setKit`, `setRow`, `load`, `save`), like the metronome's.
- `src/lib/audio/kits/index.ts`, `acoustic.ts`, `electronic.ts`: the voice
  interface, the sampled kit's file list and decoder, the synthesized
  voices. Pure functions of an AudioContext, testable with
  `OfflineAudioContext` where it matters (a hit renders non-silent).
- `src/lib/utils/drumPattern.ts` (+ tests): the model, defaults, the
  starting pattern, resize, encode / decode, swing timing
  (`stepTime(index, bpm, swing)`).
- `src/lib/components/DrumMachine.svelte`: the device panel, full view
  only in Phase 1. Grid cells are buttons with `aria-pressed`; rows are
  labelled; the column header carries the beat numbers.
- `src/routes/drum-machine/+page.svelte`, and the six registrations a
  tool page needs. A user doc section in `scripts/user-docs/` once it is
  in the recorder.

**Phone layout**: 16 columns at 390 px wide is 20 px a cell with the row
labels, which is too small to tap. Groovie scrolls the grid sideways. The
plan instead shows a bar as two rows of eight on a phone (beats 1 to 2
over 3 to 4), which keeps every cell at 40 px and the whole bar on screen;
32 steps scroll. Mix controls fold behind each row's label on a phone, as
Groovie's do.

**Size**: the acoustic kit is the only weight, and it loads only on this
page. Nothing new in the app bundle beyond the component.

Estimate: two to three days for Phase 1 including tests, the phone
layout and the e2e pass.

## Phase 2: patterns and the recorder

- **Several patterns** (up to 8) as tabs above the grid: new, copy,
  delete; switching while playing takes effect at the end of the bar.
  The URL hash carries them all.
- **Velocity per cell** (tap cycles ghost, normal, accent; long-press for
  a menu on touch), **pan per row**, **humanize** (a few ms and a few dB
  of scatter).
- **In the Idea Recorder**: a "Drums" entry in the tools menu and a
  compact view in the toolbar (toggle plus the tempo, like the metronome's
  compact view). It plays through a take in headphones, exactly as the
  metronome does and with the same separation from the microphone. The
  metronome and the drum machine share one tempo on that page, and only
  one of them plays at a time.
- **Export**: render the pattern (or a chosen number of bars) with an
  `OfflineAudioContext` and download it as WAV through `encodeWav`; a
  Standard MIDI File writer (General MIDI drum notes: 36 kick, 38 snare,
  42 / 46 hats, 39 clap, 37 rim, 45 / 50 toms) so a beat opens in a DAW.
- **A third kit**, and the kit as a choice per row rather than per
  pattern, once there is more than one sampled kit.

## Phase 3: beats that belong to songs

- **Saved beats**: a `beat` table (`account_id`, `user_id`, `name`, `data`
  JSON with the version inside, `song_id` nullable, timestamps) so a beat
  can be kept, listed on the recorder's page beside ideas, and attached
  to a song ("the demo's beat") or an idea. Deletes join `cascade.ts`.
- **A song's tempo and meter** set the beat's defaults when it is opened
  from a song page; the beat can be rendered as a demo (a WAV uploaded
  through the demo path) or a stem.
- **A timeline** to arrange patterns into a song, as Groovie's (built,
  see "Timeline"); a **pattern generator** from a style and a density, as
  orDrumbox's (built, see "Pattern generator").
- **Own samples**: a kit per account from uploaded one-shots (Blob,
  counted against storage), and **MIDI input** for finger drumming.

## Pattern generator (built 2026-09-28)

`src/lib/constants/drumGenerator.ts` holds a style table in the presets'
spirit: per style a bar of 4/4 as sixteen characters per voice and a bar
of 6/8 as twelve, `X` `x` `o` the backbone (always there), a digit a
maybe with its chance in tenths, `.` never, plus an optional `ghosts`
string of maybes that come out as ghost notes. `generateDrumPattern
(style, density, from, seed)` (`src/lib/utils/generateDrumPattern.ts`)
draws a pattern in the shape of `from`: its meter and steps (3/4 takes
the first three beats of the 4/4 bar; an eighth-note grid every other
character; two bars draw each bar on its own), its rows with their
levels, pans, mutes and sends, a row added for a voice the style plays
that the pattern lacks (within `MAX_DRUM_ROWS`), a row the style does not
play kept silent. Density scales every chance: 0 leaves the backbone, 0.5
is the chance as written, 1 doubles it. The seed (`seededRandom`,
mulberry32) makes the draw repeatable for the tests; the engine draws a
fresh one per press. `drumMachine.generate(style, density, mode)` puts the
pattern in place of the open one or adds it, and keeps the project for
`undoPreset` like a preset does. The Generate menu at the foot holds the
style, its hint, the density and the two buttons. Not built: tempo or
kit suggestions per style (the user's stay), and a seed in the link.

## Text-to-Beat (prototype, built 2026-09-28)

A beat from a description through a language model, Kevin's ask: an
open-weight frontier model by preference. `src/lib/server/textToBeat.ts`
goes through Vercel's AI Gateway like the song check, over its
OpenAI-style REST endpoint with `reasoning: { effort: "none" }`: the
finding of the first afternoon was that a thinking model (Kimi K2.6,
DeepSeek V4 Flash) spends two to three and a half minutes reasoning
about a drum pattern and answers no better, while the same Kimi with
reasoning off answers in about four seconds for a tenth of a cent
(K2.5 in two). The model is `TEXT_TO_BEAT_MODEL` (default
`moonshotai/kimi-k2.6`; the gateway also lists DeepSeek V3.2 and V4,
Qwen 3 Max and 3.8, MiniMax M3, so comparing musicality is an env
change; DeepSeek V3.2 and Qwen3 Max were both fine and about 3 s).
The system prompt names the voices, the notation (the presets' row
strings: `.` `o` `x` `X`), the open pattern's meter and length, the rows
it already has, and an example of exactly that shape built from the
starting beat; the model replies with JSON (`TextToBeatReplySchema`:
rows, optional bpm, swing as a percentage and a note). `parseTextToBeatReply` (a util,
tested) takes the first JSON object out of whatever prose or fences the
model adds, validates it, insists on the row length, and reads the rows
through `drumPresetProject`; a reply that fails goes back to the model
once with the reason. Every call is logged in `ai_request` (kind
"text-to-beat", tokens, duration, the parsed pattern), visible on /admin.
The remote function (`textToBeat.remote.ts`) is open to anyone at the
machine while the gateway is configured, 20 an hour per user or address.
The client (`DrumMachine.svelte`, the Text-to-Beat menu, shown when the
page's load says `aiAvailable()`) sends the description with the open
pattern's shape and places the answer with `drumMachine.placePattern`
(undo as for a preset; the tempo and swing come along). Not built: a
conversation (each ask is fresh), the model's choice of meter or length,
a seed or the description in the link. Open question for the prototype:
which model plays best; the log has the answers per model.

## Timeline (built 2026-09-28; its row hidden since v0.51.0 while Kevin refines the design)

The Timeline row in `DrumMachine.svelte` carries a `hidden` class for
now: the model, engine, codec, downloads and the recorder's "Song" choice
all stay, and a link or saved beat with a timeline plays as a song. The
user doc's Timeline section was taken out with it; the text to put back
(after "Patterns") when the row returns:

> The **Timeline** row under the patterns arranges them into a song: a row of bars, each one a pattern. **+ 2** adds the open pattern as the next bar (open another pattern to add that one), the × on a bar removes it, **Clear** empties the row, and with a bar focused, shift and the arrow keys move it. **Pattern** and **Song** beside the row choose what Play does: loop the open pattern, as always, or play the bars in order and round again. The first bar you add switches to Song; the bar sounding lights up, the readout counts the bars, and pressing a bar jumps there at the end of the cycle (or, stopped, makes it where Play starts) and opens its pattern for editing. Up to 64 bars. In the Idea Recorder the pattern picker offers **Song** as well.
>
> And in "Saving, sharing and downloading": In Song mode both downloads
> carry the whole timeline instead: the WAV once through with the effects
> ringing out at the end, the MIDI bar after bar with the time signature
> wherever it changes. Links carry the timeline too. And in "Beats for a
> song": the demo renders the open pattern (or, in Song mode, the whole
> timeline).

A song is a `timeline` on the project: pattern indices, one per bar, up
to `MAX_DRUM_TIMELINE` (64), empty for projects from before (the schema
defaults it). Song mode is engine state, not project state
(`drumMachine.songMode`): on whenever a project with a timeline loads
(a link, a saved beat, a preset with one), off when the timeline empties,
switched by the Pattern / Song buttons in the Timeline row and by the
recorder's picker ("Song" joins the patterns there). In song mode the
scheduler picks the bar's pattern at the top of each cycle
(`#nextBar`, wrapping), the grid's step follow carries the bar along with
the step, and a bar chosen while playing (`queuedBar`) takes over at the
end of the cycle, like a queued pattern in pattern mode; opening a
pattern to edit no longer changes what plays. Removing a pattern drops
its bars and shifts the later ones down. Downloads and the demo follow
the mode: `renderDrumSongWav` renders the bars once through with two
seconds of tail (not a loop; a take), and `encodeDrumMidi` takes a
sequence of bars, writing the time signature where it changes. Share
links became version 6: the bar count in 7 bits and 3 bits per bar after
the patterns; version 5 links read as before with an empty timeline.

## Reverb and delay (built 2026-09-28)

Built as described here, with Kevin's changes: the master controls live
in an Effects menu at the foot (no on / off switch: a beat is dry until a
level comes up), and the defaults are inverted (returns at zero, sends
per drum from `DEFAULT_DRUM_SENDS`) so the master levels are discovered
first. The
row's panner feeds a dry gain into the master and two sends: a delay bus (a `DelayNode` with a feedback
gain and a low-pass in the loop, its time in steps so it follows the
tempo, dotted eighth by default, as Groovie's) and a reverb bus (a
`ConvolverNode` over an impulse response synthesized at load, a burst of
noise with an exponential decay, so no file is needed; a size control
sets the decay). Per row a delay send and a reverb send, per project the
delay time and feedback and the reverb size, all in the share link (a
format version), the offline render sharing the graph so the WAV carries
the effects, the MIDI file unaffected. On a phone the sends join the
row's level and pan menu; the project settings join the tempo menu. About
a day, mostly listening.

### Analog delay and fuzz (built 2026-09-30)

Two of the piano's effects on the drum bus, from the stages both share
(`src/lib/audio/fxStages.ts`): the delay's Digital/Analog choice (analog
puts a soft clip and a 2 kHz damping in the loop and a 0.4 Hz wobble on
the time; measured through the bus on a 500 Hz + 3 kHz burst, the second
analog repeat's 3 kHz sits 9 dB under the digital one's) and a fuzz on
the dry mix, drive and tone, the sends staying clean (a hit peaks near
0.8, so the make-up is tuned to that; measured within 0.3 dB of clean at
every drive on a 220 Hz tone). `fx.delayAnalog`, `fx.fuzzDrive` and
`fx.fuzzTone` in the schema with defaults (off, 0, 0.5), so beats and
links from before open as they were; share links are version 7 (the
analog flag in 1 bit, drive and tone in 7 each, after the reverb return),
version 6 links read with them off. Reset to defaults covers them.

### Wah (built 2026-10-01)

The piano's wah stage (`createWahStage` in fxStages.ts, shared) on the
dry mix after the fuzz, in Sweep mode only, its LFO timed in bars of four
beats (one cycle per a beat, two beats, one, two or four bars;
`DRUM_WAH_BARS`) so the filter lands on the downbeat: the filter sweep
that pulls a loop in and out. Range, resonance (capped at 10 dB on the
bus: a kick's fundamental under a sharper peak is a bump) and level
(mix; 0 = off) beside it in the Effects menu's third column. Touch was
left out: a pattern hits at fixed velocities, so a follower reads as a
blip on every hit; per-row sends too (the whole bus, as the fuzz). In the
schema (`wahBars`, `wahRange`, `wahResonance`, `wahMix`) with defaults, so
older beats and links open with it off; share links are version 8 (the
bars choice in 3 bits, the three levels in 7 each); Reset to defaults
covers it; the WAV carries it.

## MIDI input (built 2026-09-30)

Finger drumming (the "own samples, MIDI input" line above): a MIDI menu
beside Effects (shown where Web MIDI exists: Chrome and Edge) with
Connect, the inputs' names once listening, Disconnect, and a Record
toggle. `drumMachine.connectMidi` is the piano's, every input's note-ons
going to `hitNote`: General MIDI's drum notes and their usual neighbours
map to voices (`DRUM_MIDI_IN_NOTES`: both kicks, both snares, the pedal
hat, every tom, both crashes and rides), any other note plays the open
pattern's rows in order, so a keyboard works too. `hit(voice, velocity)`
plays one hit now through `playDrumHit` (the step player's hit, factored
out: the row's level, pan and sends, the hat choke), building the context
and the bus on the first hit as play does (`#graph`), and warms the kit
on connect so the first pad lands. With Record on while the beat plays,
a hit also goes into the playing pattern at the nearest step (from the
scheduler's next step and the clock; swing is not undone), a ghost,
normal or accent by velocity, adding a row for a voice the pattern
lacks; off by default, since it writes into the beat. Not built: MIDI
out, a clock, or velocity curves.

## Decisions to make before Phase 1

1. **The name and the path.** "Drum Machine" at `/drum-machine`, in the
   footer after Metronome.
2. **Kits in v1.** Both (acoustic samples plus a synthesized electronic
   kit) as planned, or one to start. The acoustic kit is the one a band
   wants to play along to; the electronic kit costs no assets.
3. **Share links in v1.** Cheap to build, and they make the page worth
   linking to from the blog; the format has to be versioned from the
   first link, which the plan does.
4. **Which sixteen-step shapes matter**: 4/4 only in v1 (8, 16, 32), or
   3/4 and 6/8 as well (12, 24). The model allows both; the grid's beat
   markers and the phone's two-rows-of-eight layout are what change.
5. **The recorder** waits for Phase 2 unless it is the point.
