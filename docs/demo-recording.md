# Recording demos in the app

Status: **Phase 1 built** (2026-09-18); the rest of this page is the plan
it came from, with what shipped marked. Kevin's use case: someone sits down
with a guitar and a phone and records a demo with start, stop, pause, undo
(retake), save and delete.

## Ideas and takes (2026-09-18)

The model settled on after a day of use: an **idea** is a title, one
markdown note board and one or more **takes** (audio recordings, numbered
within the idea, each with an optional name). Ideas are the user's own
within the account; other members do not see them until a take is added to
a song (a share feature may come later). On `/ideas/recorder` (the user's own page since 2026-10-01; it was `/[account]/ideas/recorder`, which redirects):

- **Record → Stop** completes a take and hands it to a background upload
  queue (`src/lib/audio/takeQueue.svelte.ts`): Record is available again
  at once, the take stays loaded for playback (Play, a volume slider, the
  ⋯ menu with Download and Delete take) and gets its number when the
  upload lands. Uploads run one at a time in recording order, so the
  server's numbers follow the order the takes were made; an Uploads strip
  under the recorder shows progress with Retry and Discard on failure.
  Every pending take is written to IndexedDB (`stem-shovel` /
  `pendingTakes`) before upload and removed after, so a refresh, a crash
  or a phone switching apps resumes it on the next visit (an idea that was
  never created gets one with the title it had). Measured in Chromium:
  Stop to Record enabled in about 70–105 ms. No pause, no review step.
- **New idea** (the header button or the recorder's ⋯ menu) starts a fresh
  one ("Untitled Idea N", editable at the top of the recorder) with an
  empty note board; the idea row is created on first use (a take or
  notes; a title alone never saves one) and **removed again when nothing
  is left in it** (`deleteIdeaIfEmpty` after the last take, after the
  notes are cleared, after a discarded upload; `deleteEmptyIdeas` sweeps
  hour-old empties when the page loads). The note board is the song
  documents' embedded markdown editor, always in edit mode with autosave,
  Escape or ⌘S saving at once, and a trash button to clear it
  (`IdeaNotesPanel.svelte`, `saveIdeaNotes`).
- **Take names** go in the field beside the "Take N" label before, during
  or after recording: with no take loaded the field names the next take,
  and a name typed mid-take goes out with it. Starting a take from a
  loaded one clears the field.
- **The list** under the recorder shows the user's ideas newest first as a
  plain accordion (a click on the name only folds or unfolds; the open set
  is page state and the native toggle is cancelled, because a toggle event
  landing after an autosave re-render fought it); clicking a take loads it
  and its idea's title and notes come with it; each take has a menu (Add
  as demo…, Create new song…, Delete take) and each idea one (Delete idea;
  deleting an idea other than the loaded one leaves the player alone). An
  idea unfolds when its take lands or when it is picked from Search or the
  phone picker. **Search** is a sheet (full screen below `sm`) listing
  every idea as an accordion, filtered as you type by title, notes, take
  label or number (`filtered` in the page); ideas whose takes matched open
  on them. With more than one take in the idea, the loaded
  take's "Take N" label is a dropdown listing every take (number, name,
  length) for a quick jump. On a phone the notes come right after the
  recorder so both are in view and the list gives way to a `ComboBox` of
  the ideas above the recorder.
- **Fidelity** (2026-09-19). The codec ladder in `recordingMimeType.ts`:
  lossless where the browser can (ALAC in MP4 on Safari 18.4+, raw PCM in
  WebM on Chrome and Edge 135+), else Opus or AAC at 256 kbit/s; a Quality
  setting drops to compressed for a metered connection. Capture asks for
  48 kHz and one channel (two with the Stereo setting) and a chosen
  microphone (`deviceId`; the settings list inputs after one permission
  grant), and the line under the meter reports what the track and the
  recorder really gave ("ALAC lossless · 48 kHz · mono"), since Safari is
  known to ignore some requests. Chrome's raw PCM is turned into FLAC by
  the jobs function before the MP3 rendition is made (`isRawPcm` +
  `replaceRecordingSource` in transcode.ts; the row's url, pathname,
  filename, content type and size follow, the WebM is deleted; on the VM's
  dev server the jobs self-call goes to localhost, since the proxy origin
  cannot be called back); Download Source of a take still in raw PCM (just
  recorded, or saved and not yet converted) decodes it in the browser and
  hands over a 16-bit WAV (`utils/encodeWav.ts`), a file any player or DAW
  opens; ALAC stays
  as recorded. **Playback prefers the original**: the take's codec is
  stored at reservation (`recording.codec`, migration 0042) and the
  recorder asks `canPlayType` (`playbackMime.ts`) before choosing the
  original over the MP3 rendition, so the device that recorded a take
  hears it lossless, a Mac plays an iPhone's ALAC, everything plays FLAC,
  and Chrome facing ALAC gets the MP3; a media error on the original
  falls back to the rendition. A take just made plays the browser's own
  blob until the page sees its rendition (`followRendition` polls for a
  minute, `refreshUrl`). Downloads always hand over the original.
  Preferences live in `recorderPreferences.ts` (localStorage). The byte
  cap is 120 MB (`MAX_TAKE_BYTES`).
- **Ceilings** (`src/lib/constants/takeLimits.ts`, `takeStopReason`): the
  recorder's 100 ms watch stops a take at `MAX_TAKE_SECONDS` (15 min; a
  notice at 10) and after `SILENCE_STOP_SECONDS` (2 min) of input under
  `SILENCE_LEVEL` (meter level 0.01, about -50 dBFS), saving it when it ever
  had sound and discarding it when it never did; the level is sampled in
  the watch timer as well as the meter's animation frame, since a
  background tab throttles frames but keeps timers. The reservation
  (`POST /api/recordings`) and the upload token refuse more than
  `MAX_TAKE_BYTES` (120 MB since lossless takes; a compressed take never
  comes near it). Phones stop the microphone themselves when the app
  leaves the front.
- **Recorder settings** (the gear in the header, a popover): "Discard takes
  shorter than 3 seconds automatically", off by default (it throws a take
  away), per browser
  (`src/lib/utils/discardShortTakes.ts`; the recorder's `minTakeSeconds`);
  "Trim silence at the start and end", off by default
  (`recorderPreferences.trimSilence`). The flag travels with the take's
  reservation (`recording.trim_silence`, migration 0046) and the jobs
  function honours it when it renders the MP3: a `silencedetect` pass
  (−40 dB, gaps of 0.3 s or more; `src/lib/utils/silenceBounds.ts` reads
  the log) finds the first and last sound, the source is cut to 0.3 s
  before the first and 0.5 s after the last (re-encoded to the sample for
  ALAC, FLAC and raw PCM, stream-copied at the packet for Opus and AAC) and
  stored under a new pathname, the MP3 is made from the cut source so both
  have the same length, `duration_seconds` is set from the cut and the
  flag cleared so a retry cuts nothing twice. Less than 0.1 s to gain, or
  a take that is silent throughout, is left as recorded
  (`src/lib/constants/trimSilence.ts`).
- **Tuner** (`Tuner.svelte`, a popover from the header and the public
  `/tuner` page): `src/lib/audio/pitch.ts` reads the pitch of a 4096-sample
  window twenty times a second with McLeod's normalised square difference
  (tested on synthesized strings within a cent), `constants/tunings.ts`
  lists the tunings, `utils/tunerPreferences.ts` remembers the tuning and
  A4. It opens the microphone with the recorder's constraints and audio
  session; a take starting hides the popover, which stops it.
- **Metronome** (`Metronome.svelte`, `utils/tapTempo.ts` with tests,
  `utils/metronomePreferences.ts`): clicks scheduled a tenth of a second
  ahead on the Web Audio clock (the "tale of two clocks" pattern, so a busy
  page never makes it stumble), a higher first beat, 30–300 bpm, two to six
  beats to the bar, tap tempo; the engine is one per page
  (`src/lib/audio/metronome.svelte.ts`) and every `Metronome` component a
  view of it; compact in the recorder's toolbar (a toggle and the tempo;
  on a phone inside a wrench tools menu with the tuner, and while it runs
  its stop button stands in the menu's place so one tap stops it), full on
  `/metronome` (public, indexable). It keeps running
  through a take on purpose: a click track for headphones.
- **Reusable bits** that came out of this page: `ComboBox.svelte` (a
  trigger with `popovertarget` opening a listbox that is a native popover,
  placed under the trigger by CSS anchor positioning through the invoker's
  implicit anchor, `position-area`; keyboard complete with
  `aria-activedescendant`; `bind:openState` lets a parent open or close
  it), `ContextMenu.svelte` (a ⋯ button opening a popover menu of actions,
  links or snippets the same way, `position` picks the corner) and
  `InfoTip.svelte` (an info button opening a native popover placed under
  it; tap or click, not hover, so it works on a phone). Browsers without
  anchor positioning get `utils/anchorFallback.ts`: `placePopover` sets
  fixed coordinates through element styles, which a strict CSP allows and follows scroll and
  resize until the popover closes. Their component tests give jsdom a small
  popover stand-in (`ComboBox.svelte.test.ts`).
- **Into a song**: "Add as demo…" and "Create new song…" in the recorder's
  ⋯ menu and in each take's menu open one popover (`RecordingActions.svelte`
  in add or new mode); "Merge the idea's notes into the song's notes"
  (default on) appends them as a new version of the song's notes document
  under a heading naming the idea and take (`mergeIdeaNotesIntoSong`).
- Takes are `recording` rows (`idea_id`, `take_number`, `title` = take
  name); migration 0041 made one idea per earlier recording. Remote
  functions: `ideas.remote.ts` (create, rename, notes, delete, render) and
  `recordings.remote.ts` (take name, delete, add to a song, new song).

## Ownership: the user's own (2026-10-01)

Ideas are the user's, not the account's: the page is `/ideas/recorder`
(the old `/[account]/ideas/recorder` and `/[account]/ideas` redirect, with
`?song=`), it lists every idea the user recorded whichever account it was
recorded in, and the ownership checks everywhere (`ownIdea` and `ownTake`
in the remote modules, the take reservation, the ready route and the upload
token) go by `idea.created_by`, not membership, so a user who leaves an
account keeps their ideas. The rows keep `account_id`: a new idea is filed
under the **current account** (the one neutral pages treat as the user's,
`src/lib/server/currentAccount.ts`; a user who edits no account is sent to
`/accounts`), and that is the account whose storage the takes count
against and whose Blob store holds them (`accounts/<id>/recordings/…`, the
pathnames unchanged). A take can go to a song in any account the user
edits: `addRecordingToSong` and `newSongFromRecording` check editorship of
the song's or project's account, `copyRecordingToSong` files the demo under
the song's account (the file copied from the take's store to the song's),
and the page's song picker spans the user's accounts, labelling projects
with the account's name when there is more than one. The drum machine's
saved beats and the piano's presets in the panels are the current
account's. Kevin's ask: "move the route for the idea recorder out of the
project and change the ownership model so users own ideas and they are
independent of projects"; the account stays only as the billing home of
the files, which kept the data model and the stores as they were.

## What shipped (Phase 1)

- **Scratch recordings, not demos.** A take goes into the account's library
  (`recording` table, `accounts/<id>/recordings/<id>.<ext>` in the private
  store when one is configured, else the public one) as a riff, a lick, a
  melody idea or a whole take. It becomes a demo only when a member adds it
  to a song: the file and its MP3 are **copied** under the song
  (`copyRecordingToSong`), so the recording stays in the library and the
  demo lives and dies with the song. "New song from it" creates the song in
  a project and adds the recording as its first demo.
- **Pages** (as of Phase 1; the library page is gone since "Ideas and takes" above). `/ideas/recorder` (was `/[account]/ideas/recorder`) is the idea recorder ("Idea Recorder" in the app) (members only;
  `?song=<id>` remembers the song it was opened from and offers "Add to
  that song" first); `/[account]/ideas/recordings` is the library (play, rename,
  download, add to a song, delete). Both are in the account menu; the song
  page's Uploads menu and empty player box link to the recorder.
- **The recorder** (`DemoRecorder.svelte`): one take with Record, Pause /
  Resume (`MediaRecorder.pause()`), Stop, Undo (retake) and Save; a clock,
  an input level meter with peak hold (an `AnalyserNode`, not connected to
  the output), the input's name, a screen wake lock while recording, and
  the voice processors (echo cancellation, noise suppression, auto gain)
  off. A track that ends mid-take (a call) keeps what was recorded. Saving
  reuses the demo upload path: `POST /api/recordings` reserves,
  `/api/upload` issues the token (recording pathnames are routed to the
  recording store), `/api/recordings/[id]/ready` reports the URL and the
  timed length, and the same ffmpeg step as demos makes the MP3
  (`scheduleRecordingPlayback`).
- **Notes** (2026-09-18): a markdown notes field per recording, edited in
  the song documents' embedded editor. On the recorder page the panel is
  open before any take (two columns like the song page: recorder left,
  notes right); the draft travels with the reservation (`POST
/api/recordings` takes `notes`) and autosaves to the server once the
  recording exists (`RecordingNotes.svelte`, `saveRecordingNotes`). Each
  library row has the same editor in a collapsible section.
- **Headers.** Permissions-Policy allows `microphone=(self)` and
  `screen-wake-lock=(self)`.
- Verified end to end in Chromium with a fake microphone fed by the test
  WAV (record, pause, resume, stop, save, new song with the demo, library).
  Not yet tried on an iPhone.

Not built yet (Phase 2): segments with undo of the last one, crash
recovery from IndexedDB, the server-side join, count-in, play-along, trim.

## What already exists

- A demo is any audio file per song (`demo` table, up to 12 per song,
  `MAX_DEMOS_PER_SONG`); the browser reserves it (`POST /api/demos`), sends
  the bytes straight to Vercel Blob (`uploadDemoFile` in `src/lib/upload.ts`)
  and reports the URL (`/api/demos/[id]/ready`). The server then transcodes
  every demo to MP3 for playback (`scheduleDemoPlayback` in
  `src/lib/server/transcode.ts`). Delete is the `deleteDemo` form.
- The accepted formats (`src/lib/constants/demoFormats.ts`) already include
  what browsers record: `audio/webm` (Chrome, Firefox: Opus) and `audio/mp4`
  (Safari: AAC). **A recording is just one more demo file; the storage and
  playback path needs no change.**
- The CSP already allows `blob:` in `media-src` and `worker-src`, which a
  recorder needs for local playback of a take and for audio worklets.

The one blocker: the Permissions-Policy header
(`src/lib/constants/securityHeaders.ts`) sends `microphone=()`, which turns
`getUserMedia` off for the whole site. It has to become `microphone=(self)`
(and `screen-wake-lock=(self)` for the wake lock below).

## The recorder

One component, `DemoRecorder.svelte`, opened from the Demos panel of song
settings and from the Uploads menu ("Record demo"); on a song without stems,
the empty player box also offers it. On a phone it is a full-screen popover
like song settings, with big controls; on a desktop, a card.

State machine: `idle → recording ⇄ paused → reviewing → saving → done`.

| Control        | Does                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start          | Asks for the microphone (first time), starts a take. A 3-2-1 count-in is optional (below).                                                                          |
| Pause / Resume | Ends the current segment; Resume starts the next. Segments are joined on save.                                                                                      |
| Stop           | Ends the take and shows it for review: play it back, see its length.                                                                                                |
| Undo (retake)  | Drops the last segment (while recording or paused) or the whole take (while reviewing) and goes back to recording or idle. Asks when it is more than a few seconds. |
| Save           | Names it ("Recording 17 Sep 21:15", editable), uploads it as a demo through the existing path, closes.                                                              |
| Delete         | The existing Remove on the demo list; a saved recording is an ordinary demo.                                                                                        |

While recording: elapsed time, a level meter (an `AnalyserNode` on the
stream; peaks in red), and a "keep the screen on" wake lock so the phone
does not sleep mid-take. No monitoring through the speaker (feedback).

### Capture

`navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false,
noiseSuppression: false, autoGainControl: false, channelCount: 1 } })`. The
three "voice" processors are on by default and ruin a guitar (pumping,
gated sustain); browsers honour the request on desktop and, from iOS 15,
on the phone, though Safari still applies some processing of its own.

`MediaRecorder` on that stream, one recorder per segment
(`start()` … `stop()`), with a 1 s `timeslice` so chunks arrive as it goes.
Chrome and Firefox produce Opus in WebM; Safari produces AAC in MP4. Both
are demo formats today. `MediaRecorder.pause()` exists, but segment-per-
recorder is used for Pause anyway because it is what Undo needs and it
side-steps the browsers' uneven pause support.

Segments are kept in IndexedDB as they arrive (song id, segment index,
blob). A refresh, a crash or a phone call (which stops the microphone on
iOS) leaves the take recoverable: on reopening the recorder it offers
"Continue the take from 21:15 (2:34)" or discards it.

An instrument can play into the take (2026-09-30): the recorder page's
piano hands `DemoRecorder` a MediaStream (`instrument`), and `startMeter`
mixes it with the microphone in the metering context into a
MediaStreamDestination whose stream the MediaRecorder records; `micInMix`
false leaves the microphone out. The drums and the click are not routed
this way: they reach a take only through the room. See docs/piano.md.

### Save

Several segments become one file. Two options:

1. **Server-side join** (recommended): upload the segments as they are,
   under one reservation (`POST /api/demos` gains `segments: n`, the
   pathnames get `-1`, `-2` …), and the transcode step joins them with
   ffmpeg's concat demuxer before making the MP3 (same codec, no re-encode
   of the join). The _source_ demo stays a set of segment files (download
   gives the MP3). About 60 lines in `transcode.ts` and the reservation.
2. Client-side join: decode every segment with Web Audio, concatenate the
   samples and encode a WAV. Lossless and simple, but a 5-minute mono take
   is 25 MB of WAV over a phone connection, and decoding is slow on old
   phones. Fine as a fallback for a single segment (no join needed: upload
   the blob directly, which is also the v1).

**v1 is one segment**: Start, Pause/Resume via `MediaRecorder.pause()`,
Stop, Retake (discard all), Save, Delete. That is a day's work including
the header change, the wake lock and the level meter. Segments with Undo
of the last one, crash recovery and the server-side join are the second
day. The count-in and play-along are later.

### Quality

A demo recorded on a phone is AAC or Opus at the browser's default rate
(Safari about 64 kbit/s AAC, Chrome 128 kbit/s Opus), transcoded to MP3
for playback: lossy to lossy, audibly fine for a memo, not for a stem. A
lossless option (capture PCM in an `AudioWorklet`, encode FLAC client-side)
is possible later if recordings should become stems; it costs a worklet,
an encoder and the WAV-sized uploads above.

## Waveform (built 2026-10-01)

Kevin's ask, the first of a queue: `RecorderWave.svelte` on the screen
under the clock. While recording, a strip that scrolls as the take grows,
one bar per animation frame of the input's sample peak (the meter loop
already reads it; `waveHistory`, the last 1200 frames kept, two pixels a
frame so the strip shows the last twenty seconds or so), newest at the
right, drawn in red. With a take loaded, the whole take's peaks with a
playhead: an `$effect` on `takeUrl` decodes the take once (the browser's
own blob for a take just made, else a fetch of the file; the MP3
rendition where there is one, which every browser decodes) through an
`OfflineAudioContext` and `computePeaks` at 2048 bins, and the canvas
draws one bar per pixel; the playhead is a separate element at
`playhead / takeLength`. Click or drag seeks (pointer capture), arrow
keys nudge. A file the browser cannot decode or fetch leaves the centre
line and the slider below still seeks. Drawn in the canvas's own `color`
as `Waveform.svelte` does, so the palette stays in uno.config.ts. Both
views are normalised as a phone's voice memos are (Kevin: a quiet take
should still look like it captured something): bars scale to the loudest
in view, a floor of 0.02 keeps silence flat, and a square-root curve
lifts the quiet parts.

## The drum machine panel (built 2026-10-01)

Kevin's ask: on a desktop, the full drum machine in a floating panel
over the recorder page, dragged by its header, resized by the browser's
corner handle, its place and size remembered per browser
(`FloatingPanel.svelte`, `stemshovel.recorder.drum-panel`). From lg the
toolbar's drum button opens and closes it (lit while the beat plays with
the panel closed); below lg the compact control (play, stop, tempo)
stays as on a phone (Kevin: one button on a desktop, the old experience
on phones and at sm and md).

**The piano** has the same panel from lg (Kevin), its "Piano in the take"
switch in the header (as the drums', remembered under
`stemshovel.recorder.piano-in-take`); the microphone's own switch is a
mute button beside its meter on the recorder's screen (its tracks
disabled, so a take records the instruments alone; on by default and
back on with every page, so no one records silence by accident), which
replaced the piano's "Microphone in the take"; below lg the same `FloatingPanel` docks in
the page's flow under the recorder, full width with its header, so one
piano instance serves both (the panel's place, size, drag and `fixed`
come through `lg-` variants and CSS variables, nothing in JavaScript
asks the window's width).

**The metronome** gets the drums' treatment (Kevin: every tool and
instrument launches the same way): from lg the toolbar's metronome
button opens the full metronome in a panel (the icon swells on the
downbeat and the button is lit while it runs), below lg the compact
control stays; the engine is one, so the panel and the toolbar agree.

**The tuner** moved from a native popover into the same panel (Kevin),
opened by the toolbar's tuner button (and the phone tools menu), the
microphone opening as the panel mounts (`tick()` first) and closing with
it or as a take starts. `Tuner.svelte` had no viewport breakpoints to
migrate; its layout was already its own width.

**The notes** stay in their column, inside a docked, non-closable panel
whose header carries the clear button and, from lg, a pop-out button:
popped out, the panel floats like the others (dragged, resized,
remembered) and the button docks it back; `floating` on
`FloatingPanel` is what the pop-out flips, remembered per browser under
`stemshovel.recorder.notes-floating`. One editor instance either way,
so nothing is remounted and no draft is lost.

**The recorder itself** sits in the same docked, non-closable panel at
the top of its column, with a pop-out button from lg (Kevin: rearrange
the screen however you want); popped out it floats like the rest, and
the button docks it back; `stemshovel.recorder.recorder-floating`. One
instance either way, so a take in progress is untouched by the move.

**The recordings list** gets the same docked panel with a pop-out, the
last widget on the page (Kevin: the screen fully malleable);
`stemshovel.recorder.recordings-floating`.

**The instruments travel with the idea, through its takes**: when a take
is recorded, the drum machine's whole project and the piano's sound and
effects (its preset shape, `PianoPresetData`) go with it (`instrumentsForTake`
on the queued take, kept in IndexedDB with it), each unless its
**Settings with the idea** switch is off (beside "in the take" in the
panel headers; `stemshovel.recorder.drums-settings` / `piano-settings`,
on by default), and are saved on the idea once the take lands
(`onsaved` carries the idea the take went to, so a switch during the
upload cannot misfile them), in the `idea.instruments` column as JSON
(`IdeaInstrumentsDataSchema`, migration 0063) through
`saveIdeaInstruments`; the server merges an instrument at a time, a null
leaving what the idea had for that one. Showing an idea (a take from the
list) puts them back with `drumMachine.loadProject` and
`piano.applyPreset`; an idea without any (older than the feature, or
recorded with the switches off) leaves the instruments as they are, so it
inherits the current settings until a take is recorded there (Kevin's
model: a take fixes the settings, an idea without takes of its own
inherits). The page keeps what it saved this visit in a map so switching
back to an idea loads the latest rather than the page's data from load
time. The first version saved on every change and stamped an idea with
the current settings as soon as it was shown, which made switching among
older ideas look like nothing changed (each inherited the last tweak the
moment it was opened). Not saved: the drum volume and the piano's octave,
volume and key helper (listening and playing choices, per browser).

**Every wanted instrument joins the take**: `instruments()` returns the
piano and the drums whenever their "in the take" switch is on, their panels
open or not, so an instrument started after Record still lands (the first
version asked for an open panel or a running beat, which left a drum
machine opened mid-take out of it). An instrument that is not playing
contributes digital silence through its capture stream, at no cost to the
recording; what it costs is its idle audio graph (an AudioContext and the
effect chain each, opened by `captureStream()` from the Record gesture).
The piano's panel is given the site's and the account's presets as the
piano page is (`sitePresets`, `presets`, `presetAdmin` from the page
load), so the preset buttons show there too.

**Docking restores the size**: the browser's `resize` handle writes the
size into the element's inline style, which would hold once the panel was
docked back into its column (Kevin: it should go back to its original
size), so an attachment clears the inline width and height whenever
`floating` is off; the remembered size still applies on the next pop-out
through the CSS variables. The drag grip shows only when the panel is
floating at lg (docked, it misled).

**Stacking**: the panels share a counter in `FloatingPanel`'s module
script; opening a panel, a pointer down anywhere in it or focus moving
into it raises it above the others (Kevin), through a CSS variable the
`lg-z-` class reads. The instruments' own menus are popovers in the top
layer, above every panel regardless.

**The recorder device on container queries** (Kevin): `DemoRecorder`'s
breakpoint classes are `@xl-`, `@2xl-`, `@4xl-` with the device root the
`@container`, so the device lays itself out by its panel or column, not
the window, as the piano and drum machine do.

**The space bar**: it is wanted by the drums (play / stop), the piano
(the sustain pedal) and any focused button (activation). The page keeps
a `spaceOwner`, the instrument touched last: the drum panel takes it as
it opens or on a click inside, the piano as it opens or on a click on
it, and each instrument's `keyboard` prop is on only while it owns the
key; the toolbar buttons blur themselves after a click, so a focused
one never swallows the key (the first symptom: space closed the panel
because its toggle still had focus). Text fields keep the key, as the
instruments' own handlers already check.

**The instruments' meters**: while instruments play into the take, each
gets its own meter above the microphone's (an AnalyserNode on that
source alone; `instruments()` returns `{ label, icon, stream }` per
instrument, the piano-keys icon or the drum kit icon beside its bar), so
a quiet piano and a loud beat each show beside the voice, and the
microphone's row then reads the microphone alone (the main analyser still
reads the mix for the peak and the waveform strip). The first
version was one combined meter under a piano icon, which Kevin read as
the piano's alone ("I don't see an input level indicator for the drums"). The panel's body is a
`@container`, so the machine lays itself out by the panel's width (the
piano's and drum machine's container-query work was for this). The
panel's drum machine has the account's saved beats and Text-to-Beat.

**The drums in the take**: `drumMachine.captureStream()` (a
MediaStreamAudioDestinationNode on the bus's master, as the piano's)
joins the recorder's mix. `DemoRecorder`'s `instrument` prop became
`instruments`, a function the recorder calls as a take starts (a
gesture), so the piano's stream goes in when the piano is out and the
drums' when they are in play or their panel is open, and a beat started
after Record still lands in the take because the capture node is on the
bus. "Drums in the take" (the panel's header, and a line under the
recorder while the drums play or the panel is open; remembered per
browser under `stemshovel.recorder.drums-in-take`) switches them out,
so a beat can be a click track that stays out of the recording.

## Multitrack takes (built 2026-10-01)

Kevin: "a toggle … for stereo recording vs multitrack in the idea recorder.
It only becomes available if an instrument is enabled and by default it
is set to stereo. Then a finished idea take would have the option to add
stems to existing song vs. add as demo."

**Recording.** `DemoRecorder` takes `multitrack` (bindable) and
`multitrackAvailable` (the page passes `drumsInTake || pianoInTake`); a
Stereo/Multitrack pair of buttons at the top of the meter column shows
only when available, locked while recording, and the page keeps
`multitrack` as plain state, so every visit starts in stereo. As the meter
starts, `startMeter` records the sources: the microphone's own
`getUserMedia` stream (mono or stereo as the preference says, muted tracks
and all) and each instrument's capture stream (stereo, from the engines'
MediaStreamDestinations), labelled "Microphone", "Piano", "Drums". Each
source gets a `MediaRecorder` of its own in the mix's format (lossless
where the browser can), started in the same JavaScript tick as the mix's,
so the files line up within a few milliseconds; `stop()` stops them all,
and `finishTake` awaits their stop events before closing the streams, then
hands `onqueued` the take with `stems` (a blob per source, in order). A
discarded take (silent, short) drops them with it.

**Upload.** The queue item carries `stems` (persisted in IndexedDB with the
take, so a refresh keeps them), and the loop uploads the mix first, then
each source through `uploadRecordingStemFile`: `POST
/api/recordings/[id]/stems` reserves a `recording_stem` row under the take
(label, sort order, codec; the account's storage room checked as for a
take), the bytes go to the take's store under
`accounts/<id>/recordings/<recordingId>/<stemId>.<ext>` (a recording
pathname to the upload handler, which finds the reservation in either
table and checks ownership through the take), and `POST
/api/recording-stems/[id]/ready` marks it ready with the timed length. The
item remembers `savedId` and `stemsDone`, so a retry after a failed source
does not save the take twice; progress spans all the files. The sources get
no playback rendition of their own (the stems made from them do) and the
silence trim applies to the mix only, so a trimmed take's mix starts
earlier than its sources; they are used as a set, without the mix.

**Into a song.** The page data lists each take's ready sources (`stems`,
id and label); a take with any shows "· N stems" in the list and **Add N
stems to song…** in its menu (the recorder's ⋯ menu has **Add Stems to
Song** for the loaded take). `RecordingActions` in mode "stems" reuses the
add-as-demo form (no notes merge) and calls `addRecordingStemsToSong`,
which checks editorship of the song's account and runs
`copyRecordingStemsToSong`: a `stem` row per source with the source's
label, duration and size, the file copied into the song's store, ready at
once (the player computes the peaks it lacks on decode), then
`stemsChanged` and `schedulePlayback` for the AAC renditions. "full" when
the song cannot take them all (MAX_STEMS_PER_SONG), "none" for a stereo
take. The stem formats list (wav, flac, mp3, m4a, aac) governs uploads
only; a source in WebM (Chrome's PCM or Opus) becomes a stem whose
rendition the jobs function makes with ffmpeg as for any stem.

**Housekeeping.** Sources count against the account's storage
(`accountStorageBytes` and the usage report), are removed with their take
(`deleteRecording`, `deleteIdea`, the cascades for ideas and accounts) and
their blobs with them, and `recordRecordingUrl` (Vercel's completion
webhook) marks either table. Verified on dev with Chromium's fake
microphone: a take with the beat running and the piano open uploads three
sources (Microphone, Piano, Drums; PCM WebM, 2.5 s each), the list and
menu show them, and adding them to a song shows the three stems with
waveforms (the microphone's test tone, the silent piano, the beat); the
rows go with the idea.

## Input sources (built 2026-10-02)

The recorder caught up with the looper's inputs. The microphone, a line in
and the computer's audio come from the shared `src/lib/audio/inputs.svelte.ts`
(one module for both pages: device and channel choice, a gain stage, meters,
monitor and normalize switches, settings remembered per browser under
`stemshovel.inputs.*`; the streams outlive a page, the nodes belong to
whichever page's AudioContext is attached). On the device an **Input Source**
row under the screen holds five `SourceButton`s (shared with the looper):
Microphone, Line in, Computer, Piano, Drums, each a toggle into the take with
its meter in the button, a settings menu joined to its right
(`InputSourceSettings.svelte`; the drums have none) and, under it, the gain
slider (−12 to +24 dB) or the instrument's own master volume, the same state
the panel's slider moves. The page keeps `sourcesOn` (remembered as
`stemshovel.recorder.sources`; the microphone in by default, the instruments
only while their panel is open), the panels' "In the take" switches move the
same state, and switching an instrument in opens its panel.

The recorder keeps one AudioContext for the page (made on the first gesture
and attached to the inputs module) instead of one per take, so meters run
before Record: the inputs' in the module, the instruments' on an analyser
over their capture stream. A pointer-down on the device opens an input that
is switched in but not yet open (the microphone on a fresh visit), the way
the looper opens on its page; the computer waits for its own button and
the share picker. A take mixes every source that is in into one
`MediaStreamDestination` for the recorder; a multitrack take, offered and on
by default whenever two or more sources are in (Stereo stays chosen until the
count crosses two again), also records each outside source through a
destination of its own after its gain, and each instrument's capture stream.
The microphone is no longer required: a take can be the piano alone, the
computer alone, or any mix, and Record is disabled with nothing in.

Normalize, when on, scales a file from the outside sources so its peak sits
at −1 dBFS and writes it as 24-bit WAV (the scaling needs the samples); the
mix is normalized only when nothing but outside sources is in it. The plain
recorder on the home page (`sourcesOn` null) keeps the old microphone-only
path, one context per take.

**Latency trim (built 2026-10-02).** The input latency (the microphone's
or line in's round trip, measured by the looper's Calibrate or the
browser's own figure until then) lives in the inputs module now, with a
slider in each input's menu on both pages. A multitrack take trims it off
the front of each microphone and line-in stem, and the computer's capture
latency off the computer's, so the stems line up with the instruments'
(which the recorder captures with no path to speak of); the mix is left as
heard. Trim and normalize share one decode (`processed()` in
DemoRecorder.svelte) and write 24-bit WAV; a stem that needs neither goes
as recorded.

**Tracks panel (built 2026-10-02).** A take with stems in the recorder's
player gets a **Tracks** panel under the device: the song player
(`StemPlayer.svelte`, `StemEngine`) over the stems, each with its waveform,
mute, solo and fader, its own transport and master. The stems' URLs come
from the `loopSources` query (a presented URL per stem, the same one the
looper's Load menu uses), fetched when the loaded take changes; the
recorder's own Play still plays the mix. The panel pops out like the notes
(`stemshovel.recorder.tracks-floating`) and is not closable: it exists only
while such a take is loaded.

## Later, if wanted

- **Count-in and click** from the song's tempo and meter (Web Audio
  oscillator ticks). Through the speaker they bleed into the take, so the
  click is offered only with headphones detected (`enumerateDevices` shows
  no way to know; ask instead).
- **Play along**: the song's stems or an existing demo in the headphones
  while recording, the new take aligned to the song's start. The stem
  engine can play; the alignment is the recorder start latency (~100 ms on
  a phone), which can be measured once with a loopback and stored.
- **Input choice**: an external interface over USB-C (`enumerateDevices`,
  `deviceId` in the constraints), and stereo when it offers it.
- **Trim** the head and tail before saving (silence while reaching for the
  phone): a two-handle range on a waveform of the take, applied server-side
  with ffmpeg `-ss`/`-to` so the join and the trim happen in one pass.

## Phone realities to design around

- iOS records only while Safari is in front and the screen is on: the wake
  lock (Safari 16.4+) keeps the screen on; leaving the tab stops the take,
  which is why segments are persisted as they arrive and the take is
  recoverable.
- An incoming call takes the microphone; the recorder must survive an
  `ended` track (finish the segment, tell the user, offer Resume with a
  fresh stream).
- Safari's default input processing cannot be fully switched off; a
  guitar still sounds like a guitar, a loud strum may be tamed.
- The first `getUserMedia` prompt appears once per site; a denial is
  permanent until the user changes it in Settings, so the recorder must
  say so plainly.
- Bluetooth headsets switch the input to the headset microphone (worse
  than the phone's). Say which input is in use.

## Testing

Chromium can fake the microphone for Playwright:
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
--use-file-for-fake-audio-capture=<wav>`, which plays a WAV as the input.
An end-to-end test can record the static test loop, save it and check the
demo appears with an MP3 rendition. iOS Safari needs a real phone: Kevin.

## Not in scope

Overdubs on stems, effects, and editing beyond a
trim. Those turn the app into a DAW; the demo is a memo.
