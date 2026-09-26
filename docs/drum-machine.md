# A drum machine (plan)

Status: **Phase 1 built** (2026-09-26, unreleased): `/drum-machine`, the
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
- **A timeline** to arrange patterns into a song, as Groovie's; a
  **pattern generator** from a style and a density, as orDrumbox's.
- **Own samples**: a kit per account from uploaded one-shots (Blob,
  counted against storage), and **MIDI input** for finger drumming.

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
