# Multitrack recorder (design draft)

Status: phase 1a shipped in v0.110.0 (2026-10-06); phase 1b (editing, import, punch, take lanes) in v0.111.0 (2026-10-07); phase 2 (the instruments as inputs, the drum machine as a backing, effects per track) built 2026-10-07; phase 3a (MIDI tracks: record, play, edit, import, export, render to audio) and 3b (the piano-roll editor) built 2026-10-08. The plan's phases are complete; "Later" holds what is left. Design written 2026-10-06. Kevin's ask: "a simple
multi-track recorder. It would use some of the features and layout of the
stem player, and a lot of the engineering of the idea recorder. It should
start fairly simple as a stand-alone tool … 'songs' instead of 'ideas' …
notes associated with songs but instead of multiple takes it would support
multiple revisions. User would be able to record multiple takes. Playback
while recording, mute, solo etc. Users could place audio snippets on a
timeline (row). Snippets could be trimmed and chopped. It should focus on
analog recordings in phase 1, but midi would be on the road map.
Eventually this would become a simple online DAW."

The open questions are at the end; the recommendations in the body are
what the questions default to.

## What it is

A tool page, working name **Studio** (`/studio`), the user's own like the
Idea Recorder and the looper: a transport over a timeline of **tracks**,
each a row of **clips** cut from **sources** (recorded takes or imported
files). Record arms one or more tracks and plays the rest; stop leaves a
clip on each armed track where recording began. Clips move, trim at either
edge, split at the playhead, fade in and out, and carry their own gain;
tracks have a fader, pan, mute, solo, an input and a meter. The
arrangement autosaves; a **revision** is a named snapshot of it that can
be restored. A song bounces to a mixdown (WAV, or a demo of a Stem Shovel
song) and its tracks bounce to stems of a Stem Shovel song, which is how
the tool joins the rest of the app.

Phase 1 is audio only: the microphone, a line in and the computer's audio
as inputs, through the shared `inputSources` module. Instruments (the
piano, the chord player, the drum machine) come in phase 2 as audio
inputs, and MIDI tracks in phase 3.

## What exists already

The research below (docs/demo-recording.md, docs/looper.md,
docs/stem-engine.md) found most of the foundation built:

| Need                                      | Already there                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs, gains, meters, monitor, device    | `src/lib/audio/inputs.svelte.ts` (mic, line, computer; channel modes; `attach(ctx)`; settings per browser)                                     |
| Latency calibration                       | `inputSources.calibrate()` + `src/lib/utils/findLatency.ts` (three clicks, cross-correlation); `outputLatencyMs(ctx)`                          |
| Sample-accurate capture                   | `static/worklets/loop-capture.js` (an `AudioWorkletProcessor`, start frame on the context clock, lead-in for the latency shift)                |
| Synchronised playback, faders, mute, solo | `StemEngine` (`src/lib/audio/engine.svelte.ts`): one `start(when, offset)` per source, `setTargetAtTime` ramps, `#effectiveGain`               |
| Session tempo, click, count-in            | `metronome.svelte.ts` (`hostContext`, `startLookahead`), the looper's count-in                                                                 |
| Row layout                                | `StemRow.svelte` (grip, label, M/S, fader, waveform cell), `Transport.svelte` (readout in bars or timecode via `readout.svelte.ts`, master)    |
| Waveforms                                 | `src/lib/audio/peaks.ts` (`computePeaks`), `Waveform.svelte` (canvas, colour from `color`), `RecorderWave.svelte`                              |
| Panels                                    | `FloatingPanel.svelte` (dock, float, minimise, remembered size); the song page's `playerMode` tri-state                                        |
| Notes                                     | `IdeaNotesPanel.svelte` + `saveIdeaNotes` (markdown board, autosave, creates the idea on first save)                                           |
| Upload path for a file per track          | `TakeQueue` (IndexedDB, resumes after a refresh) + `uploadRecordingStemFile` + `recording_stem`; `isRecordingPathname` branch in `/api/upload` |
| Lossless files                            | `encodeWav24` (24-bit WAV), the jobs function's PCM → FLAC step (`renderRecordings`)                                                           |
| Offline bounce                            | `looper.renderMix` (`OfflineAudioContext`), `drumRender.ts`                                                                                    |
| Tracks into a song                        | `copyRecordingStemsToSong` (a `stem` row per source, renditions scheduled), `addRecordingToSong` (a demo)                                      |
| One transport at a time                   | `claimPlayback` (`onlyOnePlays.ts`)                                                                                                            |
| iOS                                       | `playThroughSilentSwitch`, `audioSession` `play-and-record`, the wake lock in `DemoRecorder`                                                   |

What does not exist: a clip model, an editable timeline, generic
`AudioBuffer` slice/concat/crossfade helpers, per-track pan and meters on
the playback path, streaming capture (the looper's worklet posts
fixed-length passes), and punch-in.

## Data model

Three options were weighed:

- **A. Reuse ideas and takes as they are.** A take is one file with a mix,
  which a multitrack pass is not (one file per armed track, no mix).
  Rejected.
- **B. Fresh tables** (`studio_song`, `studio_source`, `studio_revision`).
  Clean, but duplicates ownership, listing, notes, housekeeping and the
  "empty idea" sweep, and keeps the two recorders apart when Kevin expects
  them to merge.
- **C. The document is an idea; sources and revisions are new tables.**
  Recommended.

**C in detail.** `idea.kind` gains `"song"` (`IDEA_KINDS`, migration: the
column is text, so a check-free addition). A Studio song is an idea: its
title, notes board, `instruments` JSON (tempo, meter, count-in, click
settings live there, as the looper's do), creator ownership, the current
account as the storage home, `deleteEmptyIdeas`, and the ideas list in the
Idea Recorder (hidden there as loops are, or shown under a "Studio songs"
filter). The user-facing noun in the Studio is **song**; the table stays
`idea`. Two new tables:

```
studio_source      one audio file an arrangement can cut from
  id, account_id, idea_id (cascade), recorded_by (set null)
  kind: "take" | "import" | "bounce"
  take_number, track_label   -- "Take 3 · Guitar" in the list
  status, url, pathname (unique), filename, content_type, size_bytes
  codec (alac|pcm|flac|opus|aac|wav), sample_rate, channels,
  duration_seconds, peaks (JSON, 1024 bins, as stem.peaks)
  timestamps; indexes on account_id, idea_id

studio_revision    a snapshot of the arrangement
  id, account_id, idea_id (cascade), saved_by (set null)
  name (nullable: null = autosave), number (1, 2, 3 … per idea)
  data (JSON, StudioArrangement, validated by StudioArrangementSchema)
  hash (sha of data, so an unchanged autosave writes nothing)
  timestamps; index on (idea_id, number)
```

The **current** arrangement is the newest revision with `name = null`;
autosave writes one (debounced, hash-checked) and prunes autosaves beyond
ten, as `song_doc_version` does for charts. **Save revision** names the
current state and names are kept forever. **Restore** copies an old
revision's data forward as a new autosave, so history is never rewritten.
Sources are append-only (a clip's deletion never deletes its source), so
every revision stays restorable; a "Clean up unused sources" action in the
song's menu removes files no revision references.

`StudioArrangement` (`src/lib/val/StudioArrangementSchema.ts`):

```
{ version: 1,
  bpm, beatsPerBar, gridOn, countIn, click,         -- the session settings
  loop: { on, start, end } | null,
  master: 0..1,
  tracks: [{ id, name, colour, gain 0..1.25, pan -1..1, muted, solo,
             input: { source: mic|line|computer, channel: stereo|left|right } | null,
             armed }],
  clips:  [{ id, trackId, sourceId, start, offset, duration,
             gain 0..2, fadeIn, fadeOut, name }] }
```

Times are seconds (a tenth of a millisecond, as song sections are);
`offset` is where in the source the clip begins; a split makes two clips
with offsets `o` and `o + (t − start)`; a trim moves `start`/`offset`/
`duration` only. Caps: 16 tracks, 400 clips, 64 sources, a 15-minute
song (`MAX_TAKE_SECONDS`), `MAX_TAKE_BYTES` per source, counted against
the account's storage like takes.

Files go to `accounts/<id>/studio/<ideaId>/<sourceId>.<ext>` on the
recordings store (`isStudioPathname` beside `isRecordingPathname` in
`/api/upload` and `blob.ts`); the reserve → upload → ready routes are
`POST /api/studio/sources`, `/api/studio/sources/[id]/ready`. Raw PCM
WebM from Chrome is not involved: the worklet gives Float32 samples and
the browser writes **24-bit WAV** itself (`encodeWav24`), so one path
serves every browser; a `studio-source` job turns the WAV into FLAC
afterwards as `renderRecordings` already does for takes (halves the
storage, keeps it lossless). No MP3/AAC rendition: the editor needs the
lossless file and it is the user's own.

Cascade: `deleteIdeaRows` gains the two tables; `deleteIdea` collects
their blobs; the account sweep and `db:sweep-orphans` follow.

## The engine: `src/lib/audio/studio.svelte.ts`

A `StudioEngine` class in the looper's mould (runes state, one hosted
`AudioContext`, the capture worklet) with the stem engine's scheduling.

**Context.** Created on the first gesture at the device's rate (not the
stem player's 32 kHz: this one records), `inputSources.attach(ctx, …)`,
the metronome hosted in it. Every source remembers its `sampleRate`; a
source at another rate is resampled on load through an
`OfflineAudioContext` at the context's rate (free, exact).

**Graph.** Per track: a `GainNode` (fader, mute, solo folded as
`#effectiveGain`) → `StereoPannerNode` → `AnalyserNode` (meter) → master
`GainNode` → destination. Per clip at play time: an
`AudioBufferSourceNode` → a clip `GainNode` (clip gain and the fade ramps,
2 ms minimum at both edges so edits never click) → the track's gain. A
track's armed input: `inputSources.output(source)` (already a gain +
analyser), through a channel pick, into the capture worklet, and into the
track's gain only when "Monitor" is on (off by default: laptop speakers
feed back).

**Transport.** `position` is `$state`, written each frame from the context
clock as the stem engine does. `play(from)` schedules every clip that
overlaps `[from, end)` with one `when = ctx.currentTime + START_LEAD`
anchor: `start(when + max(0, clip.start − from), offset + max(0, from −
clip.start), remaining)`. Pause stops every source; seek is stop plus
play. A loop region reschedules its next pass from `startLookahead`
(0.1 s ahead, in the metronome's manner) so the downbeat never lands late.
Edits during playback (a fader, a mute) ramp live; a clip edit during
playback reschedules that clip alone.

**Record.** A new processor `static/worklets/track-capture.js`: armed with
`{ startFrame, lead, channels }` it posts chunks (say 4096 frames each,
transferable) from `startFrame − lead` until `stop`, so a take is not
bounded by a buffer the way a loop pass is; the main thread appends them
into a growing `Float32Array` per channel (or straight into IndexedDB in
chunks for long takes). One capture node per armed track, all armed at the
same `startFrame` = the transport's start on the context clock, so takes
line up to the sample. Count-in: the metronome clicks a bar before
`startFrame`; the transport and the capture both begin at the downbeat.
Stop: the chunks become a `studio_source` (24-bit WAV, peaks computed,
decoded buffer kept in memory), a clip on the track from the record
position shifted earlier by the input's latency (`inputSources.latencyMs`
for mic/line, `computerLatencyMs` for the computer; the lead-in supplies
the samples), and the queue uploads it. Punch in/out is the same with a
record region: capture runs through, the clip is cut to the region.
Playback while recording is the same `play(from)`; the armed track's
existing clips keep playing unless "Mute armed tracks' clips" is on.

**Edit.** Pure functions in `src/lib/utils/` (`splitClip`, `trimClip`,
`moveClip`, `clipsOverlapping`, `snapToGrid`), each tested. Undo/redo:
the arrangement is small (hundreds of clips at most, audio by id), so
every edit pushes a `structuredClone` of the previous arrangement on a
stack of 100; no command log. Snap: to the bar grid when `gridOn`
(`measures.ts` has `barGrid`/`secondsAtBar`), else free, with Shift to
override.

**Bounce.** The graph rebuilt in an `OfflineAudioContext` (stereo,
context rate, the song's length), rendered faster than real time:
the master mix as one WAV (download, or `addRecordingToSong`-style "Add as
demo"), or one WAV per track with its fader, pan and clip gains baked
("Add tracks to song as stems", through a `copyStudioTracksToSong` like
`copyRecordingStemsToSong`, renditions scheduled). Bounces are
`studio_source` rows of kind `"bounce"` too, so a user can bounce a busy
track and keep editing lighter.

**Memory.** Decoded audio is Float32 at the context rate: a mono minute at
48 kHz is 11.5 MB, so a 16-track, five-minute song is around 900 MB if
every track is stereo and full-length, and iOS kills a tab near 1.5 GB.
Phase 1 keeps it honest rather than clever: tracks default to mono (an
input's left, right or a stereo pair is the track's choice), a decoded
size readout on the device as the stem player has, and a warning past
400 MB. Phase 2 can stream long sources from the Origin Private File
System through a playback worklet, which is what the browser DAWs do once
buffers stop fitting (research below).

**Local persistence.** The `TakeQueue` pattern: each finished take is
written to IndexedDB (the WAV blob and its metadata) before the upload
starts, so a refresh, a crash or a phone call loses nothing, and removed
once the row is ready. The arrangement autosaves to the server; a copy in
`localStorage` per song covers an offline edit until the next save. Safari
clears script-writable storage after seven days without a visit, so the
upload is prompt and the browser's copy is a cache, never the only copy.

## The page

`/studio` (`src/routes/studio/+page.svelte` + `+page.server.ts`), signed
in (the Idea Recorder's rule), page copy through `pageCopy.ts` as the other
tools. The device chassis (`device-chrome`, `device-screen`, the
`device-button-*` shortcuts) holds the transport:

- Record, Play/Pause, Stop, Skip back, Loop; the readout in bars or
  timecode (`readout.svelte.ts`), tempo and meter fields, Count-in and
  Click switches, Grid/Snap, a master fader and meter, Undo/Redo, Zoom.
- The timeline below it: a ruler (bars when the grid is on, else
  minutes:seconds), then one row per track on the stem player's grid
  (`StemRow`'s first two cells, with Arm, Pan and the input picker added,
  the waveform cell replaced by a **lane**). A lane is one canvas per
  track drawing the clips in view (peaks from each source's 1024 bins at
  low zoom, recomputed from the buffer at a finer resolution when zoomed
  in, cached per zoom level), with the playhead as one absolutely placed
  element over all lanes as `Waveform.svelte` does.
- Clip interaction: click selects; drag moves (vertical drag changes
  track); drag an edge trims; `S` splits at the playhead, `Delete`
  removes, `⌘Z`/`⌘⇧Z` undo and redo; double-click opens the clip's
  popover (name, gain, fades). The space bar follows the song page's
  `spaceOwner`/`isTextEntry` rules; `M`/`S` on a focused row as today.
  Pinch and ⌘-wheel zoom, wheel scrolls.
- "Add track" at the bottom of the rows; the empty song shows one track
  armed to the microphone with "Press Record" copy.

Panels (all `FloatingPanel`, docked below `lg`, keys under
`stemshovel.studio.*`): **Recordings** (named "Songs" until 2026-10-08, when Kevin found it read as the project songs; the Idea Recorder's Recordings panel's shape: search,
one `<details>` per song listing its revisions with "Restore" and
"Rename", a ⋯ menu with Bounce, Add as demo, Add tracks to song, Delete),
**Notes** (`IdeaNotesPanel`), **Inputs** (`InputSourceSettings` per source
with Calibrate), **Metronome**, **Tuner**. Phase 2 adds the instrument
panels as the looper has them.

Phones: the chassis in one column, the lanes scrolling horizontally, tap
to select, handles to trim, a toolbar button to split; moving clips by
drag works with pointer capture as the song page's drags do. Recording
with the phone's microphone over a backing track is the phone's job; fine
editing is a desktop's. Layout by container queries only.

## Phases

**Phase 1a: record and arrange.** The engine (play, record, mute, solo,
fader, pan, meters, count-in, click, latency shift, loop region), tracks
with inputs, clips placed as recorded, the ruler and lanes, autosave and
named revisions, the Recordings (then "Songs") and Notes panels, the upload queue and FLAC
job, bounce to WAV, "Add as demo" and "Add tracks to song as stems".
Clips can be moved and deleted; no trim or split yet.

**Phase 1b: edit.** Trim, split, fades, clip gain, snap to grid, undo and
redo, zoom, punch in/out, import an audio file onto a track, duplicate a
clip, take lanes (record over a region several times, pick a take; the
other takes stay as sources).

**Phase 2: the rest of the studio's inputs.** The piano, chord player and
drum machine hosted in the context as track inputs (the looper's
`hostContext` path), their settings saved on the idea's `instruments`;
per-track Tone, compressor and reverb from the existing `fxStages`; the
drum machine's pattern timeline as a backing track.

**Phase 3: MIDI.** MIDI tracks whose clips hold note events, a piano
roll in the lane, scheduled to the hosted piano and drums through the same
look-ahead loop; Web MIDI input where the browser has it (Chrome, Edge,
Firefox; Safari still has none in 2026), the computer keyboard and the
on-screen instruments elsewhere.

_3a as built (2026-10-08)._ A track has a `kind` (`audio`, the default,
or `midi`); a MIDI track's `input` names the instrument that plays and
records it (piano, chords, drums), and a MIDI clip carries `notes`
(`{t, d, p, v}`: seconds from the clip's content origin, seconds long,
pitch, velocity 0..1) instead of a `sourceId` (`StudioNoteSchema`; a clip
has one or the other). Decisions, and why:

- **Seconds, not beats.** The doc above said ticks at a PPQ; the song has
  one tempo and no tempo map, every clip tool (trim, split, move, takes,
  punch, loop passes) works in seconds, and a MIDI clip placed beside an
  audio clip must stay beside it when the tempo changes. So notes are
  seconds like everything else, Quantize uses the tempo of the moment, and
  the drum machine as a backing (a live instrument, not a clip) is the one
  thing that follows the tempo. Tempo-following MIDI is a later option.
- **Recording** taps the instrument engines: `piano.onNote` and
  `chordPiano.onNote` report every note the keys, the computer keyboard,
  the chord player's buttons or a Web MIDI device start and stop, on the
  context's clock; `drumMachine.onHit` reports pad and MIDI hits as their
  General MIDI notes (`DRUM_GM_NOTES`). The engine pairs them
  (`utils/pairNoteEvents.ts`: from the pass's start, less the output
  latency when "shift instrument takes" is on, as audio instrument takes
  are shifted), cuts them per loop pass or to the punch region
  (`utils/sliceNotes.ts` over `takePieces`) and lands a clip per piece
  through the same `coveredClips` rule as audio (no alternates for MIDI).
  An empty pass lands nothing. A pass with audio and MIDI tracks armed
  shares one take number.
- **Playback** schedules through the hosted engines: `piano.scheduleNote`
  and `chordPiano.scheduleNote` start a voice at a context time and
  release it `d` later (outside the keys' voice table, so a part playing
  never fights the hands); `drumMachine.scheduleHit` plays a voice at a
  time through the pattern's row settings. Notes are queued by the
  look-ahead (`#queueUntil`) a few seconds ahead rather than all at once,
  and cancelled on stop, seek or an edit. A track's fader scales velocity
  (there is one piano, so a MIDI track has no audio path of its own: no
  pan, no effects; the instrument's panel has those), mute and solo skip
  the notes, and a clip's gain handle scales velocity too.
- **The lane** draws a MIDI clip as a small piano roll (the clip's pitch
  range, a row per semitone) and, while recording, the notes so far.
  Quantize (to the beat, a half or a quarter of it) and Transpose sit on
  the selected clip's row; Export MIDI downloads the clip as a Standard
  MIDI File at the song's tempo (`utils/midiNotesFile.ts`); Import takes
  `.mid` files onto a MIDI track (`audio/midi.ts` parses them).
- **Bouncing.** An offline render cannot run the sampled instruments, so
  a MIDI track is **rendered to audio** first: `renderMidiTrack` adds an
  audio track with the same instrument as its input, arms it alone, solos
  the MIDI track, and records from the start to the song's end in real
  time with the latency shift and the count-in off, then mutes the MIDI
  track. Download mix, Add as demo and Add tracks as stems do this
  themselves for any MIDI track with clips before they render, saying so.
- **Not in 3a:** tempo-following clips, MIDI from a file into the
  arrangement's tempo, velocity curves, CC data. The arrangement's
  `version` stays 1: every addition is optional.

_3b as built (2026-10-08): the piano-roll editor._ `PianoRoll.svelte`, in
a floating panel the page opens from **Edit notes** on the selected MIDI
clip's row or a double-click on the clip (`onopen`). One clip's notes on
a grid of pitch rows (`utils/pianoRoll.ts`: whole octaves spanning the
notes, at least two around middle C; a drums track's rows are the kit's
voices on their General MIDI notes) against time at its own zoom, beat
and bar lines as a repeating background, the clip's window dimmed
outside `offset..offset+duration`, the playhead when the transport runs,
and a keyboard column that sounds its row (`studio.auditionNote`, which
also sounds a note picked up). A click on empty grid adds a note a grid
step long (the Grid select: a beat, a half, a quarter; Shift ignores the
grid), a note drags in time and pitch with a live preview, its right edge
drags its length, Shift-click extends the selection, the arrow keys nudge
(pitch by a semitone, Shift an octave; time by a step), Delete removes,
the Velocity slider sets the selection's. Every finished gesture is one
`studio.setClipNotes` (sorted, capped, one undo step); the selection
follows its notes through the sort by value. `editNotes` and
`snapRollTime` are the pure arithmetic, tested on their own.

**Later.** The Idea Recorder as the Studio's quick-capture mode (one
song, one track, Record): the merge Kevin anticipates. Comping,
time-stretch, account-owned songs for a band working together, streaming
playback from local files for long sessions.

## Research notes (2026-10-06)

Browser DAWs and the Web Audio literature agree on the shape above:

- **Scheduling.** One `AudioBufferSourceNode` per clip, `start(when,
  offset, duration)` from one transport anchor; loops rescheduled ahead of
  the boundary with a look-ahead timer (web.dev "A tale of two clocks");
  gain ramps at every clip edge. openDAW (AGPL, 2025–26) runs its whole
  engine in an AudioWorklet with an immutable state graph; that is the
  end state for a DAW, not phase 1.
- **Capture.** An AudioWorklet appending Float32 chunks, anchored to the
  context frame of the first sample, is cross-browser and lossless;
  `MediaRecorder` has no context-clock anchor (1–8 ms jitter). Safari 18.4
  added PCM and ALAC to `MediaRecorder`; not needed here.
- **Latency.** `outputLatency` is reported by every browser now (Safari
  from 18.4; Chrome reports 0 until audio has rendered); input latency is
  not, so a loopback calibration is the method (openDAW measured 12–24 ms
  varying per stream on one device). Already built here.
- **Voice processing.** Ask for `echoCancellation`, `noiseSuppression`
  and `autoGainControl` off, then read `track.getSettings()`: Chrome on
  macOS has an open bug leaving them on; Safari ignores `channelCount`
  with cancellation off.
- **Memory.** iOS kills a tab around 1.5 GB; `decodeAudioData` never
  returns for very large files on WebKit. Mono, chunked decoding and a
  budget are the mitigations.
- **Storage.** OPFS with sync access handles in a worker is ten times
  faster than IndexedDB for 100 MB writes and supported on Safari; Safari
  purges script-writable storage after seven days without interaction, so
  the local copy is a cache. IndexedDB (the pattern here) is adequate for
  phase 1.
- **Editing model.** `{trackId, sourceId, start, offset, duration, gain,
  fadeIn, fadeOut}` is the standard non-destructive clip; immutable
  snapshots are simpler than a command log at this size and are what
  revisions are anyway.
- **Libraries.** waveform-playlist (MIT) is the one permissively licensed
  multitrack editor worth reading; wavesurfer.js v7 (BSD) for regions;
  peaks.js is LGPL; Superpowered is commercial. Nothing is adopted: the
  app's own engine, peaks and canvas drawing are already the right
  primitives.
- **iOS.** Create the context in the gesture; after `getUserMedia` the
  context may come up at another rate, so the rate is read, not forced,
  and recorded with every source. Bluetooth output adds 80–220 ms; warn and
  recommend wired for overdubs.

## Open questions

1. **Name and route.** "Studio" at `/studio`, with "song" as the noun
   inside it? Or "Multitrack" / "Recorder"? The app already has songs
   (projects → songs with stems); the Studio's songs are the user's own
   until they are sent to one.
2. **Ownership.** User-owned like ideas (recommended for phase 1, and
   what lets the two recorders merge), or account-owned so a band's
   members record onto the same song?
3. **Data model.** Option C (the document is an idea of kind `"song"`,
   with new `studio_source` and `studio_revision` tables) over fresh
   tables?
4. **Revisions.** Autosave plus named revisions, restore as a new
   autosave, ten autosaves kept and every named one; or named revisions
   only, saved on demand?
5. **Phase 1a/1b line.** Which of trim, split, fades, snap, undo, zoom,
   punch, import and take lanes must be in the first release? Kevin named
   trim and chop; the recommendation is 1a as the first release, 1b the
   next.
6. **Tempo from the start.** Every song has a tempo and meter (bars
   ruler, snap, click, count-in) with "free time" as a switch, or free
   time by default?
7. **Caps.** 16 tracks, a 15-minute song, mono tracks by default, 24-bit
   WAV uploads converted to FLAC, counted against the account's storage?
8. **Bridges in phase 1.** "Add as demo" and "Add tracks to song as
   stems" at once (cheap, the copy functions exist), or later?
9. **Drum machine as a backing input** in phase 1b (hosting exists, and
   playing to a beat is the common case), or strictly phase 2?
10. **Phones.** Record and basic playback on a phone, with editing a
    desktop matter, acceptable for phase 1?
