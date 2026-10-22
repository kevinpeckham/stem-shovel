# Multitrack recorder (design draft)

> **Dawn** is the product name since 2026-10-16 ("Dawn: the rename" below): the
> route is `/multitrack-recorder` (`/studio` redirects for good), the Tools menu
> says Multitrack Recorder, and everything in the code keeps the working name
> `studio`.

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
| Synchronized playback, faders, mute, solo | `StemEngine` (`src/lib/audio/engine.svelte.ts`): one `start(when, offset)` per source, `setTargetAtTime` ramps, `#effectiveGain`               |
| Session tempo, click, count-in            | `metronome.svelte.ts` (`hostContext`, `startLookahead`), the looper's count-in                                                                 |
| Row layout                                | `StemRow.svelte` (grip, label, M/S, fader, waveform cell), `Transport.svelte` (readout in bars or timecode via `readout.svelte.ts`, master)    |
| Waveforms                                 | `src/lib/audio/peaks.ts` (`computePeaks`), `Waveform.svelte` (canvas, color from `color`), `RecorderWave.svelte`                               |
| Panels                                    | `FloatingPanel.svelte` (dock, float, minimize, remembered size); the song page's `playerMode` tri-state                                        |
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

A `StudioEngine` class in the looper's mold (runes state, one hosted
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
  and canceled on stop, seek or an edit. A track's fader scales velocity
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

## The Practice Amp as an input (2026-10-10)

`"amp"` joined `STUDIO_INPUT_SOURCES` (docs/practice-amp.md, "The
band"): the Studio hosts the amp's chain in its context (`amp.hostContext`
in `#openNow`) and a track with the amp as its input records
`amp.output()` as heard. Arming the track opens the amp's panel and
switches the amp on (`requestInput("amp")`, which opens the amp's own
input through the shared inputs); `inputOpen("amp")` is whether the amp
is on. A take from the amp is shifted earlier by the input latency, as a
microphone's or a line in's is: the amp is one of them through its chain.

## Meters, knobs and tints (2026-10-16)

The Studio took over what the stem player gained over v0.128 to v0.130
(Kevin). The track row is arm, mute, solo, effects, then a 26 px level
knob (dB while it turns, double-click for unity; a MIDI track's scales
velocity as before) and the pan knob, and a `LevelMeter` takes the line
below (the header is too narrow to share the row, unlike a stem row):
`StudioEngine.levels` and `masterLevel` are `MeterState`s
(`src/lib/utils/meterLevel.ts`), fed each frame with the analysers'
peaks (`peakOf`, in place of the RMS-times-three bar), so the fall, the
peak-hold mark and the clip memory behave exactly as the stem player's;
`resetClips(trackId?)` clears a light. The master's meter in the page's
footer is the same component. A track's tint comes from the stem
palette (`STEM_TINTS`) and lives in the arrangement's `colour` field,
which the schema already carried for the lane color that never got
built: swatches in the track's ⋯ menu (`setTint`), the name and the
clips' canvases take it (`style:color`, which the drawing reads through
`getComputedStyle`, and the clip effects re-draw on a change).

## Dawn: the rename (planned 2026-10-16)

Kevin: "Studio" means too many things in software now; the descriptive
term for the Tools menu is "Multitrack Recorder", distinct from the Looper
and the Idea Recorder, and the brand term is **Dawn**, a pun on DAW in
the Stem Shovel vein, paired with the descriptive words where needed.

### What changes

- **Route.** `/studio` becomes `/multitrack-recorder` (built first as
  `/dawn`, then swapped the same day: Kevin keeps the brand names off
  the addresses while the app is young); `src/routes/studio/+server.ts`
  is a one-line permanent redirect for the dev server, and `vercel.json`
  carries the same redirect for the deployments, answered at the edge
  as a 308 before any function runs (`/ideas/recorder` is listed there
  the same way; the account-scoped ideas addresses are not, since a
  `/:account/ideas` rule at the edge would catch `/docs/ideas` too). The noindex header rule in `vercel.json` already covers
  every path but the public tool pages, so the page stays out of search
  as `/studio` was. `pageCopy.ts` maps `studio-page` to it.
- **Navigation.** The Tools menu entry reads **Multitrack Recorder**
  (`GlobalNav.svelte`, with `active("/multitrack-recorder")`), the
  footer's tools row reads **Dawn** (`GlobalFooter.svelte`), and the
  page's `<title>` is "Dawn Multitrack Recorder". The device's own header, its aria-label
  and the Recordings panel's title say Dawn.
- **Words on the page.** The copy doc `studio-page` keeps its key (the
  database row is the same document; renaming the key would orphan an
  edited copy) and its seed title becomes "Dawn" with the lead "Dawn is
  a multitrack recorder: record tracks over what you have…". The
  drum machine's fallback project name ("Studio") and the docs link
  ("Studio docs") follow.
- **User docs.** `scripts/user-docs/studio.md` (the guide, slug `studio`,
  at `/docs/studio`) and `studio-page.md` are rewritten to say Dawn, the
  slugs unchanged for the same reason as the copy key; the mentions in
  `idea-recorder.md` (its bigger sibling) and `practice-amp.md` (the
  band) follow, and the production docs merge carries them.
- **Elsewhere in the app.** The built-with page's six mentions, the
  Idea Recorder's input-settings help text, the Practice Amp's panel
  heading on the page, the home page if it names it, README.
- **Tests and scripts.** The four `studio*.spec.ts` browser tests open
  `/multitrack-recorder`; `smoke-urls.mjs` gets it (303 anonymous, 200
  bot) and expects `/studio` to answer 301 for both.

### What stays

Every identifier: the `studio` engine (`src/lib/audio/studio.svelte.ts`),
`StudioSchema`, `StudioTimeline.svelte`, `studio.remote.ts`, the
`/api/studio/*` routes, the `studio_source` and `studio_revision`
tables, the Blob paths under `accounts/<id>/studio/`, the `studio-page`
copy key and the `studio` doc slug, and the design doc's own name. None
of it is seen by a user, and renaming it would be a day of churn for
nothing. A line at the top of this document says Dawn is the product
name and `studio` the internal one.

### Decisions (recommendations in brackets)

1. The route: `/dawn` or `/multitrack-recorder`? [Built as `/dawn`, then
   Kevin chose `/multitrack-recorder` the same day: the app is young and
   an address should say what the page is; the brand is in the heading,
   the title, the footer and the device.]
2. The Tools menu: "Multitrack Recorder" alone, or "Dawn · Multitrack
   Recorder"? [Alone, since the menu lists what tools do; the footer,
   the title and the device carry the name.]
3. Doc slugs: keep `studio` and `studio-page`? [Keep: the edited copies
   survive, and `/docs/studio` keeps working; a `/docs/dawn` alias can
   come later if the address matters.]
4. Casing: Dawn or DAWN? [Dawn, so the pun is there to find rather
   than an acronym to decode.]

## Automation (2026-10-18, docs/dawn-daw-plan.md D1)

Every audio track can carry three lanes of breakpoints: the volume, the
pan and the reverb send (`constants/studioAutomation.ts`: the range, the
default and the readout of each). A lane is `{t, v}[]` sorted by time in
the parameter's own units, on the track as `automation.volume` and the
rest (`StudioAutomationSchema`, optional so the arrangement's `version`
stays 1, a thousand points a lane). The arithmetic is pure and tested:
`utils/automationValueAt.ts` (the value at a time, held outside the
lane, linear between points), `utils/editAutomation.ts` (add, move,
remove, clear; a point added on another replaces it) and
`utils/scheduleAutomation.ts` (a lane onto an `AudioParam` for one pass:
`cancelScheduledValues`, the value at the pass's start, then a linear
ramp to every point in the window, so the curve is sample-accurate).

In the engine each track gained an `auto` GainNode after the fader:
with a volume lane the fader node keeps mute and solo alone
(`#effectiveGain` returns 1) and the lane drives `auto.gain`; the pan
lane drives the panner's `pan`, the reverb lane the chain's return gain
(`TrackChain.params.reverb`, half the lane's 0..1). `#startPass`
schedules every lane with the clips (`#scheduleLanes`), `#halt`, a
seek's new pass, undo and redo settle them (`#settleAutomation`: every
curve canceled, each param at its value for the playhead), and the
offline bounce schedules the same lanes from zero on the same graph
shape. `setAutomation(trackId, param, points)` replaces a lane as one
undo step (the lane component sends the whole lane per gesture);
`writeAutomation` puts a point at the playhead when a knob is turned on
a track whose lane exists, which is what `setGain` and `setPan` do first
("touch write": no mode to learn); `automatedValue(trackId, param,
seconds)` is what the knobs, the Stage and the lane's readout show.

`AutomationLane.svelte` is reusable over any breakpoint list: the curve
as a polyline, the points as focusable handles; a click on the lane
adds a point (snapped to the grid, Shift free), a handle drags in time
and value with a live preview, double-click removes, the arrow keys
nudge (Shift by more) and Delete removes; every finished gesture is one
`onchange`. The timeline shows it under a track's clips from the **A**
button in the header, with a picker for the parameter, and the row grows
by `AUTO_H`; a clip dragged across tracks counts the taller rows
(`rowsAcross`, `rowsToPx`). A MIDI track has no audio path and no lane.

## Routing and the mixer (2026-10-18, docs/dawn-daw-plan.md D2)

The fixed three effects on a track gave way to **inserts**, and every
strip (a track, a bus, the master) is one `StripGraph`
(`src/lib/audio/stripGraph.ts`): `fader` (mute, solo, the static level)
→ `auto` (the volume lane) → the inserts (`insertChain.ts`) → `pan` →
`meter` and `out`. Sends tap after the inserts (post) or at the fader's
input (pre), each through its own gain into a bus's input. The live
context and the offline bounce build the same strips; `render()` builds
the master, the buses and the tracks on an `OfflineAudioContext` and
schedules the lanes from zero.

**Inserts** are a typed list, `{id, kind, bypass?, settings}`
(`StudioInsertSchema`), of six kinds in `constants/studioInserts.ts`:
`eq` (three bands), `compressor` and `tone` (the instruments' stages
from `fxStages.ts`), `delay` (a feedback loop with damping, `analog`
soft clip), `reverb` (the synthesized room) and `limiter` (a fast
compressor with its knee shut, make-up to the ceiling). Each kind
names its parameters with a range, step and readout, and marks the
ones a lane can drive (`automatable`: they are `AudioParam`s on the
stage); `INSERT_DEFAULTS` is a new insert's settings; a strip holds up
to `MAX_INSERTS` (8). `mixStages.ts` builds a stage per kind on any
`BaseAudioContext` (`MixStage {input, output, update, params}`), and
`insertChain.ts` chains them in order, rewiring only when the ids,
kinds, order or bypass flags change (a settings change ramps the
params in place, 20 ms from a slider, 0 for a restore). A track from
before D2 keeps its `fx`; `utils/insertsFromFx.ts` reads it as the
equivalent list (`fx-compressor`, `fx-tone`, `fx-reverb`, the active
ones in the old order) until the panel's first edit writes `inserts`,
so old arrangements play unchanged and the schema's `version` stays 1.

**Buses** (`StudioBusSchema`: id, name, `colour`, gain, pan, muted,
inserts, automation) live on `arrangement.buses`, up to
`MAX_STUDIO_BUSES` (8), and feed the master; a track's `output` names a
bus (or is unset for the master) and its `sends` (`{bus, level, pre?}`)
feed buses beside its output. The master carries `masterInserts`. The
engine keeps a strip per track, per bus and the master
(`#tracks`, `#buses`, `#masterStrip`), `#routeAll` connects each track
to its bus or the master and each bus to the master, and `removeBus`
sends its tracks back to the master and drops the sends to it. A bus
meters in `levels[busId]` as a track does. Undo covers every mixer
edit (`setInserts`, `addBus`, `removeBus`, `renameBus`, `setBusGain`,
`setBusPan`, `toggleBusMute`, `setBusTint`, `setOutput`, `setSend`:
one `#commit` each).

**Automation keys** generalize D1's three names: a lane's key on
`automation` is `volume`, `pan`, `send:<busId>` or
`insert:<insertId>:<param>` (`insertLaneKey`, `sendLaneKey`,
`parseLaneKey`); `utils/automationLanes.ts` lists what a strip can
automate now, in the picker's order, with each lane's range and its
static fallback, and `engine.lanesOf(ownerId)` is that over the live
state. A bus automates too (its volume, pan and inserts). A strip's
`param(key)` resolves a key to the `AudioParam` the scheduler drives;
a lane whose insert is gone is simply not scheduled, and the timeline
falls back to the volume lane when the picked key disappears.

**Components.** `InsertPanel.svelte` is one list of inserts for any
owner: a card per insert with a slider per parameter, bypass, move up
and down, remove, and an Add row of the kinds; every gesture hands the
owner the whole list (`onchange`), and a parameter under a lane is
marked. The timeline's sliders button opens it for a track (the lane
picker in the header now lists the track's lanes from `lanesOf`).
`MixerConsole.svelte` is the **Mixer** view beside Tracks and Stage: a
strip per track (output picker, inserts, a send knob per bus, pan, the
fader, mute and solo, meter), per bus (editable name, actions menu
with tint and Remove, inserts, pan, fader, mute, meter) and the master
(Add bus, inserts, fader, meter). Browser spec
`tests/e2e/studio-mixer.spec.ts`; component tests beside each
component; unit tests on the schema, `insertsFromFx` and
`automationLanes`.

## Export and delivery (2026-10-18, docs/dawn-daw-plan.md D3)

**One offline render for everything.** `render(target)` builds the
master, the buses and the tracks on an `OfflineAudioContext` as the live
graph has them (stripGraph.ts), schedules the lanes from zero, and plays
every MIDI clip through its instrument's own voices on that context
(`src/lib/audio/midiRender.ts`): the piano and the chord player through
a copy of their effects chain (`createPianoFx` on the offline context)
from the Grand's decoded samples or the small sampled instruments
(an AudioBuffer plays on any context), the synth standing in where a
sample is not in yet, as the live instrument does; the drums through
the kit and a drum bus with the machine's effects, each hit through the
open pattern's row (`drumMachine.rowFor`). A bounce therefore needs no
real-time pass: the page's "render MIDI tracks first" step is gone, and
the track menu's **Render to audio track** stays as a way to freeze a
part. `target.track` renders one track alone with its own settings (a
stem), `target.bus` one bus with what feeds it (the tracks routed there
and the sends into it, a track reaching it by its send alone routed
nowhere else), either without the master's inserts and fader. A second
of tail (`RENDER_TAIL_S`) lets reverbs and delays ring out.

**Loudness.** `utils/measureLoudness.ts` is ITU-R BS.1770-4 in pure
TypeScript: the K-weighting designed for the sample rate (libebur128's
derivation, which lands on the standard's 48 kHz table; the test checks
the coefficients), 400 ms blocks at 100 ms steps, the absolute gate at
−70 LUFS and the relative gate 10 LU under the mean, the true peak from
four-times oversampling with a 12-tap windowed sinc. The constants are
in `constants/loudness.ts` (−14 LUFS, −1 dBTP: the streaming services'
reference). `utils/normalizationGain.ts` is the one linear gain that
reaches the target without the true peak passing the ceiling (ffmpeg's
loudnorm in its linear mode). The engine carries a live readout too:
in `open()` the master's output feeds two `IIRFilterNode`s with the
same coefficients into an analyser per channel, `#readLoudness` sums the
channels' mean squares each meter frame and averages them over the last
400 ms and 3 s (`masterLoudness.momentary` and `.shortTerm`, LUFS,
null when stopped or under the gate); the page shows the short-term
figure beside the master meter.

**The export** (`src/lib/audio/studioExport.ts`, over an `ExportEngine`
so a test hands it a fake): `exportSong` renders what the options ask
(the mix, a stem per track with clips, a stem per bus, a DAWproject),
measures each buffer, applies the normalization gain when asked, and
encodes 24-bit (`encodeWav24`) or 16-bit (`encodeWav`) WAV, naming the
files after the song (`fileSafe`); `bundleExport` zips them
(`utils/zipBlobs.ts`, fflate's synchronous zip, audio stored, text
deflated). The DAWproject (`utils/dawproject.ts`, Bitwig's open
interchange format 1.0) is `project.xml` (the transport, a track per
track and bus and the master with a channel each: volume, pan, mute,
solo, destination, sends; the clips in seconds, an audio clip over its
file with offset and fades, a MIDI clip's notes; the volume and pan
lanes as `Points` on the channel's parameters), `metadata.xml` (the
title) and `audio/<sourceId>.wav` per source, zipped with the
`.dawproject` extension; inserts stay out, since the format names a
DAW's own devices. `ExportPanel.svelte` is the Export… panel from the
song's menu (a FloatingPanel): what and how, Export, then each file's
size, loudness, true peak and the gain applied. Browser spec
`tests/e2e/studio-export.spec.ts`; unit tests on each util and the
export module; a component test on the panel.

Left for later: MP3 delivery (a mix sent to a song as a demo gets its
rendition from the jobs function already), stem export straight to a
song with the buses, a loudness history on the master.

## Editing depth (2026-10-18, docs/dawn-daw-plan.md D4)

**Crossfades and fade curves.** Where two clips on a track overlap they
crossfade: `utils/clipCrossfades.ts` widens the earlier clip's fade-out
and the later clip's fade-in over the overlap (never past half of
either clip) and marks those fades equal power, while a clip's own
longer fade keeps its shape. A clip may set `fadeShape` (`linear` or
`power`, `STUDIO_FADE_SHAPES`; absent is linear) for its own fades.
`utils/fadeCurve.ts` is the curve for an `AudioParam`'s
`setValueCurveAtTime` (a quarter sine for equal power, so sin² + cos²
holds the level through a crossfade); `scheduleFades` in the engine
applies the in and out curves to a clip's gain, each at most half the
span less a hair since curves may not overlap, both live (`#startPass`
computes the crossfades once per pass and hands each clip its fades)
and in the bounce. The timeline draws the fades as they play, straight
wedges for linear and bowed ones for equal power (`data-fade-in`,
`data-fade-out` carry the shape).

**Comping.** A clip that holds alternate takes gets a **T** in its
track's header: the take lanes open under the clips, one per alternate
(`TAKE_H`), each drawing that take over the comp clip's span (the
selected clip on the track when it has takes, else the first with
takes). A swipe over a lane is a region; on release the engine's
`compFromTake(clipId, takeSourceId, from, to)` splits the clip through
`utils/compRegion.ts` into up to three pieces, the middle playing the
take with the other takes behind it, the pieces overlapping by a 20 ms
crossfade so the joins hold their level. One undo step.

**Selection and the clip tools.** Shift-click adds a clip to the
selection (`selectedIds`, bound beside `selected`, the last clicked
one the clip bar shows); a selection drags together (`moveClips`, one
step, bounded by the tracks and zero), Delete removes it all
(`deleteClips`) and Shift+Delete ripples, closing the gaps on each
track (`utils/rippleDelete.ts`: the removed clips' spans merged where
they touch, later clips on the track moved earlier by their length).
The clip bar's tools each make a **new recording** of the clip's audio
and hand it to the page's queue as an import (`#sourceFromChannels`:
an `AudioBuffer` from channel data, the source registered pending, the
WAV uploaded): **Reverse** (`utils/reverseChannels.ts`), **Normalize**
(`normalizeBuffer`, the looper's; nothing happens for a clip already
hot or near silence) and **Consolidate**, which renders the selected
clips of one track into one recording with their gains, fades and
crossfades baked in (`utils/mixClipsToChannels.ts`, pure over channel
data: the same fades as the engine schedules) and replaces them with
one clip. A fade shape picker sits beside the fades.

**Markers.** `arrangement.markers` (`StudioMarkerSchema`: id, time,
name; `MAX_STUDIO_MARKERS` 64) sit on the ruler as flags. **M** or the
flag button in the transport adds one at the playhead (`addMarker`,
named in order), a click jumps there, a double-click renames, Delete
on a focused flag removes it; `moveMarker` and `markerFrom(t, step)`
exist for a later jump-to-next key. Markers go with the song as part
of the arrangement, so a revision keeps them.

Browser spec `tests/e2e/studio-editing.spec.ts`; unit tests on each
util; the timeline's component tests cover the selection, the drag of
a selection, the wedges, the take lanes and the markers. Left for
later: clip gain envelopes, a range selection on the ruler with
ripple insert, the song's sections drawn on the ruler, a jump-to-marker
key.

## Time (2026-10-19, docs/dawn-daw-plan.md D5)

**The tempo map.** The arrangement keeps its tempo and meter as before
(`bpm`, `beatsPerBar`: the song's own, from zero) and gains
`tempoChanges` and `meterChanges` (`StudioTempoChangeSchema`,
`StudioMeterChangeSchema`: a second and a value, up to 64 each).
`utils/studioGrid.ts` turns them into the stem player's `BarGrid`
(`audio/measures.ts`: `barAt`, `secondsAtBar`, `tempoAt`,
`beatsPerBarAt`, `barSecondsAt`), so Dawn and the stem player count
bars the same way. The engine's `grid` getter is that grid; `snap` goes
through `utils/snapToBeat.ts` (the nearest division of a beat on the
grid, so it follows the changes), `barSeconds` and `beatSeconds` read
the bar and beat the playhead is in, `quantizeClip` snaps each note
through the grid at its own moment, the page's readout is `barAt`, and
the ruler's ticks walk the map bar by bar (`rulerTicks` with `map`; the
label thinning is decided by the first bar). The single-tempo
`snapToGrid` and `quantizeNotes` utils are gone. `setTempoChange`,
`removeTempoChange`, `setMeterChange`, `removeMeterChange` edit the map
as undo steps (a change at zero is the song's own value); the Timing
menu adds one at the playhead, and the ruler shows each as a small flag
at the top (blue for tempo, green for meter): click seeks, double-click
edits, Delete removes.

**The click and the count-in follow the map.** `play` sets the
metronome from the tempo and meter at the start and lines its first
beat up with the bar the start is in (`secondsAtBar` of `barAt`), the
count-in being that bar's length. Changes inside a pass are queued with
the MIDI notes (`#queueMidi`, a `QueuedNote` with no clip): when one
fires, the metronome stops and restarts at the change's moment with
the new tempo and meter, and the drum machine playing along takes the
tempo too. A pass rebuilt by a seek or an edit requeues them.

**Swing and humanize.** A MIDI track carries `swing` and `humanize`
(0 to 1, from the clip bar's sliders when a MIDI clip is selected;
`setTrackSwing`, `setTrackHumanize`). They apply as the notes play,
never to the stored notes: `utils/swingNotes.ts` delays the off-beat
eighth of every beat on the grid toward a triplet feel (two thirds
through the beat at 1) and scatters time (±30 ms × humanize) and
velocity (±0.2 × humanize) from a random source a test pins. The live
queue and the offline render (`renderMidiClipsOffline`'s `feel`) both
go through it, so a bounce swings as playback does.

**Tempo detection.** `utils/detectTempo.ts`: the energy per 10 ms
frame, its rises as an onset curve, the autocorrelation over lags from
240 down to 40 bpm with each lag scored with its neighbors (a period
that is not a whole number of frames spreads over two), the period
refined between lags, and a reading outside 70–180 bpm folded into that
range when the folded lag scores nearly as well. "Detect tempo" on an
audio clip sets the song's tempo from it.

**Stretch and pitch.** `utils/stretchChannels.ts` is a WSOLA in pure
TypeScript: 50 ms Hann grains laid down at the ratio, each nudged within
10 ms to where it continues the last one best (by correlation on a mono
mix, so stereo stays aligned), the overlaps normalized. A pitch shift is
`utils/resampleChannels.ts` (linear interpolation at the semitone's
factor) followed by a stretch back to length. `stretchClip(clipId,
{ratio, semitones})` makes the result a new recording the clip follows
(`#replaceClipSource`, uploaded like an import); the clip bar's Length ×
and Pitch fields with Apply stretch. signalsmith-stretch (the plan's
pick) was tried and set aside: it loads its worklet from a blob URL,
which the site's `script-src` refuses; serving its worklet from
`static/worklets` would need the package's wrapper rebuilt, a later
step if the WSOLA's quality falls short on transient material.

Browser spec `tests/e2e/studio-time.spec.ts`; unit tests on each util;
the timeline's component test covers the flags. Left for later:
beats-anchored clips (notes in beats rather than seconds, so a MIDI
part follows a tempo change), tap tempo lives on the metronome already,
tempo ramps between changes.

## Instruments and the library (2026-10-19, docs/dawn-daw-plan.md D6)

**The registry.** `src/lib/audio/instruments.ts` holds one adapter per
entry of `STUDIO_INSTRUMENTS` (`constants/studioInstruments.ts`, with
`isInstrument` and the input labels, which the engine re-exports for its
callers): `host(ctx, env)`, `prepare()` (samples, kits), `output()`,
`scheduleNote(note, track)`, `audition(note, track)`, `onNote(listener)`
for a hand-played take, `cancelScheduled()`, `latency` ("output" for a
part played against what is heard, "none" for one on the clock) and
`renderOffline(off, into, events, bpm, track)` for the bounce. The piano
and the chord player share one adapter factory, the drums have theirs
(General MIDI notes to voices, hits as note pairs), and the engine's
`if` branches became lookups: hosting, play and record readiness, the
queue's fire, the halt, the capture's input node, the MIDI arm, the
take's latency shift and the offline render (`midiRender.ts`, now a
thin wrapper that applies the feel and calls the adapter).

**The sampler.** A fourth instrument, with no keys of its own: a MIDI
track whose input is the Sampler plays one of the song's recordings
across the keys. The sound lives on the track (`StudioSamplerSchema`:
`sourceId`, `root` note, `attack`, `release`, `loop`; `SAMPLER_DEFAULTS`
and `samplerFor` for the first choice; `setSampler` edits as an undo
step) and the adapter reads it per note, the recording from the
engine's buffers through the host `env`. `samplerVoice.ts` is the voice:
a BufferSource at the rate that moves the root to the key (the twelfth
root of two a semitone), a gain with the attack in and the release out,
looping when asked, a square-law velocity. The clip bar shows the
sampler's settings when a MIDI clip on such a track is selected. A
sampler take by hand records nothing (its `onNote` is empty); the roll's
clicks audition through it.

**Presets.** Three subtractive presets on the piano's synth
(`synthVoice.ts` patches, `constants/piano.ts`): Brass (a saw section
with a slow bite), Strings (detuned saws that bow in and hold, with
vibrato) and Bell (inharmonic sines that ring and die away). They are on
every piano, the chord player's and the Studio's included.

**The library.** `LibraryPanel.svelte` lists every recording the song
holds (the engine's `sources`: takes, imports, the clip tools' results),
sorted and filtered, with its length, channels, how many clips use it
and its upload state; a play button hears it alone (`previewSource`, a
BufferSource straight to the destination, the one before stopped); a
row is draggable with `application/x-stemshovel-source` on the drag.
The timeline's audio lanes take the drop (`onlanedragover`,
`onlanedrop`): the recording lands as a clip over its whole length at
the drop's time, snapped (`addClipFromSource`), and becomes the
selection. The page's Library button opens it as a FloatingPanel.

Browser spec `tests/e2e/studio-library.spec.ts`; `instruments.test.ts`
over stand-ins for the singletons, `samplerVoice.test.ts` over a fake
context, `LibraryPanel.svelte.test.ts`, the timeline's drop test. Left
for later: a soundfont player and multisample kits (the sampler plays
one recording), a loop and one-shot library beyond the song's own
recordings, WAM 2.0 hosting (third-party plugin scripts and their hosts
fall outside the site's content security policy; a curated set served
from the site itself would be the way).

## Collaboration (2026-10-19, docs/dawn-daw-plan.md D7)

**Shared songs.** A Dawn song stays the creator's (`idea.createdBy`)
until they share it: `idea.shared` (migration 0091) opens it to every
editor of its account. `listStudioSongs(userId, editorAccountIds)` lists
the user's own songs and the shared ones in the accounts they edit;
`StudioSongView` carries `shared` and `own`, the Recordings list says
"shared" or "the band's". `requireStudioAccess(locals, ideaId)`
(access.ts, over `studioSongAccess`) is the gate for every Studio remote
function and the three upload routes: the creator always, a member when
the song is shared and they edit in its account; it answers `own`, which
sharing (`setStudioShared`, the song menu's "Share with the band") and
deleting keep for the creator. Sharing notifies the account's editors
(kind "song", `notifyStudioShared`) with a link to
`/multitrack-recorder?song=<id>`, which the page opens on load
(`?open=comments` opens the thread too).

**Two browsers on one song.** Autosave stays last-write-wins with a
guard rather than a merge: the browser sends `base`, the newest
revision number it knows (set when a song opens, after each autosave,
save or restore), and `saveStudioAutosave` refuses with `conflict` when
a newer revision exists; the page then tells the user and reloads the
newest from the server (`studioSong`), dropping its own unsaved edits.
Real-time co-editing with a Yjs document is the later step the plan
names; this keeps two people from silently overwriting each other.

**Comments.** `studio_comment` (migration 0091: account, idea, author,
body, `at` seconds or null; deleted with the song and with its author,
cascade.ts) with `studioComments.remote.ts` (`studioComments`,
`createStudioComment`, `deleteStudioComment`: anyone who may work on the
song reads and posts, the author or an owner / admin deletes) and
`notifyStudioComment` (the creator and everyone who commented, but the
author; kind "comment"; the link opens the thread). `StudioComments.svelte`
is the panel: the thread with authors and pins (a pin seeks), a box with
"At the playhead", Ctrl+Enter posts. The timeline draws pinned comments as
dots at the ruler's foot (`comments` prop; a click seeks and opens the
panel).

**Versions compared.** `utils/diffArrangements.ts` reads what differs
between two arrangements in words (tempo, meter, the map, master, tracks
added, removed, renamed or re-set, clips added, removed, moved, trimmed
or re-set, buses, markers); "Compare" on a revision in the Recordings
panel fetches its arrangement (`studioRevisionData`) and lists the
differences from the song as it stands.

Browser spec `tests/e2e/studio-collab.spec.ts` (two pages on one song);
tests on the access helper, the remote functions, the cascade, the diff
and the panel. Left for later: real-time co-editing and presence, a
comment's edit, replies, and comments on a mix of a Dawn song.

## A song's stems in (2026-10-20)

Kevin: a way to load the latest stems from a song into Dawn. The song
page's Downloads menu has **Open stems in Dawn** (editors), and Dawn's
"Send to a song" block has **Load the song's stems** beside the two
buttons that go the other way. Both call `importSongStems` (studio
remote, an editor of the song's account), which runs
`importSongStemsIntoStudio` on the server: the song's ready stems in their
order (`MAX_STUDIO_TRACKS` at most), each copied in Blob (`copyBlob`:
read and put, into the recordings' store) to a source of a new Dawn song
named after the song (kind "import", the stem's label, channels, length
and the peaks the stem carries; the rate recorded as 48 kHz, a hint, since
the browser decodes at its own rate), and the first revision "Stems of
<song>" laid out with a track per stem (the stem's gain, pan and tint) and
one clip per track from 0; the song's first tempo and meter changes set
the grid (a stem with no stored length makes a one-millisecond clip,
which the engine runs to the source's end once it decodes, and the song
page schedules the stem's measuring, docs/uploads-and-blob.md "Stems
measured after the fact"). The song page then goes to Dawn on the new song; Dawn autosaves
the open song, refreshes and opens the new one. A new Dawn song each time,
never tracks added to an open one: the arrangement is the browser's while
a song is open, and a copy keeps the stems' own revision apart. A direct
Blob-to-Blob copy (the SDK's `copy`) would spare the function the bytes;
left for when stems grow.

## Key, and the changes both ways (2026-10-20)

Kevin: key, time signature and tempo by section in Dawn, as in the stem
player, carried in when a song's stems load and carried out to a fresh
song. The tempo map (D5) already kept tempo and meter changes on the
ruler; the arrangement now keeps a **key** too: `key` (the song's own
from zero, as written, up to 20 characters) and `keyChanges`
(`StudioKeyChangeSchema`, a second and a key). The engine's `setKey`,
`setKeyChange`, `removeKeyChange` and `keyChanges` work as the tempo
map's (undo steps; a change at zero is the song's own), `keyAt(seconds)`
is the key in force (`utils/studioChanges.ts`, `studioKeyAt`), the
Timing menu has the song's key and "Add key change" at the playhead (the
value checked as the song settings check a key), the ruler shows a key
change as a violet flag after the tempo's and the meter's, and the
screen's line names the key at the playhead.

Both ways through `utils/studioChanges.ts`: `songChangesToStudio` takes
a song's changes (tempo, key, time signature from a second each) into
Dawn's shape, the first of each kind the song's own and the rest on the
ruler (a tempo clamped to 30–300, a time signature's beats a bar alone,
the note value lost, as Dawn counts quarters), and `studioChangesToSong`
goes back, the meter over quarters. `importSongStemsIntoStudio` uses the
first; the Send block's **New song with these tracks** (a project
picked, `createSongWithChanges` in the studio remote: the song made in
the project with the changes saved, then the tracks uploaded as its
stems as "Add tracks as stems" does) uses the second. Adding tracks to
an existing song leaves that song's changes alone.

## Signed out (2026-10-20)

Kevin: "Will non-logged-in users be able to record on the Dawn page /
will it record to localStorage and export a bounce to mp3?" Yes, as the
looper does (docs/looper.md, "Signed out"). The page's load no longer
requires sign-in: `account` is null for a visitor, and for a member of
no editing account (who was sent to /accounts before); `songs` and
`projects` are empty then, the panels take the null account as the
looper's do. The song then lives in the browser, in IndexedDB rather
than localStorage (a take is tens of megabytes of samples; localStorage
holds about five): `src/lib/audio/studioLocal.ts` keeps the arrangement,
the title and the notes as one record (`LocalSong`, written by the
persistence class in place of `autosaveArrangement`, so the debounce and
the dirty flag work unchanged), and the recordings are the upload
queue's own pending sources under the idea id `LOCAL_SONG` ("local"):
`StudioQueue` keeps them on disk as it keeps any take, with the status
`kept`, and holds them back from uploading. On the page, `openLocalSong`
loads the record and the kept recordings into the engine, each with its
blob beside the source view (`localSourceViews`); the engine decodes a
blob it is handed instead of fetching (`#bytesOf`), because the content
security policy's `connect-src` refuses a `blob:` URL. A line under the
title says the song is kept in this browser ("Back from last time" after
a reload), with a sign-in link; Save revision, comments, sharing, the
Send block and the Recordings list show a prompt instead. New song means
start over (the kept song and its recordings go, after a confirm).

## Into the account (2026-10-20)

Kevin: a user who signs up after recording a song signed out can sync it
with their account. Signed in with an editing account, the page's mount
runs `findKeptSong`: the queue's kept recordings and the local record;
when there is a song (a recording, or clips), a bar under the title
offers it: **Save to <account>** makes the idea (`createIdea`, kind
song), saves the arrangement as its first autosave and the notes, then
`queue.adopt(ideaId)` re-files the kept recordings under the song and
uploads them in order (the usual path: reserve, upload, ready), clears
the local record, and opens the song with the blobs beside the server's
sources so it plays at once; the uploads finish in the background.
**Discard** removes the kept song and its recordings after a confirm.
The sign-in link carries `next=/multitrack-recorder`, so sign-up, then
an account, lands back on the page with the offer waiting.

## The session bundle (2026-10-21, docs/daw-interop-plan.md)

Of the DAWs Stem Shovel aims at, only Cubase reads DAWproject; Logic,
Pro Tools, Ableton Live and Audacity read audio files and a MIDI file.
The export panel's **session bundle** is that lowest common denominator,
one zip (or a folder inside the export's own zip: `ExportFile.entries`
and `folder`, which `bundleExport` expands rather than nesting a zip):

- `clips/NN Track - Clip @ 12.500s.wav`: each audio clip over its span
  with its gain and fades (utils/mixClipsToChannels.ts over the one
  clip), at its source's rate, mono when the source is, as 24-bit
  Broadcast WAV. `utils/bext.ts` writes the `bext` chunk (EBU 3285
  version 2) with the time reference at the clip's start in samples, the
  originator, the clip's id as the reference, the date, the clip's
  loudness and true peak, and a coding history line; `encodeWav24` takes
  extra chunks between `fmt ` and `data`. Logic ("Move to Original
  Record Position"), Pro Tools ("Spot"), Cubase ("At Origin"), Reaper
  and Ardour place the file from it. `readBext` reads it back, for the
  tests and for an import that wants to honor it one day.
- `stems/NN Track.wav`: a render per track from zero through its strip,
  stamped at zero, for the DAWs that import at the insert point (Live,
  Audacity, GarageBand).
- `Title.mid`: `utils/sessionMidi.ts`, a format 1 file at 480 ppq. The
  conductor track is named after the song and carries the tempo at zero
  and each tempo change, the meter and its changes, the key and its
  changes as key signatures (`utils/keySignatureOf.ts` turns "F#m" or
  "A♭ major" into sharps and minor; a modal key is skipped) and the
  markers; then a track per MIDI track with notes, named after it, on
  its own channel (10 for a drums track). Ticks come through the
  arrangement's own tempo map (`beatsBetween`, audio/measures.ts), so
  a note at a second stays there once the DAW applies the tempos.
  `midiFileTracks` in utils/midiFile.ts writes format 1; `midiMarker`,
  `midiTrackName` and `midiKeySignature` are the new meta events, and
  `parseMidi` (audio/midi.ts) now keeps tempos, meters, keys, markers
  and track names in seconds, which is how the tests read a file back.
- `labels.txt`: `utils/audacityLabels.ts`, Audacity's label track
  (start, end, text, tab-separated): the song's tempo, meter and key at
  zero, every change and every marker by time.
- `README.txt`: `utils/sessionReadme.ts`, what the folders hold and the
  menu path that opens them in each DAW.

The DAWproject writer gained the same structure for Cubase: `Markers`
(seconds), `TempoAutomation` and `TimeSignatureAutomation` as held
points in beats, which the reader already took. Validating the writer
against Bitwig's schema (tests/dawproject/, libxml2-wasm in the unit
tests) found its `Channel` children out of the schema's sequence
(Mute, Pan, Sends, Volume): Bitwig's JAXB reader did not mind, a strict
one would have. Every writer test now validates.

## A Sandyne project (2026-10-21, docs/daw-interop-plan.md "Sandyne")

The Export panel's **A Sandyne project** writes the song as the free
Sandyne DAW's own file (`utils/sandProject.ts`): `.sand` is plain JSON,
read from Sandyne 2.5's files and proved with its headless `inspect` and
`rendertracks` (`bun run interop:sandyne`, scripts/interop/sandyne.ts).
One tempo and meter, the master level, the key as the project's scale, a
sample track per audio track and a synth track per MIDI track (level,
pan, mute, solo, color), and the clips as contents in beats: a sample
clip over its file from its offset with its gain and fades, a notes
clip's notes with velocity 0..127. The clips' sources go beside the file
as 24-bit WAV under `samples/` (`sourceFiles` in `studioExport.ts`, the
same helper the DAWproject uses for `audio/`), and the whole thing is a
folder in the export's zip like the session bundle. Sandyne has one
tempo, so a song with tempo changes keeps its seconds and not its bars;
buses, sends, inserts, automation and markers have no place in the file.

## A Reaper project (2026-10-22, docs/dawproject-plan.md step 3)

The Export panel's **A Reaper project** writes the song as Reaper's own
`.rpp` (`utils/rpp.ts`) with its media in `media/` beside it, a folder in
the export's zip like the Sandyne project: the tempo map as the tempo
envelope's points with their time signatures, the markers, the key and
title in the project notes, the sample rate, the master's volume; a track
per track with its volume, pan, mute, solo, color and envelopes; a
folder track per bus holding the tracks routed to it, with a receive per
send; an item per clip over its file with offset, volume and fades, or a
MIDI item with the notes as events in ticks. Inserts stay out (Reaper's
FX are its plugins), and a MIDI item has no instrument in Reaper until
one is added. The import side (`utils/rppRead.ts`, through
`utils/unpackProject.ts`) opens a Reaper project as a new song the way a
DAWproject opens, the media chosen beside it (Reaper's project names its
files by path and holds none). `bun run interop:rpp` proves both against
Reaper itself (docs/daw-interop-plan.md, tier B).

## Opening an Ableton Live set (2026-10-22, docs/dawproject-plan.md step 4)

**Import audio, MIDI or a project…** and the convert page take an Ableton
Live set (`.als`, gzipped XML as Live writes it, or a zip of the Live
project folder with its `Samples/`) the way they take a Reaper project:
`utils/alsRead.ts` through `utils/unpackProject.ts` (format "ableton"),
the samples chosen beside the set and found by the set's own relative
paths or by name. The tracks with their levels, pans, mutes, colors and
envelopes, a group as a bus and a return as a bus the sends feed, the
arrangement's clips in seconds through the tempo map (a looped clip kept
as one, "Looping a clip" below, a warped clip's file offsets through its
warp markers, an unwarped clip's in seconds), the MIDI clips' notes, the tempo and its
automation as steps, the time signature and its changes, the locators as
markers. Devices, session-view clips, deactivated and transposed clips are
listed in the note when the song opens. One way: Dawn writes no Live set
(the session bundle is the way into Live).

## A MIDI file as a project (2026-10-22, docs/dawproject-plan.md step 5)

The convert page takes a Standard MIDI File (`utils/midiRead.ts` through
`utils/unpackProject.ts`, format "midi") as a project of MIDI tracks: a
format 1 file's tracks, a format 0 file's channels (channel 10 a drums
track), each with one clip of its notes; the tempo map, meters, key and
its changes and markers from the conductor; the conductor's name as the
title. Controllers and the like are counted in the report. From there the
exports are the DAWproject, the Reaper project, the Sandyne project and
the session bundle, with the tempo map intact. Dawn's **Import audio,
MIDI or a project…** still lands a MIDI file as a clip on the current
song, as before.

## Wider automation (2026-10-22, docs/dawproject-plan.md "What the format carries that Dawn lacks" 4)

Three things beyond the volume and pan lanes. **A mute lane** on every
strip: the key `mute` on `automation`, a switch (`STUDIO_AUTOMATION.mute`
is a `step` range: 1 muted, 0 on, held to the next point). A stepped
range runs through the lane code as a flag: `automationValueAt(points,
t, fallback, hold)` takes the last point at or before `t`,
`scheduleAutomation` with `hold` reaches each value through a 5 ms ramp
(`STEP_RAMP`) instead of a line to the next point, `editAutomation`
snaps a stepped point to the nearer end of its range, and
`AutomationLane` draws the steps. `laneTransfer(key)`
(utils/automationLanes.ts) says how a lane lands on its param: the mute
lane's 1 is a gain of 0, held; everything else rides as it is. The strip
gained a `mute` GainNode after `auto` (stripGraph.ts: `fader` → `auto` →
`mute` → the inserts), `param("mute")` names it, and the engine's
`#scheduleLanes` and `#settleAutomation` apply the transfer. The strip's
own mute button stays on the fader, so the lane's fallback is 0 (on): a
muted track with a mute lane is muted either way.

**The master's own lanes**: `masterAutomation` on the arrangement
(`volume`, `mute` and its inserts' parameters; the master has no pan).
The engine's lane methods take `"master"` as an owner id (`lanesOf`,
`automatedValue`, `setAutomation`, `writeAutomation`, `hasAutomation`),
through `#owner`/`#masterOwner` and `#setOwnerAutomation`; the master
strip's lanes are scheduled with every pass and the offline render,
settled with the rest, and its fader reads unity while a volume lane
drives (`#masterGain`); `setMaster` touch-writes the lane when one
exists, and the mixer's master slider shows the automated level.

**Bus and master rows in the timeline**: under the tracks, one thin row
per bus and one for the master (`MIX_H`, `data-mix-row`), each with its
name and an **A** button; open, the row grows by `AUTO_H` with the
parameter picker in its header and an `AutomationLane` in its lane area
(`data-automation-for` is the bus id or "master"). Buses had lanes in
the schema and the engine since D2 but nowhere to edit them; now they
and the master do, in the one place with a time axis.

**Files.** The DAWproject writer writes a mute lane as `<Points>` of
`BoolPoint`s on the channel's `Mute` parameter, a send lane as real
points on the `Send`'s own `Volume` parameter, and the master's lanes on
its channel (`<Lanes track="…master…">`); the reader registers the
`Mute` and each send's `Volume` ids beside the volume and pan
(`paramOwner` keys `mute` and `send:<busId>`), reads `BoolPoint`s as
the mute lane, keeps the master's volume and mute as `masterAutomation`
(its pan automation is reported), and still reports a device
parameter's automation (Dawn's inserts have no device in the format).
The Reaper writer writes `<MUTEENV` with the value inverted (Reaper's 0
is muted) and shape 1 (square) on every point, an `<AUXVOLENV` right
after the `AUXRECV` line of the receive it belongs to (where Reaper
keeps it), and `<MASTERVOLENV` at the project's level after
`MASTER_VOLUME`; the master's mute lane stays out (Reaper's master has
no mute envelope; it drops one on save). The reader reads them back the
same way (a receive's envelope is the AUXVOLENV block that follows its
line). The
Live reader reads a track's `Speaker` envelope (bool events; the
speaker on is the mute lane's 0), each send holder's `Send` envelope,
and the master's `Volume` and `Speaker` envelopes. Verified in Reaper
7.82 by a rendered probe and `bun run interop:rpp` (FINDINGS.md). Sandyne
has no automation. The arrangement diff names "Master automation
changed". Browser spec: `tests/e2e/studio-automation.spec.ts`.

## Expression lanes (2026-10-22, docs/dawproject-plan.md "What the format carries that Dawn lacks" 3)

A notes clip can carry expression: `lanes?: StudioClipLane[]` on
`StudioClip`, each `{ kind: "cc" | "bend" | "pressure", controller?,
points: { t, v }[] }` (`src/lib/constants/studioLanes.ts`: at most
`MAX_STUDIO_LANES` lanes of `MAX_STUDIO_LANE_POINTS` points). A point is
a breakpoint held until the next one, MIDI's own way: `t` in content
seconds like a note's, `v` normalized 0..1 whatever the lane (a
controller or the pressure as value/127, the bend with 0.5 at center,
`BEND_RANGE_SEMITONES` = 2 each way). `laneDefault(kind)` is what a lane
means when nothing sets it (the pedal up, the bend centered), and
`laneLabel` names one ("Sustain", "Modulation", "Pitch bend", "CC 17";
`CC_NAMES`).

`utils/clipLaneEvents.ts` turns a clip's lanes into changes on the
song's clock the way `clipNoteEvents` does its notes: in each pass of
the clip (utils/clipSegments.ts) the value in force where the pass
starts, then every point inside it, and at the clip's end each lane back
to its default so nothing rides into the next clip. `utils/lanesFromEvents.ts`
goes the other way, from a stream of changes (a take's pedal and wheel, a
MIDI file's controllers, a Reaper item's events, a DAWproject's expression
points) to lanes timed from an origin: a change before the origin becomes
the value at zero, repeats and a leading default are dropped, an
over-long lane is thinned evenly. `utils/sliceLanes.ts` cuts the lanes of
a take into its pieces as `sliceNotes` cuts the notes.

**Instruments** (`src/lib/audio/instruments.ts`): the adapter grew
`onControl(listener)` (the pedal, the wheels and the bend as they move,
stamped with the context's clock) and `scheduleControl(event, track)` (a
lane event on the clock), both optional, and `renderOffline` takes the
clip's lane events as a sixth argument. The piano implements all three:
`PianoEngine.onControl` is fed from `setSustain` (CC 64, so the pedal on
the panel, the computer keyboard and a MIDI device all count), from the
MIDI handler for every controller, the pitch bend (0xE0, 14 bits) and the
channel pressure (0xD0); `setBend(semitones, at)` moves every voice
sounding and every scheduled voice through the new `bend?(semitones,
at)` on `SynthVoice` and `SampledVoice` (the synth through the
oscillators' detune on top of each partial's own, the samples through
`playbackRate`, a 5 ms glide), and voices started while a bend is in
force start bent. `scheduleControl` sets the bend on the clock and puts
the pedal (CC 64 at or above half) or the wah (CC 1, 11 and 4, as a MIDI
device rides it) at its moment through a timer; `cancelScheduled` drops
the timers and lets go of what a lane set (bend centered, pedal up, wah
released) so a stop or a seek leaves the panel as the player had it.
Offline the bend lane is applied per voice (the bend in force at its
start, every change while it sounds); the pedal and the wah are not
rendered offline (the voices' releases are already in the notes). The
drum machine and the sampler take no expression.

**The engine**: `#armMidi` subscribes to `onControl` beside `onNote`,
`#finishMidiCaptures` builds the pass's lanes with `lanesFromEvents`
from the loop start and slices them per piece, and `#landMidiClip` puts
them on the clip. `#queueMidi` queues the clip's lane events beside the
notes (each fires `scheduleControl` on the instrument). `setClipLanes`
replaces a clip's lanes (one undo step). `midiBlobOf` (Export MIDI) and
`importMidi` carry them; `renderMidiClipsOffline` hands them to
`renderOffline`; the session bundle's MIDI file writes them.

**Files**: `audio/midi.ts` now keeps controllers, pitch bends and
channel pressure (`summary.controls`, normalized) instead of counting
them; program changes and polyphonic pressure are still `otherEvents`.
`midiFile.ts` has `midiControl`, `midiPitchBend`, `midiPressure` and
`midiLaneEvent`; `notesToMidiBlob` takes the lane events and
`lanesFromMidiSummary` reads them back; `midiRead` gives each part's
clips the lanes of its channel or track. The Reaper writer puts the lane
events in the item as `b0 cc vv`, `e0 lsb msb` and `d0 vv` lines before
the notes at the same tick, and `rppRead` reads them back (a value rides
as 7 bits, so 0.5 returns as 64/127). The DAWproject writer writes each
lane as `<Points unit="normalized">` with a `<Target expression=…>`
(`channelController` with its `controller`, `pitchBend`,
`channelPressure`) and `interpolation="hold"` points beside the clip's
`Notes`, as Bitwig writes its own exports; `dawprojectRead` keeps such
Points as lanes (polyphonic pressure and timbre are reported). A Live
set's MIDI clip envelopes are reported, not read: their targets are
numbered per set. Sandyne has no place for them.

**The roll**: a **Lane** menu in the piano roll's toolbar adds a lane
(Sustain, Modulation, Expression, Breath, Foot pedal, Brightness, Pitch
bend, Pressure; one of each); each lane is an `AutomationLane` row under
the notes, in content time, scrolling with the grid (click adds a point
on the grid, drag moves it, double-click removes it, the bend bipolar
and read in semitones), with its name and a remove button in the keys
column. Keys inside the lanes do not reach the roll's handler, so Delete
there removes a point, not the notes. The arrangement diff names a
change as "expression". Browser spec: `tests/e2e/studio-roll.spec.ts`.

## Looping a clip (2026-10-22, docs/dawproject-plan.md "What the format carries that Dawn lacks" 1)

A clip can repeat its content: `loop: { start, end }` on `StudioClip`,
content seconds like `offset`, at least `MIN_CLIP_LOOP_SECONDS` (0.1 s)
long. The clip plays from `offset` to `end`, then `start` to `end` again
and again for its `duration`; an `offset` at or past the loop's end starts
inside the loop. `utils/clipSegments.ts` is the one place that unrolls it:
`clipSegments(clip)` gives the passes as `{ start, offset, duration }`, and
`clipContentTime(clip, t)` the content second `t` seconds in. Everything
that reads a clip's content goes through it: the engine schedules a
buffer source per pass (`#startClip`, the offline render) with the clip's
own fades on the outer edges and the click-guard fades between passes;
`mixClipsToChannels`, `clipNoteEvents` (a note sounds in every pass, cut at
the pass's end), the timeline's waveform and note roll (a faint line where
the passes meet, the clip's label marked ↻), the piano roll (its dimming
stops at the loop's end, the playhead through the passes), `splitClipAt`
(the right part starts where the passes stand at the cut and keeps the
loop), the clip tools (`#clipChannels` lays the passes end to end, so
Reverse, Normalize and Consolidate work on what plays), the export's trim
and the session bundle, a clip's MIDI export, and the revision diff
("looped", "loop moved", "loop off").

**Loop** in the clip bar (Shift+L; L alone is the transport's loop) makes what the clip shows its loop
(`setClipLoop(id, true)`: `[offset, offset + duration]`), after which the
right edge drags out past the recording's end to repeat it
(`trimmedClip` is given no source bound for a looped clip). Off again, the
clip plays once and shrinks to what its recording holds from its offset.
Another take through `cycleTake` keeps a looped clip's length; a clip
tool's new recording clears the loop (what it made is the unrolled audio).

The writers: the DAWproject carries `loopStart`/`loopEnd` in content
seconds (its own words), and `dawprojectRead` keeps them when the loop
comes round within the clip (Bitwig writes a loop the clip's own length on
every clip; that is no loop). A Reaper project writes a looped clip that
starts inside its loop as a `SOURCE SECTION` of the file with `LOOP 1`,
which Reaper plays round; one that plays into its loop from before it
goes out as an item per pass, and `rppRead` reads a looping section back
as a loop. Sandyne has no clip loop: a content per pass. A Live set's
looped clips (`LoopOn`) come in as looped clips when the tempo holds
across the clip (content seconds at one tempo match the song's beats);
over a tempo change they are unrolled as before, and the note says so.

## Switched-off clips (2026-10-22, docs/dawproject-plan.md "What the format carries that Dawn lacks" 2)

A clip can be switched off: `muted?: boolean` on `StudioClip`. It stays on
the timeline, dimmed (`opacity-35 saturate-50`, `data-muted`, "· off" in its
label), and plays nothing: `#startClip`, `#queueMidi`, the offline render
and the MIDI tracks' offline render skip it, `mixClipsToChannels` and
`clipCrossfades` leave it out (so it widens no neighbor's fade), the
session bundle's clips and MIDI file leave it out, and the revision diff
says "switched off" / "switched on". **Off** in the clip bar (Shift+M; M
alone drops a marker) toggles it through `setClipMuted`. The DAWproject
writes and reads it as `enable="false"`, a Reaper project as `MUTE 1 0`
both ways, a Live set's `Disabled` clips come in off, and a Sandyne
project leaves it out (its contents have no switch). Before this, the
readers dropped such clips with a note.

## MP3 export (2026-10-20)

`src/lib/audio/encodeMp3.ts`: LAME in WASM through mediabunny's MP3
encoder extension (`@mediabunny/mp3-encoder`, loaded on first use, never
in the page's bundle), 192 kbps constant, mono or stereo. The export
panel's format choice (`ExportOptions.format`, "wav" or "mp3") makes the
mix, the per-track and the per-bus files MP3s; the DAWproject's embedded
audio stays WAV. The device menu's **Download mix (MP3)** encodes the
mix the same way. Signed in or not.

## Opening a DAWproject (2026-10-21)

docs/dawproject-plan.md, phase 1. `utils/dawprojectRead.ts` reads a
`project.xml` (and `metadata.xml`) into Dawn's shape: the transport with
its tempo and time-signature automation as `tempoChanges` and
`meterChanges`; beats converted to seconds through that tempo map
(Bitwig and Studio One write beats, we write seconds; a timeline's
`timeUnit` is inherited downward, and a clip's `contentTimeUnit` and
`fadeTimeUnit` apply to its content and fades); a regular track to a
track (`notes` content to a MIDI track with the piano as its input), a
group track or an effect track to a bus, the master's volume; each
channel's volume (linear, decibel or normalized), pan (normalized or
signed), mute, solo, destination (a bus, else the master) and sends; the
clips in seconds, an audio clip over its file with one source minted per
distinct path and its `playStart` through the warps when there are any
(a stretch the warps imply is reported and ignored, since Dawn has none),
a clip holding clips flattened one level; a notes clip's notes; the
volume and pan `Points` on a channel's own parameters as automation
lanes; the markers. What it cannot carry it names in `dropped`:
devices, other automation, nested lanes, scenes, anything over Dawn's
limits. Needs `DOMParser`; its test runs under jsdom. The page's
`importDawproject` (the file input and "Import audio, MIDI or
DAWproject…" accept `.dawproject` and `.zip`) unzips with fflate, reads,
makes a new song (an idea in the account, or the browser-kept one
started over after a confirm when it had clips), decodes each audio file
and adopts it as a source under the reader's id (`studio.adoptSource`,
then `ontake` so the queue uploads it or keeps it), replaces the
arrangement, sets the title and notes, and reports what opened and what
did not (an error-kind notification stays until read). A file missing
from the archive, over the take ceiling or undecodable loses its clips
and is reported. Browser spec `tests/e2e/studio-dawproject.spec.ts`: our
own export opened again, signed in and signed out. Real Bitwig 5.3
exports from public repositories read cleanly (docs/dawproject-plan.md,
phase 3): an empty metadata title falls back to the archive's name, the
tempo is rounded to two decimals, a send or clip switched off stays out,
and MIDI controller lanes are reported once. A `.dawproject` that is a
bare `project.xml` (some published examples are) opens too, without
audio.

## A DAWproject into a song's files (2026-10-21)

docs/dawproject-plan.md, phase 2. The Send block's **Save a DAWproject
to the song** (with FLAC, 24-bit or 16-bit WAV for the audio inside)
calls `saveDawproject` in the studio remote: the caller must have Dawn
access to the song and edit the target song's account; the Dawn song must
have clips. `createDawprojectFile` makes the attachment row under the
target song (`kind: "dawproject"`, "<title>.dawproject", status
uploading, the title "<title> (DAWproject)") with the job's parameters in
its description as `dawproject-export:<ideaId>:<audio>` until it is
rendered (no new column: the marker is replaced by a description a user
reads when the file is ready), and `scheduleDawprojectExport(fileId)`
posts the `dawproject-export` job. In the jobs function,
`src/lib/server/dawprojectExport.ts` reads the song's newest revision and
ready sources (`studioExportInput`), fetches each source a clip plays,
transcodes it with ffmpeg (FLAC at level 5 by default), writes
`project.xml` and `metadata.xml` with the same writer the browser's
export uses, zips it all with fflate (audio stored, text deflated), puts
the archive at the row's pathname in the song's store
(`accessOfPathname`), marks the row ready with its size and a
description, and notifies the user (kind `song`) with the file's
permanent link `/f/<code>`. A failure removes the row (`failFile`) and
notifies with the reason. The archive is built in memory: a long song of
many tracks is the jobs function's memory to carry (300 s budget). The
song page's Attachments panel shows a DAWproject tile with **Open in
Dawn** (`/multitrack-recorder?open=<fileId>`): the Dawn page's load
presents the file's URL for a member who edits its account
(`dawprojectFileToOpen`, `canEdit`), and the page fetches it and runs
`importDawproject` on mount, then clears the query. A `.dawproject`
uploaded by hand as an attachment is typed the same (the ready route
checks the zip signature) and opens the same way. The file counts
against the account's storage like any attachment, and the ceiling for
the kind is 1 GB.

## Sample rates (2026-10-21)

Kevin asked what happens when a project is 44.1 kHz and a stem 48, or one
stem differs from the rest. What was true: the stem player decodes every
stem into one context at 32 kHz, so mixed rates never clash there; the
renditions and mixes are ffmpeg at 48 kHz; Dawn's context runs at the
device's rate and every source is resampled to it on decode, so mixed
imports play in time. The gap was the exports: `render()` and the project
files took the live context's rate, so the same song exported on a Mac
with a 44.1 kHz interface and on a Windows laptop gave WAVs at different
rates, and nothing stored what rate an uploaded stem had.

**A song has a rate.** `arrangement.sampleRate`, optional, one of
`STUDIO_SAMPLE_RATES` (44.1, 48, 88.2, 96 kHz; `songSampleRate(a)` reads
it with `STUDIO_SAMPLE_RATE_DEFAULT`, 48 kHz, when absent), set in the
Timing menu (`setSampleRate`, undoable). `render()` builds its
`OfflineAudioContext` at the song's rate rather than the device's: the
`AudioBufferSourceNode`s resample the sources decoded at the device's rate
on the way, and the instruments build at the offline context's rate as
they always did. The project files and the bundle's clips go through
`ExportEngine.resample` (the Studio's is `audio/resampleBuffer.ts`, an
`OfflineAudioContext` at the target rate playing the buffer, the
browser's own resampler), so a DAWproject's `audio/`, a Reaper project's `media/`, a Sandyne project's
`samples/` and the bundle's `clips/` all carry one rate; an engine with no
resampler (the interop fixture in Node) keeps the sources' rates, and the
bundle's README still names them. Recording and playback stay at the
device's rate (the context cannot change it mid-session, and the latency
path is tuned to it); the Timing menu says so when the two differ.

**Imports say when they differ.** `decodeAudioData` resamples to the
context's rate and never says what the file was (FINDINGS.md), so
`utils/audioSampleRate.ts` reads the header (WAV, AIFF, FLAC, MP3, MP4,
Ogg). A file dropped on Dawn at another rate than the song's gets an
"info" notification (it plays in time; exports come out at the song's
rate); a DAWproject import lists its odd files in one; the reader sets the
song's rate to the one most of the project's `Audio` elements declare,
when it is one a song may render at, so the odd file is the exception
and not the rule. `importBuffer` and `adoptSource` record the file's own
rate on the source (the row's `sample_rate` was the context's before, a
hint), and the library shows it beside an item whose rate is not the
song's. The converter page does the same: it decodes at the project's
common rate, shows it under "Sample rate" with a select to choose another
(decoding again at the new rate), and lists the resampled files.

**Stems know theirs.** Migration 0096 adds `stem.sample_rate`; the upload
reads it from the header and `POST /api/stems/[id]/ready` takes it as an
optional `sampleRate` (8000 to 384000 Hz, else null), and the
stem-metadata job (`probeStream`, ffmpeg's "48000 Hz") fills it for a stem
that lacks it when that job runs for other reasons (an older stem that has
its peaks keeps null until it is replaced: fetching every file again for a
number was not worth a song's first view). The manifest carries it
(`StemSource.sampleRate`), the stem's menu on the song page shows it, and
`StemPlayer` marks a stem whose rate differs from the most common one
(`rateNotes`, a `note` on `StemRow` with the explanation on hover): the
player itself does not care, but a DAW session built from the downloads
would hold one file at an odd rate. `importSongStemsIntoStudio` passes the
stem's rate to the Dawn source where it is known.

## The home demo (2026-10-20)

Kevin: a section on the home page after the Idea Recorder with a demo
Dawn, the stems of Eat All the Clocks loaded by default, manageable by
admins. `StudioDemo.svelte`: the real engine (the page's `studio`
singleton) and the real `StudioTimeline` in the device chrome, with the
screen's readout, Play, Pause, To the start, Loop and zoom, and an Open
Dawn link (the recorder for a member, sign-in otherwise); it loads the
song on mount and empties the engine on leaving, and takes Space and
Home while it is the demo in view (the page's `spaceTarget`, a
`dawn` share beside the player's and the instruments'). Nothing records
and nothing is saved: the engine's dirty flag has no persistence here.
The song is the `homeStudioSongId` app setting, read by `homeStudioSong`
(the view with its sources presented, so a private store's files play
for a visitor); /admin/home has **Make it from the featured song**
(`makeHomeStudioSong`: `importSongStemsIntoStudio` of the featured song
into a Dawn song of the admin's, then the setting) and a select of the
admin's own Dawn songs (`setHomeStudioSong`; None clears). The home
page's copy doc gains the `dawn` section (the seed's words until the
in-app page merges them: `db:update-docs --merge --apply`). Without a
chosen song (Kevin: "I'm not seeing the Dawn demo", production after
v0.140.0) the demo is the featured song's stems as a Dawn song made on
the fly, `utils/studioFromStems.ts`: a track and a clip per stem, the
player manifest's rendition URLs as the sources (the engine fetches them
as it fetches any file; nothing is copied or saved), the song's tempo,
meter and key through `songChangesToStudio`. An admin's choice overrides
it. The chosen song is marked
"home demo" in Dawn's Recordings list with no Delete, and the idea
delete commands refuse it (409) until an admin chooses another, so a
clean-up in Dawn cannot blank the home page (the browser tests'
`deleteStudioSongs` skips it too).

## Clip canvases and the GPU (2026-10-20)

Kevin, after importing a song's stems: no waveforms on the tracks. The
data was sound (sources ready, peaks, lengths) and headless Chromium and
WebKit drew them; on a Retina Mac they were blank. Each clip's canvas
spans the clip, so a long one passes what the GPU composites (8,192
backing pixels on many Macs) while still drawing into memory, which is
why a probe reading the pixels back saw bars. A first fix capped the
backing store at 8,192 px, which showed the bars but blurred them on a
Retina screen (Kevin). `clipWave` now draws only the **window in view**:
the canvas sits inside the clip's box at the window's offset (the
scroller's view widened by `WINDOW_MARGIN_PX` either side, clipped to the
clip), at the screen's own resolution, and follows the scroll (a
`scroll` listener and a `ResizeObserver` on the scroller, one frame at a
time) and the zoom and trims (the attachment takes the clip's place and
width in the box and re-runs when they change). The take lanes' canvases
go the same way. Verified in Chromium and WebKit at scale factor 2,
zoomed in three steps and scrolled: every canvas the view's width plus
the margins, drawn.

## Scale and structure (2026-10-19, docs/dawn-daw-plan.md D8)

**Sources on demand.** A song's recordings no longer all live decoded
in memory. `load` decodes only what the arrangement plays
(`#referencedSourceIds`: every clip's source, a sampler's recording;
a clip's other takes count only when chosen) and marks the rest
`cold`, a fourth `StudioSource.status` beside decoding, ready and
failed, with the file's URL kept (`#urls`). `ensureSource(id)` fetches
and decodes a cold one (one fetch at a time per source, `#loading`),
`ensureReferenced()` every played one, and `play`, `record` and
`render` wait for it, so a song opens fast and sounds complete.
Cycling to a cold take, comping from one, dropping one from the
library and choosing one for the sampler fetch it and restart the
pass once it is in; the library's play fetches it first (`previewSource`
is async). `releaseUnused()` drops the buffers nothing plays (cold
again, listed still; a recording still uploading is kept), and
`#recount` calls it on its own once memory passes
`STUDIO_MEMORY_WARNING_BYTES`; the song menu's "Unload recordings
nothing plays" does it by hand. The timeline draws a cold clip from the
saved peaks, as it already drew a decoding one. A streaming playback
worklet over OPFS, the plan's further step, stays open: on-demand
decoding and release already keep a long session's memory to what it
plays.

**Freeze.** `freezeTrack(trackId)` renders the track through its
inserts (`render({ track, freeze: true })`: fader 1, pan 0, only the
inserts' lanes scheduled; the fader, pan and their lanes stay live),
makes the rendering a recording of the song (`#sourceFromChannels`,
uploaded like an import), and puts the clips and the inserts away on
the track (`frozen: { clips, inserts?, fx? }`, `StudioFrozenSchema`)
with one clip of the rendering in their place; the strip's inserts are
emptied. `unfreezeTrack` restores the clips (fetching cold ones) and
the inserts and drops the rendering's clip (the recording stays for a
clean-up). The track menu has both; the header shows a snowflake and
the inserts button is disabled while frozen. A MIDI track freezes the
same way, through its instrument.

**The engine in modules.** `src/lib/audio/studioGraph.ts` is the live
signal graph: the master, a strip per bus and per track, kept in step
with the arrangement (`ensureAll`, `ensureBus`, `ensureTrack`,
`dropBus`, `dropTrack`, `routeAll`, `stripOf`), with the engine's
effective gains and automation settle handed in as hooks; the engine
keeps private getters over it (`#masterStrip`, `#buses`, `#tracks`) so
the rest reads as before. `src/lib/audio/studioPersistence.svelte.ts`
is the page's autosave, out of the page: the debounce, the serialized
saves, the base revision and the conflict hand-off (D7), the re-save
after an edit during a save, `markSaved` after a named revision, a
restore or a reload, and `open` on a song change; the page hands in the
engine's flag and snapshot, `ensureSong`, the remote call and
`onConflict`, and reads `saving` and `baseNumber`. Tested with fakes
and timers. The bounce orchestration moved out in D3
(`studioExport.ts`); the instruments in D6 (`instruments.ts`); the
inserts, strips and offline render in D2 and D3.

Left for later, named in the plan: the streaming worklet over OPFS and
Blob, FLAC renditions of sources in the jobs function (the browser
keeps 24-bit WAV; a FLAC rendition halves the storage), windowed
scheduling of very long clips, and operation-based undo (the history
stays whole-document snapshots at depth 100, which the mix gestures
and every D1–D7 edit already fold into one step each).

Browser spec `tests/e2e/studio-scale.spec.ts`; unit tests on the graph
over stand-in strips and on the persistence with fake timers; a schema
test on the frozen track.
