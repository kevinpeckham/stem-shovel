# Dawn as a full online DAW: the incremental plan

Written 2026-10-18 from two surveys: the browser DAWs of 2026 (BandLab,
Soundtrap, Amped Studio, Audiotool, Soundation, Ableton Note, openDAW,
the WAM 2.0 plugin ecosystem and the open-source engines) and an
inventory of what Dawn already is (docs/multitrack-recorder.md and the
code under `src/lib/audio/studio.svelte.ts`). Kevin's ask: a detailed
incremental plan, built phase by phase in feature branches with docs,
unit, component and browser tests as it goes, Svelte best practices and
reusable functions and components. The plan is the order; each phase is
a release or two on its own.

## Where Dawn stands

Already a recorder with a DAW's timeline: audio and MIDI tracks (16),
clips cut from sources with trim, split, move, duplicate, fades, gain and
snap; takes and take lanes, punch and loop recording, count-in, click,
latency trim; a piano roll with quantize and transpose, MIDI import and
export; per-track compressor, tone and reverb; meters, knobs, tints, the
Stage; undo (whole-document snapshots, mix gestures coalesced); autosave
and named revisions; bounce to 24-bit WAV, Add as demo, Add as stems;
the piano, chord player, drum machine and practice amp hosted as inputs.

What every browser DAW of 2026 has and Dawn does not: **automation**
lanes; **sends, buses and a master chain** with a parametric EQ, a
tempo-synced delay and a limiter; a **mixer console**; **time-stretch
and pitch** ("fit to tempo"); **export** as MP3 and loudness-normalized
mixdowns and per-track stems; **crossfades** on overlapping clips;
**comping** (which none of the five commercial browser DAWs documents: a
recorder-first product can own it); a **tempo map** and time signatures
that change mid-song, with swing and humanize; a **loop and sample
library**; and, further out, **plugins** (WAM 2.0), **DAWproject**
export and **real-time collaboration**.

What the code says has to change to get there: the engine is one
1900-line class with the signal graph built in two places (live and
offline), gains written imperatively, no time-varying parameter type,
whole-document undo at depth 100, persistence and bounce orchestration
living in the page, instruments wired by `if` branches rather than a
registry, and bars computed from a single bpm instead of the stem
player's tempo-map machinery in `measures.ts`.

## The phases

Each phase ships on its own; the order puts the most value for the least
build first and lets every later phase stand on the one before.

### D1. Automation (this branch, `dawn-daw`)

Breakpoint lanes for volume, pan and the reverb send on every audio
track, drawn under the clips, scheduled sample-accurately on the
`AudioParam`s per playback pass, honored by the offline bounce, written
by touching a knob at the playhead. Groundwork folded in: one **track
graph factory** shared by the live context and the bounce, exposing its
automatable parameters, so D2 adds sends and inserts in one place.

- Schema: `automation?: { volume?: Point[]; pan?: Point[]; reverb?: Point[] }`
  on the track, `Point = {t, v}` sorted by `t`, in the parameter's own
  units, 1000 points a lane. Optional, so `version` stays 1.
- Utils, one function per file, tested: `automationValueAt`,
  `editAutomation` (add, move, remove, in the `editNotes` shape),
  `scheduleAutomation` (cancel, then `setValueAtTime` and
  `linearRampToValueAtTime` for a pass's window), `automationParams`
  (range, default and format per parameter) in `constants/`.
- Engine: a gain node for the volume lane after the fader (the fader
  stays mute, solo and the static level), the panner's `pan`, the
  chain's reverb level; curves emitted in `#startPass` and canceled on
  stop and seek; `setAutomation(trackId, param, points)` as one undo
  step per gesture; a knob turned on a track with a lane writes a point
  at the playhead instead of the static value; the bounce applies the
  same curves from zero.
- UI: `AutomationLane.svelte`, reusable (points, range, geometry,
  `onchange`): a polyline, click to add, drag to move (snapped on the
  grid, Shift free), double-click to remove, keyboard nudge and delete;
  an **A** button in the track header shows the lane and a parameter
  picker; the knobs show the automated value as the playhead passes;
  the Stage's pucks follow it too.
- Tests: the utils; the schema; the lane component; the timeline's
  toggle; a browser spec that draws two points and reads the
  arrangement back through `window.__studio`.

### D2. Routing and the mixer: buses, sends, inserts, master chain

- Schema: `buses[]` (name, gain, pan, fx, output), a track's `output`
  (master or a bus), `sends[]` (bus, level, pre/post), a master `fx`.
- Stock effects as a typed **insert list** rather than the fixed
  three-slot struct: parametric EQ (3 to 5 bands), compressor, the tone
  stage, a tempo-synced delay, reverb, a limiter on the master; each
  with a schema, a node factory on `BaseAudioContext`, a small panel
  component and its parameters registered as automatable (D1).
- The graph factory grows to build track → inserts → pan → output,
  sends → bus → master; mute and solo understand the graph.
- A **mixer console** view (strips: fader, pan, inserts, sends, meter,
  output picker) beside Tracks and Stage; the Stage gets bus pucks.
- Automation on every insert and send parameter.

### D3. Export and delivery

- Mixdown in the jobs function from the bounced WAV: MP3 and WAV with
  `loudnorm` to −14 LUFS / −1 dBTP (Spotify's reference), a LUFS
  readout on the master meter in the browser.
- Stems per track, per bus and the master, zipped; MIDI tracks rendered
  offline through an offline-capable path (the piano's samples decoded
  into the offline context) so a bounce needs no real-time pass.
- DAWproject export (tracks, clips, fades, tempo, automation, the WAVs)
  for Bitwig, Cubase and Studio One.

### D4. Editing depth: comping, crossfades, clip tools

- Crossfades where clips overlap (equal-power), fade curves.
- **Comping**: the take lanes opened under a track, swipe a region of
  any take into the comp, rendered as crossfaded clips; a differentiator
  no browser DAW documents.
- Clip gain envelopes, reverse, normalize, consolidate; range and ripple
  edits; multi-selection; markers and the song's sections on the ruler.

### D5. Time: the tempo map, meters, swing, stretch

- The arrangement adopts `measures.ts` (`barGrid`, `barAt`,
  `secondsAtBar`): tempo and time-signature changes mid-song, the
  ruler, snap, click and count-in following them; a beats-anchored
  clip option so MIDI and loops follow tempo changes; swing and
  humanize for MIDI; tap tempo and tempo detection for imported audio.
- **Time-stretch and pitch** with signalsmith-stretch (MIT) rendered
  offline into a new rendition: fit to tempo, stretch by dragging an
  edge, transpose audio; real-time stretch only if live tempo changes
  under stretched clips prove needed.

### D6. Instruments, effects and the library

- A **registry** for inputs and instruments (the `if` branches become
  entries), a sampler with kits and a soundfont player, a subtractive
  synth preset set, a loop and one-shot library with drag-to-timeline.
- WAM 2.0 hosting for a curated handful, and Dawn's own effects wrapped
  as WAMs; parameters, state and automation through the same seams.

### D7. Collaboration

- Account-owned songs (the open question in the design doc), members on
  one song, time-anchored comments and the existing notifications;
  named versions with diffs of the document.
- Real-time co-editing later, with a Yjs document (operation-based undo
  comes with it) and presence; the assets stay in Blob.

### D8. Scale and structure

- Sources streamed from OPFS and Blob through a playback worklet, FLAC
  renditions in the jobs function, windowed scheduling and freeze, so a
  long session no longer lives decoded in memory.
- The engine split into modules (graph, scheduler, recording, edits,
  persistence) behind the same `studio` facade, persistence and bounce
  orchestration out of the page into a module, operation-based undo.
  Done incrementally from D1 on; this phase finishes it.

### Cross-cutting, every phase

Keyboard shortcuts in one map with a help sheet; phone layouts by
container query; accessibility (every control named, every lane a
slider or a grid); the user guide `studio.md` and the design doc kept
current; unit tests for every util and schema, component tests for
every component, a browser spec per phase; and the house rules
(remote functions, valibot in `src/lib/val`, utils one per file,
UnoCSS only, no `$effect` where a `$derived` does).

## Decisions taken (Kevin: proceed on my recommendations)

1. Automation first, routing second: automation is the most-missed
   DAW feature and its scheduler is agnostic to the graph; the graph
   factory built with it is what D2 extends.
2. Breakpoints in the parameter's own units, linear between them,
   emitted per pass with `AudioParam` curves: enough for native-node
   mixing, no worklet needed until WASM DSP arrives (D6).
3. A knob on a track with a lane writes a point at the playhead (touch
   write); there is no separate write/latch mode to learn.
4. Seconds stay the arrangement's clock until D5, as the design doc
   decided; automation points are seconds too and will convert with
   the clips.
5. Stretch is offline into a rendition (signalsmith-stretch), not
   real-time, until a need appears.
6. Collaboration stays asynchronous until the document is
   operation-based; real-time is the last phase, not the first.
